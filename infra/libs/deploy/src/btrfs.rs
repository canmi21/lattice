//! The three btrfs operations the platform needs, made directly as the kernel's ioctls rather than
//! by running `btrfs`: an image built from scratch has no `btrfs` to run, and a call with a path in
//! a struct has no command line to inject into. The numbers and layouts are the kernel's UAPI,
//! `include/uapi/linux/btrfs.h`, and the tests below hold them to it.

use std::fs::File;
use std::os::fd::AsRawFd;
use std::path::{Path, PathBuf};

/// `BTRFS_IOCTL_MAGIC`.
const MAGIC: u64 = 0x94;
/// `BTRFS_PATH_NAME_MAX + 1`, the name field of `btrfs_ioctl_vol_args`.
const PATH_NAME: usize = 4088;
/// `BTRFS_SUBVOL_NAME_MAX + 1`, the name field of `btrfs_ioctl_vol_args_v2`.
const SUBVOL_NAME: usize = 4040;
/// `BTRFS_SUBVOL_RDONLY`.
const READ_ONLY: u64 = 1 << 1;

/// `_IOW(MAGIC, number, size)`, as the generic Linux ioctl encoding lays it out.
const fn write_ioctl(number: u64, size: usize) -> u64 {
	(1 << 30) | ((size as u64) << 16) | (MAGIC << 8) | number
}

/// `struct btrfs_ioctl_vol_args`.
#[repr(C)]
struct VolumeArgs {
	fd: i64,
	name: [u8; PATH_NAME],
}

/// `struct btrfs_ioctl_vol_args_v2`, with its two unions written out at their full width.
#[repr(C)]
struct VolumeArgsV2 {
	fd: i64,
	transid: u64,
	flags: u64,
	unused: [u64; 4],
	name: [u8; SUBVOL_NAME],
}

const SUBVOL_CREATE: u64 = write_ioctl(14, size_of::<VolumeArgs>());
const SNAP_DESTROY: u64 = write_ioctl(15, size_of::<VolumeArgs>());
const SNAP_CREATE_V2: u64 = write_ioctl(23, size_of::<VolumeArgsV2>());

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("{operation} {path}: {source}")]
	Call { operation: &'static str, path: PathBuf, source: std::io::Error },
	#[error("{0} names no subvolume inside a directory")]
	NoName(PathBuf),
}

/// The directory a subvolume lives in, opened, and its own name as the kernel wants it.
fn split(path: &Path, operation: &'static str) -> Result<(File, Vec<u8>), Error> {
	let name = path.file_name().ok_or_else(|| Error::NoName(path.into()))?;
	let parent = path.parent().ok_or_else(|| Error::NoName(path.into()))?;
	let directory =
		File::open(parent).map_err(|source| Error::Call { operation, path: parent.into(), source })?;
	Ok((directory, name.as_encoded_bytes().to_vec()))
}

/// Copy `name` into a fixed field, which must keep a terminating zero.
fn field<const N: usize>(
	name: &[u8],
	path: &Path,
	operation: &'static str,
) -> Result<[u8; N], Error> {
	let mut bytes = [0u8; N];
	if name.len() >= N || name.contains(&0) {
		let source = std::io::Error::from(std::io::ErrorKind::InvalidInput);
		return Err(Error::Call { operation, path: path.into(), source });
	}
	bytes[..name.len()].copy_from_slice(name);
	Ok(bytes)
}

/// The one unsafe line: the kernel reads, and for a snapshot writes, the struct it is handed.
fn call<T>(
	directory: &File,
	request: u64,
	args: &mut T,
	path: &Path,
	operation: &'static str,
) -> Result<(), Error> {
	// SAFETY: `args` is a live, correctly laid out `repr(C)` struct of exactly the size encoded in
	// `request`, and `directory` stays open for the duration of the call.
	let result = unsafe { libc::ioctl(directory.as_raw_fd(), request as _, args as *mut T) };
	if result < 0 {
		return Err(Error::Call {
			operation,
			path: path.into(),
			source: std::io::Error::last_os_error(),
		});
	}
	Ok(())
}

/// `btrfs subvolume create`.
pub fn create(path: &Path) -> Result<(), Error> {
	let operation = "creating subvolume";
	let (directory, name) = split(path, operation)?;
	let mut args = VolumeArgs { fd: 0, name: field(&name, path, operation)? };
	call(&directory, SUBVOL_CREATE, &mut args, path, operation)
}

/// `btrfs subvolume snapshot [-r]`: `target` becomes a snapshot of the subvolume at `source`.
pub fn snapshot(source: &Path, target: &Path, read_only: bool) -> Result<(), Error> {
	let operation = "snapshotting";
	let from =
		File::open(source).map_err(|e| Error::Call { operation, path: source.into(), source: e })?;
	let (directory, name) = split(target, operation)?;
	let mut args = VolumeArgsV2 {
		fd: i64::from(from.as_raw_fd()),
		transid: 0,
		flags: if read_only { READ_ONLY } else { 0 },
		unused: [0; 4],
		name: field(&name, target, operation)?,
	};
	call(&directory, SNAP_CREATE_V2, &mut args, target, operation)
}

/// `btrfs subvolume delete`: the whole subvolume, contents and all.
pub fn delete(path: &Path) -> Result<(), Error> {
	let operation = "deleting subvolume";
	let (directory, name) = split(path, operation)?;
	let mut args = VolumeArgs { fd: 0, name: field(&name, path, operation)? };
	call(&directory, SNAP_DESTROY, &mut args, path, operation)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_layouts_are_the_kernels() {
		// Both argument structs are one page, which is what the UAPI header states them to be.
		assert_eq!(size_of::<VolumeArgs>(), 4096);
		assert_eq!(size_of::<VolumeArgsV2>(), 4096);
	}

	#[test]
	fn the_numbers_are_the_kernels() {
		// As `btrfs-progs` and strace print them on Linux.
		assert_eq!(SUBVOL_CREATE, 0x5000_940e);
		assert_eq!(SNAP_DESTROY, 0x5000_940f);
		assert_eq!(SNAP_CREATE_V2, 0x5000_9417);
	}

	#[test]
	fn a_name_keeps_its_terminating_zero() {
		let path = Path::new("/x");
		assert!(field::<4>(b"abc", path, "test").is_ok());
		assert!(field::<4>(b"abcd", path, "test").is_err());
		assert!(field::<8>(b"a\0b", path, "test").is_err());
	}
}
