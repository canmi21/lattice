//! The two GeoLite2 databases, held as a pair and swapped only once a fetch has proved a new file
//! readable. See spec/architecture/geo.md, "geo fetches it itself, at run time, once a day".

use arc_swap::ArcSwapOption;
use std::sync::Arc;
use whereabouts::ip::Databases;

/// Empty until the first fetch succeeds. A failed fetch never clears it, so a lookup always sees
/// the last file that was proved readable.
#[derive(Default)]
pub struct Store(ArcSwapOption<Databases>);

impl Store {
	pub fn get(&self) -> Option<Arc<Databases>> {
		self.0.load_full()
	}

	pub fn set(&self, databases: Databases) {
		self.0.store(Some(Arc::new(databases)));
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn answers_nothing_until_something_is_set() {
		let store = Store::default();
		assert!(store.get().is_none());
	}
}
