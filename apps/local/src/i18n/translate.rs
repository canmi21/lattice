//! Translating one segment into every locale it is missing, and one display string into
//! the locales asked for, each with its retries. `run` in `mod.rs` drives both.

use super::*;

/// Translate one segment into every locale it is missing.
#[derive(Clone)]
pub(super) struct TranslationOptions {
	pub(super) runner: Runner,
	pub(super) model_override: Option<String>,
	pub(super) locales: Vec<String>,
	pub(super) source_locale: Option<String>,
	pub(super) gloss: Option<tn::Entry>,
}

pub(super) async fn translate(
	item: &Segment,
	before: Option<String>,
	after: Option<String>,
	options: TranslationOptions,
) -> Result<(Vec<(String, Translation)>, u64, f64, Vec<String>), Refusal> {
	let masked = segment::mask(&item.source);
	let mut last = Refusal::Failed(String::new());
	let mut attempt = 0usize;
	let mut backoff = BACKOFF_START;
	let mut pending = options.locales;
	let mut entries = Vec::new();
	let mut total_tokens = 0u64;
	let mut total_usd = 0.0;

	while attempt < ATTEMPTS {
		let locale_refs = pending.iter().map(String::as_str).collect::<Vec<_>>();
		let request = prompt::build_for(
			item,
			&masked.text,
			before.as_deref(),
			after.as_deref(),
			&locale_refs,
			options.source_locale.as_deref(),
			options.gloss.as_ref(),
		);
		let wanted = options
			.model_override
			.as_deref()
			.unwrap_or_else(|| options.runner.model_for(item.kind, attempt));
		let started = crate::image::manifest::now();
		let clock = std::time::Instant::now();
		let answer = match runner::ask(options.runner, &request.text, wanted).await {
			Ok(answer) => answer,
			// No point trying a stronger model against an allowance that is gone; it is the
			// same account either way. Stop and say so.
			Err(Refusal::Exhausted(reason)) => return Err(Refusal::Exhausted(reason)),
			// Busy, not spent. Wait and ask the same question again -- this does not consume
			// an attempt, because nothing was wrong with the request.
			Err(Refusal::Throttled(_)) => {
				tokio::time::sleep(backoff).await;
				backoff = (backoff * 2).min(BACKOFF_MAX);
				continue;
			}
			Err(error) => {
				last = error;
				attempt += 1;
				continue;
			}
		};
		total_tokens += answer.tokens;
		total_usd += answer.usd;

		// Every marker back exactly once, or the answer is not usable. This is the point of
		// masking: not hoping the model left the code alone, but being able to show it did.
		let kept = match validate_reply_for(
			&answer.text,
			&request.boundary,
			item.kind,
			item.region,
			&item.source,
			&masked,
			&locale_refs,
			options.source_locale.as_deref(),
		) {
			Ok(kept) => kept,
			Err(error) => {
				last = error;
				attempt += 1;
				continue;
			}
		};

		let provider = options.runner.provider().to_owned();
		let seconds = clock.elapsed().as_secs_f64();
		for (locale, text) in kept {
			entries.push((
				locale.clone(),
				Translation {
					text,
					provider: provider.clone(),
					model: answer.model.clone(),
					at: started.clone(),
					seconds,
					tokens: answer.tokens,
					review: false,
				},
			));
			pending.retain(|wanted| wanted != &locale);
		}
		if pending.is_empty() {
			return Ok((entries, total_tokens, total_usd, pending));
		}

		// Keep every locale that survived this attempt. The retry asks only for the remainder,
		// so one malformed language cannot make the other paid-for answers disposable.
		last = Refusal::Failed(format!("{} did not survive validation", pending.join(", ")));
		attempt += 1;
	}
	if entries.is_empty() { Err(last) } else { Ok((entries, total_tokens, total_usd, pending)) }
}

/// How many times a display request is sent before the run gives up on it.
///
/// Two, where a body block gets three. A body block escalates through model tiers because a hard
/// paragraph can defeat a cheap model; a title is short and the run is already on the strongest
/// tier the caller named. What a second attempt buys here is one specific thing: the first reply
/// is told, per field, that it came back over its budget, and a model that overshot by three
/// characters usually fixes that when shown the number. A third would be the same ask again.
pub(super) const DISPLAY_ATTEMPTS: usize = 2;

pub(super) struct DisplayRequest<'a> {
	pub(super) title: &'a str,
	pub(super) subtitle: Option<&'a str>,
	pub(super) context: &'a str,
	pub(super) wanted: Vec<(String, segment::Display)>,
	pub(super) have: Vec<(String, segment::Display, String)>,
	pub(super) runner: Runner,
	pub(super) model_override: Option<String>,
	pub(super) source_locale: Option<String>,
}

