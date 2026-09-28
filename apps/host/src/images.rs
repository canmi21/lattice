//! The machine's images, why each is kept, and removing the ones nothing could run again. See
//! spec/architecture/host.md, "An image is kept while something could run it".

use crate::Host;
use crate::store::Deployed;
use deploy::engine::{Error, Image};
use serde::Serialize;
use std::collections::HashSet;

/// The repository keeper loads host's images under; they are keeper's to collect, never host's.
const KEEPERS: &str = "host/host:";

/// Why an image stays, or that nothing needs it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kept", rename_all = "lowercase")]
pub enum Kept {
	/// What an app runs now.
	Current { app: String },
	/// What an app goes back to on a rollback.
	Previous { app: String },
	/// A container is made from it, whoever started that container.
	Used,
	/// host's own, which keeper keeps and collects.
	Keeper,
	/// Nothing could run it again: collectable.
	No,
}

#[derive(Debug, Serialize)]
pub struct Listed {
	#[serde(flatten)]
	pub image: Image,
	#[serde(flatten)]
	pub kept: Kept,
}

pub fn kept(image: &Image, used: &HashSet<String>, apps: &[Deployed]) -> Kept {
	if let Some(app) = apps.iter().find(|app| app.image == image.id) {
		return Kept::Current { app: app.manifest.name.clone() };
	}
	let previous = apps.iter().find(|app| app.previous.as_ref().is_some_and(|p| p.image == image.id));
	if let Some(app) = previous {
		return Kept::Previous { app: app.manifest.name.clone() };
	}
	if used.contains(&image.id) {
		return Kept::Used;
	}
	if image.tags.iter().any(|tag| tag.starts_with(KEEPERS)) {
		return Kept::Keeper;
	}
	Kept::No
}

/// Every image, newest first, with why it stays.
pub async fn listed(host: &Host) -> anyhow::Result<Vec<Listed>> {
	let apps = host.store.apps()?;
	let used = host.engine.images_in_use().await?;
	let mut images = host.engine.images().await?;
	images.sort_by(|a, b| b.created.cmp(&a.created));
	Ok(
		images
			.into_iter()
			.map(|image| {
				let kept = kept(&image, &used, &apps);
				Listed { image, kept }
			})
			.collect(),
	)
}

#[derive(Debug, thiserror::Error)]
pub enum Refused {
	#[error("no image has this id")]
	Absent,
	#[error("the image is kept: {0:?}")]
	Kept(Kept),
	#[error(transparent)]
	Engine(#[from] Error),
	#[error(transparent)]
	Other(#[from] anyhow::Error),
}

/// Remove one image nothing needs. Taken under the deploy lock, so an image a deploy has loaded and
/// not yet run is never taken for one nothing needs.
pub async fn remove(host: &Host, id: &str) -> Result<(), Refused> {
	let _one = host.deploying.lock().await;
	let listed = listed(host).await?;
	let found = listed.into_iter().find(|listed| listed.image.id == id).ok_or(Refused::Absent)?;
	if found.kept != Kept::No {
		return Err(Refused::Kept(found.kept));
	}
	host.engine.remove_image(id).await?;
	Ok(())
}

#[derive(Debug, Serialize)]
pub struct Collected {
	pub removed: usize,
	/// Bytes given back, as Docker measures its images before and after; layers shared count once.
	pub freed: Option<u64>,
}

/// Remove every image nothing needs. One Docker refuses is left, and the rest still go.
pub async fn collect(host: &Host) -> anyhow::Result<Collected> {
	let _one = host.deploying.lock().await;
	let before = host.engine.images_size().await.ok().flatten();
	let mut removed = 0;
	for listed in listed(host).await?.into_iter().filter(|listed| listed.kept == Kept::No) {
		match host.engine.remove_image(&listed.image.id).await {
			Ok(()) => removed += 1,
			Err(error) => eprintln!("host: collecting {}: {error}", listed.image.id),
		}
	}
	let after = host.engine.images_size().await.ok().flatten();
	let freed = before.zip(after).map(|(before, after)| before.saturating_sub(after));
	Ok(Collected { removed, freed })
}

#[cfg(test)]
mod tests {
	use super::*;
	use deploy::{Manifest, Version};

	fn image(id: &str, tags: &[&str]) -> Image {
		Image {
			id: id.into(),
			tags: tags.iter().map(|tag| (*tag).into()).collect(),
			size: 1,
			created: 0,
		}
	}

	#[test]
	fn keeps_what_runs_what_a_rollback_needs_and_keepers_own() {
		let manifest = Manifest::parse(include_str!("../../geo/service.toml")).unwrap();
		let geo = Deployed {
			manifest: manifest.clone(),
			image: "sha256:now".into(),
			previous: Some(Version { manifest, image: "sha256:before".into() }),
			deployed_at: String::new(),
			held: false,
		};
		let used = HashSet::from(["sha256:gemini".to_owned()]);
		let apps = [geo];
		let geo = || "geo".to_owned();
		assert_eq!(kept(&image("sha256:now", &[]), &used, &apps), Kept::Current { app: geo() });
		assert_eq!(kept(&image("sha256:before", &[]), &used, &apps), Kept::Previous { app: geo() });
		assert_eq!(kept(&image("sha256:gemini", &[]), &used, &apps), Kept::Used);
		assert_eq!(kept(&image("sha256:h", &["host/host:7b124ca8a7b7"]), &used, &apps), Kept::Keeper);
		for collectable in [image("sha256:old", &["host/geo:0f939c217676"]), image("sha256:d", &[])] {
			assert_eq!(kept(&collectable, &used, &apps), Kept::No);
		}
	}
}
