use super::*;

#[test]
fn an_attached_image_cannot_swallow_the_prompt() {
	// `--image` takes `<FILE>...`. Without the terminator it took the prompt as a second
	// file, and codex went looking for the prompt on a closed stdin -- reporting that
	// nothing arrived there rather than that a flag had eaten it. Every image tagged in one
	// run failed identically before this was found.
	let args = codex_args("describe this", "gpt-5.6-terra-medium", &[Path::new("/a.png")]);
	let end = &args[args.len() - 2..];
	assert_eq!(end, ["--", "describe this"]);

	// The terminator holds with no image too, where a prompt beginning with a dash would
	// otherwise be read as a flag.
	let bare = codex_args("--not-a-flag", "gpt-5.6-terra-medium", &[]);
	assert_eq!(&bare[bare.len() - 2..], ["--", "--not-a-flag"]);
	assert!(!bare.contains(&OsString::from("--image")));
}

#[test]
fn codex_is_given_the_effort_apart_from_the_model() {
	// It rejects `gpt-5.6-terra-medium` as a model name and takes the effort as a config
	// override instead. Everywhere else the tier is one string, so the split lives here.
	assert_eq!(split_effort("gpt-5.6-terra-medium"), ("gpt-5.6-terra", Some("medium")));
	assert_eq!(split_effort("gpt-5.6-luna-high"), ("gpt-5.6-luna", Some("high")));
	// A name that merely ends in a word is not an effort.
	assert_eq!(split_effort("gpt-5.6-sol"), ("gpt-5.6-sol", None));
	assert_eq!(split_effort("gpt-5.6-sol-xhigh"), ("gpt-5.6-sol", Some("xhigh")));

	let args = codex_args("hi", "gpt-5.6-terra-medium", &[]);
	assert!(args.contains(&OsString::from("gpt-5.6-terra")));
	assert!(args.contains(&OsString::from("model_reasoning_effort=medium")));
	assert!(!args.contains(&OsString::from("gpt-5.6-terra-medium")));
}

#[test]
fn an_explicit_codex_model_can_carry_an_explicit_effort() {
	assert_eq!(
		model_override(Runner::Codex, Some("gpt-5.6-sol"), Some("xhigh")).unwrap(),
		Some("gpt-5.6-sol-xhigh".to_owned())
	);
	assert_eq!(model_override(Runner::Codex, None, None).unwrap(), None);
	assert!(model_override(Runner::GptOss, Some("gpt-5.6-sol"), None).is_err());
	assert!(model_override(Runner::Codex, None, Some("xhigh")).is_err());

	let args = codex_args("translate", "gpt-5.6-sol-xhigh", &[]);
	assert!(args.contains(&OsString::from("gpt-5.6-sol")));
	assert!(args.contains(&OsString::from("model_reasoning_effort=xhigh")));
}

#[test]
fn the_reason_a_turn_failed_is_read_off_the_stream() {
	// stderr says only "Reading additional input from stdin...", which it also says on a
	// run that works. Reporting that instead of this is reporting nothing.
	let stream = concat!(
		r#"{"type":"thread.started","thread_id":"x"}"#,
		"\n",
		r#"{"type":"error","message":"{\"error\":{\"message\":\"model not supported\"}}"}"#,
		"\n"
	);
	assert_eq!(codex_error(stream.as_bytes()).as_deref(), Some("model not supported"));

	// A plain message survives the unwrapping attempt intact.
	let plain = "{\"type\":\"error\",\"message\":\"stream disconnected\"}\n";
	assert_eq!(codex_error(plain.as_bytes()).as_deref(), Some("stream disconnected"));
	assert_eq!(codex_error(b"{\"type\":\"turn.completed\"}\n"), None);
}

#[test]
fn a_runner_is_named_the_way_a_person_would_type_it() {
	assert_eq!(Runner::parse("claude"), Some(Runner::Claude));
	assert_eq!(Runner::parse("Gemini"), Some(Runner::Gemini));
	// The binary is `agy`, and somebody will reach for that name.
	assert_eq!(Runner::parse("agy"), Some(Runner::Gemini));
	assert_eq!(Runner::parse("codex"), Some(Runner::Codex));
	assert_eq!(Runner::parse("cursor-agent"), Some(Runner::Cursor));
	assert_eq!(Runner::parse("grok"), Some(Runner::Grok));
	assert_eq!(Runner::parse("gpt"), None);
}

