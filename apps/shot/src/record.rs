//! What `status?task=<id>` answers with once a capture is settled: built once, answered from
//! memory while the queue remembers it, and kept on disk as `<id>.json` for after. See
//! spec/architecture/shot.md, "What an answer tells" and "Kept on disk, four gigabytes, oldest
//! first".

use crate::queue::{Details, Made};
use serde_json::Value;
use uuid::Uuid;

/// Milliseconds from one moment to a later one, when both happened.
fn between(from: Option<jiff::Timestamp>, to: Option<jiff::Timestamp>) -> Option<i64> {
	Some(to?.duration_since(from?).as_millis() as i64)
}

/// When each thing happened to a capture, and what it asked for. The store rolls, so nothing here
/// says when it will be gone.
fn story(details: &Details) -> (Value, Value) {
	let task = serde_json::json!({
		"asked_at": details.asked_at,
		"started_at": details.started_at,
		"finished_at": details.finished_at,
		"queued_ms": between(Some(details.asked_at), details.started_at),
		"rendered_ms": between(details.started_at, details.finished_at),
	});
	let asked = &details.asked;
	let request = serde_json::json!({
		"url": asked.url.as_str(),
		"width": asked.width,
		"height": asked.height,
		"full": asked.full,
		"timeout": f64::from(asked.timeout) / 1000.0,
		"delay": f64::from(asked.delay) / 1000.0,
		"insecure": asked.insecure,
		"internal": asked.internal,
		"javascript": asked.javascript,
		// Not part of `Asked`, so not part of what makes two asks one; told all the same.
		"fresh": details.fresh,
	});
	(task, request)
}

/// A done capture, all it found. Pictures are named by shot's public address. See
/// spec/architecture/shot.md, "A picture is named by its whole public address".
pub fn done(id: Uuid, made: &Made, details: &Details) -> Value {
	let (task, request) = story(details);
	let mut body = serde_json::json!({
		"id": id,
		"state": "done",
		"png": format!("{}/pictures/{id}.png", urls::INTERNAL_SHOT),
		"webp": made.pictures.webp_bytes.map(|_| format!("{}/pictures/{id}.webp", urls::INTERNAL_SHOT)),
		"task": task,
		"request": request,
		"pictures": made.pictures,
	});
	// What the page did sits beside the rest: `page`, `load`, `connection`, `health`.
	if let (Some(body), Value::Object(observed)) = (body.as_object_mut(), &made.observed) {
		body.extend(observed.clone());
	}
	body
}

/// A failed capture: why, and its story, which only the disk keeps; a caller is told the why alone.
pub fn failed(id: Uuid, reason: &str, details: &Details) -> Value {
	let (task, request) = story(details);
	serde_json::json!({
		"id": id,
		"state": "failed",
		"reason": reason,
		"task": task,
		"request": request,
	})
}

/// When a record says its capture finished.
pub fn finished_at(record: &Value) -> Option<jiff::Timestamp> {
	record["task"]["finished_at"].as_str()?.parse().ok()
}
