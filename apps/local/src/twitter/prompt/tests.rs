use super::*;
use crate::twitter::{Mode, Semantic};

fn reply(parts: &[&str]) -> String {
	parts.join("\n")
}

#[test]
fn a_user_reply_is_read_field_by_field() {
	let text = reply(&[
		&mark("count"),
		"1",
		&mark("user"),
		&mark("id"),
		"1598664232228339721",
		&mark("username"),
		"Canmirex",
		&mark("name"),
		"Canmirex",
		&mark("bio"),
		"Graphic Design & AI",
		&mark("followers"),
		"8518",
	]);
	let (users, rejected) = parse_users(&text, None).expect("reply");
	assert_eq!(rejected, 0);
	assert_eq!(users[0].username, "Canmirex");
	assert_eq!(users[0].followers, 8518);
}

#[test]
fn a_short_user_id_is_accepted() {
	// User ids predate the 19-digit post snowflake. Digits are enough; a fixed width
	// would reject living accounts.
	let text = reply(&[
		&mark("count"),
		"1",
		&mark("user"),
		&mark("id"),
		"3091974750",
		&mark("username"),
		"old",
		&mark("name"),
		"Old",
		&mark("bio"),
		"",
		&mark("followers"),
		"12",
	]);
	let (users, rejected) = parse_users(&text, None).expect("reply");
	assert_eq!(rejected, 0);
	assert_eq!(users[0].id, "3091974750");
}

#[test]
fn multi_line_text_survives_the_scan() {
	let text = reply(&[
		&mark("count"),
		"1",
		&mark("post"),
		&mark("id"),
		"2087719963553329562",
		&mark("author"),
		"canmi21",
		&mark("text"),
		"line one",
		"",
		"line two",
		&mark("created"),
		"Thu, 13 Aug 2026 01:56:41 GMT",
		&mark("likes"),
		"1",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
	]);
	let (posts, rejected) = parse_posts(&text, false, false, None).expect("reply");
	assert_eq!(rejected, 0);
	assert_eq!(posts[0].text, "line one\n\nline two");
}

#[test]
fn post_text_may_hold_quotes_urls_and_brackets() {
	// The reason not to ask for JSON: one escaping mistake would lose the record.
	let body = r#"see "this" (and {that}) https://example.com/a [1]"#;
	let text = reply(&[
		&mark("count"),
		"1",
		&mark("post"),
		&mark("id"),
		"2087719963553329562",
		&mark("author"),
		"canmi21",
		&mark("text"),
		body,
		&mark("created"),
		"now",
		&mark("likes"),
		"0",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
	]);
	let (posts, _) = parse_posts(&text, false, false, None).expect("reply");
	assert_eq!(posts[0].text, body);
}

#[test]
fn one_broken_record_costs_one_record() {
	let text = reply(&[
		&mark("count"),
		"3",
		&mark("post"),
		&mark("id"),
		"2087719963553329562",
		&mark("author"),
		"good",
		&mark("text"),
		"ok",
		&mark("created"),
		"now",
		&mark("likes"),
		"1",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
		&mark("post"),
		&mark("id"),
		"not-a-snowflake",
		&mark("author"),
		"bad",
		&mark("text"),
		"no",
		&mark("created"),
		"now",
		&mark("likes"),
		"1",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
		&mark("post"),
		&mark("id"),
		"2087719963553329563",
		&mark("author"),
		"also",
		&mark("text"),
		"ok",
		&mark("created"),
		"now",
		&mark("likes"),
		"2",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
	]);
	let (posts, rejected) = parse_posts(&text, false, false, None).expect("reply");
	assert_eq!(rejected, 1);
	assert_eq!(posts.len(), 2);
	assert_eq!(posts[0].author, "good");
	assert_eq!(posts[1].author, "also");
}

#[test]
fn a_garbled_number_rejects_only_that_record() {
	let text = reply(&[
		&mark("count"),
		"2",
		&mark("user"),
		&mark("id"),
		"1",
		&mark("username"),
		"ok",
		&mark("name"),
		"Ok",
		&mark("bio"),
		"",
		&mark("followers"),
		"3",
		&mark("user"),
		&mark("id"),
		"2",
		&mark("username"),
		"bad",
		&mark("name"),
		"Bad",
		&mark("bio"),
		"",
		&mark("followers"),
		"twelve",
	]);
	let (users, rejected) = parse_users(&text, None).expect("reply");
	assert_eq!(rejected, 1);
	assert_eq!(users.len(), 1);
	assert_eq!(users[0].username, "ok");
}

#[test]
fn a_dropped_record_fails_the_reply() {
	let text = reply(&[
		&mark("count"),
		"2",
		&mark("user"),
		&mark("id"),
		"1",
		&mark("username"),
		"only",
		&mark("name"),
		"Only",
		&mark("bio"),
		"",
		&mark("followers"),
		"1",
	]);
	assert_eq!(parse_users(&text, None), Err(ParseError::CountMismatch { declared: 2, found: 1 }));
}

#[test]
fn a_missing_count_fails_the_reply() {
	let text = reply(&[&mark("user"), &mark("id"), "1"]);
	assert_eq!(parse_users(&text, None), Err(ParseError::MissingCount));
}

#[test]
fn an_empty_result_is_a_count_of_zero() {
	let text = reply(&[&mark("count"), "0"]);
	let (users, rejected) = parse_users(&text, None).expect("empty");
	assert!(users.is_empty());
	assert_eq!(rejected, 0);
}