#[test]
fn tiered_runners_have_the_same_three_roles() {
	for runner in [Runner::Claude, Runner::Gemini, Runner::Codex] {
		let light = runner.model_for(Kind::Heading, 0);
		let standard = runner.model_for(Kind::Prose, 0);
		let strong = runner.model_for(Kind::Prose, 2);
		assert_ne!(light, standard);
		assert_ne!(standard, strong);
	}
}

#[test]
fn codex_uses_the_three_requested_tiers() {
	assert_eq!(Runner::Codex.model_for(Kind::Heading, 0), "gpt-5.6-luna-medium");
	assert_eq!(Runner::Codex.model_for(Kind::Prose, 0), "gpt-5.6-terra-medium");
	assert_eq!(Runner::Codex.model_for(Kind::Prose, 2), "gpt-5.6-terra-high");
}

#[test]
fn cursor_only_offers_composer() {
	for kind in [Kind::Heading, Kind::Prose] {
		assert_eq!(Runner::Cursor.model_for(kind, 0), "composer-2.5");
		assert_eq!(Runner::Cursor.model_for(kind, 2), "composer-2.5");
	}
	assert_eq!(Runner::Cursor.model_for_vision(), Some("composer-2.5"));
}

#[test]
fn grok_uses_the_two_requested_tiers() {
	assert_eq!(Runner::Grok.model_for(Kind::Heading, 0), "grok-4.5");
	assert_eq!(Runner::Grok.model_for(Kind::Prose, 0), "grok-4.6");
	assert_eq!(Runner::Grok.model_for(Kind::Prose, 1), "grok-4.6");
	assert_eq!(Runner::Grok.model_for(Kind::Prose, 2), "grok-4.6");
	assert_eq!(Runner::Grok.model_for_scan(), "grok-4.6");
}

#[test]
fn grok_is_given_the_model_on_the_command_line() {
	// Same shape as Codex and Cursor: the id is a flag. A prompt-only invocation would
	// silently run the CLI default instead of the tier this file chose.
	let args = grok_args("translate this", "grok-4.5");
	assert!(args.contains(&OsString::from("-m")));
	assert!(args.contains(&OsString::from("grok-4.5")));
	assert!(args.contains(&OsString::from("-p")));
	assert!(args.contains(&OsString::from("translate this")));
	assert!(args.contains(&OsString::from(GROK_TRANSFORM_SYSTEM)));
	assert!(args.contains(&OsString::from("--verbatim")));
	assert!(args.contains(&OsString::from("--tools")));
	assert!(args.contains(&OsString::from("dontAsk")));
	assert!(!args.contains(&OsString::from("--prompt-json")));
}

#[test]
fn grok_accepts_extra_flags_after_the_common_ones() {
	// Twitter lookups pass these; translation does not. The common shape stays in one
	// function so a second binding cannot drift. See spec/twitter.md.
	let args = grok_text_args("find this", "grok-4.6", &["--disable-web-search", "--max-turns", "8"]);
	assert!(args.contains(&OsString::from("--disable-web-search")));
	assert!(args.contains(&OsString::from("--max-turns")));
	assert!(args.contains(&OsString::from("8")));
	assert!(args.contains(&OsString::from("bypassPermissions")));
	assert!(!args.contains(&OsString::from(GROK_TRANSFORM_SYSTEM)));
}

#[test]
fn grok_attaches_an_image_as_a_content_block() {
	// `--prompt-json` is how the image lands. `-p` cannot carry it, and the help text
	// does not document the block shape -- `data` and `mimeType` sit at the top; a
	// nested Anthropic `source` is rejected.
	let args = grok_vision_args("what is this", "grok-4.6", "image/png", "QUJD");
	assert!(args.contains(&OsString::from("--prompt-json")));
	assert!(!args.contains(&OsString::from("-p")));
	assert!(args.contains(&OsString::from("-m")));
	assert!(args.contains(&OsString::from("grok-4.6")));
	assert!(args.contains(&OsString::from(GROK_TRANSFORM_SYSTEM)));
	assert!(args.contains(&OsString::from("--tools")));

	let json = args
		.iter()
		.position(|arg| arg == "--prompt-json")
		.and_then(|at| args.get(at + 1))
		.expect("prompt-json value");
	let blocks: serde_json::Value =
		serde_json::from_str(&json.to_string_lossy()).expect("prompt-json");
	assert_eq!(blocks[0]["type"], "image");
	assert_eq!(blocks[0]["mimeType"], "image/png");
	assert_eq!(blocks[0]["data"], "QUJD");
	assert!(blocks[0].get("source").is_none());
	assert_eq!(blocks[1]["type"], "text");
	assert_eq!(blocks[1]["text"], "what is this");
}

