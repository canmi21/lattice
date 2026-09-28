//! Which addresses the public may have a capture reach: those routed across the internet, and none
//! that is this machine, its LAN, a carrier's shared space or anything reserved. See
//! spec/architecture/shot.md, "Only public addresses".

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

pub fn public(address: IpAddr) -> bool {
	match address {
		IpAddr::V4(v4) => public_v4(v4),
		IpAddr::V6(v6) => public_v6(v6),
	}
}

fn public_v4(address: Ipv4Addr) -> bool {
	let [a, b, c, _] = address.octets();
	let reserved = a == 0 // this network
		|| a == 10 // private
		|| a == 127 // loopback
		|| (a == 100 && (64..=127).contains(&b)) // shared by carriers, and the tailnet
		|| (a == 169 && b == 254) // link-local
		|| (a == 172 && (16..=31).contains(&b)) // private
		|| (a == 192 && b == 0 && c == 0) // protocol assignments
		|| (a == 192 && b == 0 && c == 2) // documentation
		|| (a == 192 && b == 88 && c == 99) // 6to4 relay
		|| (a == 192 && b == 168) // private
		|| (a == 198 && (18..=19).contains(&b)) // benchmarking
		|| (a == 198 && b == 51 && c == 100) // documentation
		|| (a == 203 && b == 0 && c == 113) // documentation
		|| a >= 224; // multicast, reserved and broadcast
	!reserved
}

fn public_v6(address: Ipv6Addr) -> bool {
	// An IPv4 address carried inside an IPv6 one is judged as the IPv4 address it is.
	if let Some(v4) = address.to_ipv4_mapped() {
		return public_v4(v4);
	}
	let segments = address.segments();
	// NAT64's well-known prefix, 64:ff9b::/96, reaches the IPv4 address in its last 32 bits.
	if segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
		let [.., high, low] = segments;
		return public_v4(Ipv4Addr::from((u32::from(high) << 16) | u32::from(low)));
	}
	// Only global unicast, 2000::/3, is routed across the internet; documentation sits inside it.
	let global = segments[0] & 0xe000 == 0x2000;
	let documentation = segments[0] == 0x2001 && segments[1] == 0x0db8;
	global && !documentation
}

#[cfg(test)]
mod tests {
	use super::*;

	fn judged(text: &str) -> bool {
		public(text.parse().unwrap())
	}

	#[test]
	fn lets_through_what_the_internet_routes() {
		for address in
			["1.1.1.1", "8.8.8.8", "104.16.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]
		{
			assert!(judged(address), "{address}");
		}
	}

	#[test]
	fn keeps_out_this_machine_its_networks_and_anything_reserved() {
		for address in [
			"0.0.0.0",
			"10.10.10.11",
			"127.0.0.1",
			"100.64.0.1",
			"100.100.100.100",
			"169.254.169.254",
			"172.16.0.1",
			"172.31.255.255",
			"192.0.0.1",
			"192.0.2.1",
			"192.168.1.1",
			"198.18.0.1",
			"198.51.100.1",
			"203.0.113.1",
			"224.0.0.1",
			"255.255.255.255",
			"::",
			"::1",
			"fc00::1",
			"fd12:3456::1",
			"fe80::1",
			"ff02::1",
			"2001:db8::1",
			"::ffff:10.0.0.1",
			"::ffff:127.0.0.1",
			"64:ff9b::a00:1",
		] {
			assert!(!judged(address), "{address}");
		}
		// The edges of the private ranges are not inside them.
		for address in [
			"172.15.255.255",
			"172.32.0.1",
			"100.63.255.255",
			"100.128.0.1",
			"::ffff:1.1.1.1",
			"64:ff9b::101:101",
		] {
			assert!(judged(address), "{address}");
		}
	}
}