#[test]
fn a_preamble_is_ignored() {
	let text = reply(&["Here are the accounts:", &mark("count"), "0"]);
	assert!(parse_users(&text, None).expect("preamble").0.is_empty());
}

#[test]
fn a_preamble_glued_to_the_first_marker_is_still_a_marker() {
	// Measured: workspace voice made the model write a Chinese sentence and
	// the count marker on one line. Requiring the marker to be the whole
	// line lost a complete, well-formed reply.
	let text = reply(&[
		&format!("先转写结果。{}", mark("count")),
		"1",
		&mark("user"),
		&mark("id"),
		"1",
		&mark("username"),
		"canmi",
		&mark("name"),
		"Canmi",
		&mark("bio"),
		"",
		&mark("followers"),
		"4",
	]);
	let (users, rejected) = parse_users(&text, None).expect("glued");
	assert_eq!(rejected, 0);
	assert_eq!(users[0].username, "canmi");
}

#[test]
fn a_fence_echo_rejects_the_reply() {
	let fence = "VVF4KTLBKEI0X2NJT7FOCD2N6HO4C0N2";
	let text = reply(&[&mark("count"), "0", fence]);
	assert_eq!(parse_users(&text, Some(fence)), Err(ParseError::BoundaryLeak));
}

#[test]
fn a_thread_root_has_an_empty_parent() {
	let text = reply(&[
		&mark("count"),
		"2",
		&mark("post"),
		&mark("id"),
		"2087719963553329562",
		&mark("author"),
		"root",
		&mark("text"),
		"hello",
		&mark("created"),
		"now",
		&mark("likes"),
		"0",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"1",
		&mark("parent"),
		"",
		&mark("post"),
		&mark("id"),
		"2087719963553329563",
		&mark("author"),
		"child",
		&mark("text"),
		"hi",
		&mark("created"),
		"now",
		&mark("likes"),
		"0",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
		&mark("parent"),
		"2087719963553329562",
	]);
	let (posts, rejected) = parse_posts(&text, false, true, None).expect("thread");
	assert_eq!(rejected, 0);
	assert_eq!(posts[0].parent, None);
	assert_eq!(posts[1].parent.as_deref(), Some("2087719963553329562"));
}

#[test]
fn semantic_posts_need_a_numeric_score() {
	let text = reply(&[
		&mark("count"),
		"1",
		&mark("post"),
		&mark("id"),
		"2087719963553329562",
		&mark("author"),
		"a",
		&mark("text"),
		"t",
		&mark("created"),
		"now",
		&mark("likes"),
		"0",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
		&mark("score"),
		"0.1",
	]);
	let (posts, rejected) = parse_posts(&text, true, false, None).expect("score");
	assert_eq!(rejected, 0);
	assert_eq!(posts[0].score, Some(0.1));

	let missing = reply(&[
		&mark("count"),
		"1",
		&mark("post"),
		&mark("id"),
		"2087719963553329562",
		&mark("author"),
		"a",
		&mark("text"),
		"t",
		&mark("created"),
		"now",
		&mark("likes"),
		"0",
		&mark("reposts"),
		"0",
		&mark("replies"),
		"0",
	]);
	let (posts, rejected) = parse_posts(&missing, true, false, None).expect("no score");
	assert!(posts.is_empty());
	assert_eq!(rejected, 1);
}

#[test]
fn a_user_request_names_the_tool_and_fences_the_query() {
	let request = users_request("canmi", 3);
	assert!(request.text.contains("x_user_search"));
	assert!(request.text.contains("count: 3"));
	assert!(request.text.contains(&mark("count")));
	assert!(request.text.contains(&mark("user")));
	let fences: Vec<&str> = request.text.lines().filter(|line| *line == request.boundary).collect();
	assert_eq!(fences.len(), 2);
	let start = request.text.find(&request.boundary).expect("fence");
	let body = &request.text[start + request.boundary.len()..];
	assert!(body.contains("canmi"));
}

#[test]
fn a_keyword_request_keeps_search_operators() {
	let request = keyword_request("from:canmi21 rust", 5, Mode::Latest);
	assert!(request.text.contains("x_keyword_search"));
	assert!(request.text.contains("from:username"));
	assert!(request.text.contains("mode: Latest"));
	assert!(request.text.contains("from:canmi21 rust"));
}

#[test]
fn a_semantic_request_states_the_threshold() {
	let request = semantic_request(&Semantic {
		query: "local rust".into(),
		limit: 3,
		from_date: Some("2026-01-01".into()),
		to_date: None,
		usernames: vec!["canmi21".into()],
		exclude_usernames: Vec::new(),
		min_score: 0.1,
	});
	assert!(request.text.contains("x_semantic_search"));
	assert!(request.text.contains("min_score_threshold: 0.1"));
	assert!(request.text.contains("Do not use the tool's own default"));
	assert!(request.text.contains("from_date: 2026-01-01"));
	assert!(request.text.contains("usernames: canmi21"));
	assert!(!request.text.contains("to_date:"));
	assert!(!request.text.contains("exclude_usernames:"));
	assert!(request.text.contains(&mark("score")));
}

#[test]
fn a_thread_request_asks_for_the_reply_tree() {
	let request = thread_request("2087719963553329562");
	assert!(request.text.contains("x_thread_fetch"));
	assert!(request.text.contains(&mark("parent")));
	assert!(request.text.contains("2087719963553329562"));
}