#[test]
fn text_and_vision_have_separate_defaults() {
	assert_eq!(DEFAULT_TEXT, Runner::GptOss);
	assert_eq!(DEFAULT_VISION, Runner::Codex);
	assert_eq!(DEFAULT_VISION.model_for_vision(), Some("gpt-5.6-terra-medium"));

	// The open-weight model is text only, and saying so is the whole reason this returns an
	// option. Measured: asked to look at a file it cancels the turn and fills in no error,
	// so a caller handed a model name anyway would see an empty answer and no cause.
	assert_eq!(Runner::GptOss.model_for_vision(), None);
	// Both Grok tiers can see. Vision is quality work, so it takes the prose model.
	assert_eq!(Runner::Grok.model_for_vision(), Some("grok-4.6"));
}

#[test]
fn a_codex_event_stream_yields_the_answer_and_usage() {
	let events = br#"{"type":"thread.started","thread_id":"1"}
{"type":"item.completed","item":{"type":"agent_message","text":"done"}}
{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":3}}
"#;
	assert_eq!(codex_result(events).unwrap(), ("done".to_owned(), 15));
}

#[test]
fn gemini_spells_effort_into_the_model_id() {
	// `agy` takes --effort separately, but its model list already carries the tier, so one
	// string says both and there is no second flag to keep in step.
	assert_eq!(Runner::Gemini.model_for(Kind::Prose, 0), "gemini-3.6-flash-high");
	assert_eq!(Runner::Gemini.model_for(Kind::Prose, 2), "gemini-3.1-pro-high");
}

#[test]
fn a_gemini_model_normalises_to_the_recorded_spelling() {
	// Dots to hyphens, like every other id this project stores.
	assert_eq!(
		model::normalise(Runner::Gemini.model_for(Kind::Heading, 0)),
		"gemini-3-6-flash-medium"
	);
}

#[test]
fn a_grok_model_normalises_to_the_recorded_spelling() {
	assert_eq!(model::normalise(Runner::Grok.model_for(Kind::Heading, 0)), "grok-4-5");
	assert_eq!(model::normalise(Runner::Grok.model_for(Kind::Prose, 0)), "grok-4-6");
}

#[test]
fn a_reset_time_is_read_from_the_message() {
	use std::time::Duration;
	assert_eq!(resets_in("Resets in 0s."), Some(Duration::from_secs(0)));
	assert_eq!(resets_in("Resets in 90s."), Some(Duration::from_secs(90)));
	assert_eq!(
		resets_in("Resets in 167h29m42s."),
		Some(Duration::from_secs(167 * 3600 + 29 * 60 + 42))
	);
	assert_eq!(resets_in("no reset mentioned"), None);
}

#[test]
fn congestion_and_a_spent_allowance_are_told_apart() {
	// They look alike: exit 1, status ERROR, a sentence about capacity. Only the reset
	// separates them, and getting it wrong means either giving up an hour early or
	// hammering a dead account for the rest of the week.
	let busy = "Encountered retryable error from model provider: You have exhausted your \
	            capacity on this model. Resets in 0s.";
	let spent = "Individual quota reached. Please upgrade your subscription to increase \
	             your limits. Resets in 167h29m42s.";
	assert!(matches!(classify(busy), Refusal::Throttled(_)));
	assert!(matches!(classify(spent), Refusal::Exhausted(_)));
	// Anything not about capacity stays an ordinary failure.
	assert!(matches!(classify("malformed request"), Refusal::Failed(_)));
}

#[test]
fn each_runner_names_its_own_provider() {
	assert_eq!(Runner::Claude.provider(), "anthropic");
	assert_eq!(Runner::Gemini.provider(), "google");
	assert_eq!(Runner::GptOss.provider(), "openai");
	assert_eq!(Runner::Codex.provider(), "openai");
	assert_eq!(Runner::Cursor.provider(), "cursor");
	assert_eq!(Runner::Grok.provider(), "xai");
}