pub(super) type DisplayEntry = (String, segment::Display, Translation);
pub(super) type DisplayResult =
	Result<(Vec<DisplayEntry>, u64, f64, Vec<(String, segment::Display)>), Refusal>;

/// Ask for one article's display metadata: the missing fields, in one request, across all locales.
///
/// Mirrors `translate` and differs in what a reply can fail on. A body block is refused for its
/// shape -- a lost marker, a malformed note. A title is refused for its size, because the column
/// it is drawn in has a width and the reader loses whatever runs past it. So the retry carries the
/// measurement back: not "that was wrong" but "that one drew 214px where 186 is the room".
pub(super) async fn translate_display(request: DisplayRequest<'_>) -> DisplayResult {
	let DisplayRequest {
		title,
		subtitle,
		context,
		mut wanted,
		mut have,
		runner,
		model_override,
		source_locale,
	} = request;

	let mut last = Refusal::Failed(String::new());
	let mut attempt = 0usize;
	let mut backoff = BACKOFF_START;
	let mut entries: Vec<DisplayEntry> = Vec::new();
	let mut total_tokens = 0u64;
	let mut total_usd = 0.0;
	let mut rejected: Vec<String> = Vec::new();
	// The article's own title and subtitle, read as one. The dash rule asks whether the author
	// spent a dash anywhere in what a card shows, not whether they spent it in this field.
	let metadata = format!("{title}\n{}", subtitle.unwrap_or_default());

	while attempt < DISPLAY_ATTEMPTS && !wanted.is_empty() {
		let built =
			prompt::build_display(title, subtitle, context, &wanted, &have, source_locale.as_deref());
		// What the previous attempt got wrong, in the units the rule is written in. A model shown
		// "over by 28px" can act on it; one shown "invalid" can only guess again.
		let text = if rejected.is_empty() {
			built.text
		} else {
			format!(
				"{}\n\nThe previous attempt came back over the limit on these. Write them shorter:\n{}",
				built.text,
				rejected.join("\n")
			)
		};
		rejected.clear();

		let model = model_override
			.as_deref()
			.unwrap_or_else(|| runner.model_for(segment::Kind::Heading, attempt));
		let started = crate::image::manifest::now();
		let clock = std::time::Instant::now();
		let answer = match runner::ask(runner, &text, model).await {
			Ok(answer) => answer,
			Err(Refusal::Exhausted(reason)) => return Err(Refusal::Exhausted(reason)),
			Err(Refusal::Throttled(_)) => {
				tokio::time::sleep(backoff).await;
				backoff = (backoff * 2).min(BACKOFF_MAX);
				continue;
			}
			Err(error) => {
				last = error;
				attempt += 1;
				continue;
			}
		};
		total_tokens += answer.tokens;
		total_usd += answer.usd;

		let parsed = match prompt::parse_display(&answer.text, Some(&built.boundary)) {
			Ok(parsed) => parsed,
			Err(prompt::BoundaryLeak) => {
				last = Refusal::Failed("the reply carried the fence back".to_owned());
				attempt += 1;
				continue;
			}
		};

		let provider = runner.provider().to_owned();
		let seconds = clock.elapsed().as_secs_f64();
		for (locale, field, answered) in parsed {
			if !wanted.iter().any(|(l, f)| l == &locale && f == &field) {
				continue;
			}
			if let Err(error) = validate::display(field, &answered, &metadata) {
				rejected.push(format!("{}  {error}: {answered}", prompt::field_marker(&locale, field)));
				continue;
			}
			entries.push((
				locale.clone(),
				field,
				Translation {
					text: answered.clone(),
					provider: provider.clone(),
					model: answer.model.clone(),
					at: started.clone(),
					seconds,
					tokens: answer.tokens,
					review: false,
				},
			));
			// Kept for the retry: a field written on this attempt is context for one written on
			// the next, which is the whole reason the four are asked for together.
			have.push((locale.clone(), field, answered));
			wanted.retain(|(l, f)| !(l == &locale && f == &field));
		}

		if wanted.is_empty() {
			return Ok((entries, total_tokens, total_usd, wanted));
		}
		// Carrying what was measured, not only which field failed. A run that reports a name
		// leaves the reader to reproduce the request to find out how far over it was, and how far
		// over is the whole question: three characters is a prompt to tighten, three hundred is a
		// model answering something else.
		last = Refusal::Failed(if rejected.is_empty() {
			format!(
				"{} came back missing",
				wanted
					.iter()
					.map(|(locale, field)| format!("{locale}:{}", field.name()))
					.collect::<Vec<_>>()
					.join(", ")
			)
		} else {
			format!("{}", rejected.join("; "))
		});
		attempt += 1;
	}
	if entries.is_empty() && !wanted.is_empty() {
		Err(last)
	} else {
		Ok((entries, total_tokens, total_usd, wanted))
	}
}
