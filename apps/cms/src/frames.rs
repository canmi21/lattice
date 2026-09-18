//! Turning a video into the stills a model is asked about, and the prompt that goes with them.
//!
//! The runner is handed frames and a word budget, never the video and never a shell. That is a
//! boundary decision rather than a belief about how a model should watch, and it costs something:
//! prescribing the sampling prescribes how the model sees. See spec/architecture/video/pipeline.md.
//!
//! Nothing here asks anybody anything. This module decides how many frames, which frames, how
//! large, and what to say alongside them; `alt` makes the call.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

/// The long edge of a frame handed to a model, in pixels.
///
/// Enough to read text burnt into the picture -- one of these clips ends on a title card, and
/// the title card is the difference between naming a Mac Pro and naming a cheese grater -- and
/// far below what any clip is stored at.
const LONG_EDGE: u32 = 768;

/// Words per frame. The one number tying the two budgets together, so a summary and the evidence
/// it is written from cannot drift apart.
const WORDS_PER_FRAME: f64 = 8.0;

/// JPEG quality handed to ffmpeg, where 2 is near the top of the scale and 31 the bottom.
///
/// Not the default 24. These frames are read for text, and the first thing JPEG spends is the
/// hard edges a caption is made of.
const QUALITY: &str = "2";

/// How many times a seek that came back with nothing is tried again, a frame earlier each time.
///
/// Three covers a tenth of a second at thirty frames, which is more than any disagreement seen
/// between a container's stated duration and where its last frame actually is.
const RETRIES: usize = 3;

/// What a probe of the original already knows, spelled out as plain numbers.
///
/// The manifest's own video record would do, but sampling has no business depending on the
/// manifest's shape to answer a question about arithmetic.
#[derive(Debug, Clone, Copy)]
pub struct Clip {
	pub duration: f64,
	pub frame_rate: f64,
}

/// One extracted still, and where in the clip it was taken from.
#[derive(Debug, Clone)]
pub struct Frame {
	pub at: f64,
	pub path: PathBuf,
}

/// The frames of one clip, alive for as long as this value is.
///
/// Every one of them exists for the length of one call, and dropping is what makes that true
/// when the call fails as well as when it succeeds. **None of them is the poster** -- `cms
/// video` extracts that separately (see `video::poster`), so this never becomes a second
/// extractor free to disagree with it about scaling or colour.
#[derive(Debug)]
pub struct Frames {
	directory: PathBuf,
	pub frames: Vec<Frame>,
}

impl Drop for Frames {
	fn drop(&mut self) {
		let _ = std::fs::remove_dir_all(&self.directory);
	}
}

/// Everything needed to ask about one clip, except the asking.
#[derive(Debug)]
pub struct Request {
	pub frames: Frames,
	pub prompt: String,
	/// The budget the prompt asks for, repeated here so a caller can record what it bought.
	pub words: u32,
}

/// Where the clip sits in the original it was cut from, in seconds.
///
/// Nothing in the cut file records that its twenty-five seconds began at 39:00, and no tool can
/// recover it, so it is authored in `data/record/media.yaml` and passed through from there.
#[derive(Debug, Clone, Copy)]
pub struct Excerpt {
	pub from: f64,
	pub to: f64,
}

/// What this repository already knows about the clip, handed over as background.
///
/// Withholding it produces a description of a cheese grater where a Mac Pro stood -- measured,
/// on one of these clips. Handing it over invites the opposite failure, which is what the
/// paragraph in [`prompt`] is there to stop.
#[derive(Debug, Clone, Default)]
pub struct Context {
	/// `source.label` from `data/record/media.yaml`: who published it, not how it is reached.
	pub label: Option<String>,
	pub excerpt: Option<Excerpt>,
	/// The title of the article the clip appears in.
	pub article: Option<String>,
}

impl Context {
	fn is_empty(&self) -> bool {
		self.label.is_none() && self.excerpt.is_none() && self.article.is_none()
	}
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("could not make a directory for the frames: {0}")]
	Directory(#[source] std::io::Error),
	#[error("could not run ffmpeg: {0}")]
	Ffmpeg(#[source] std::io::Error),
	#[error("ffmpeg failed at {at:.2}s: {message}")]
	Extract { at: f64, message: String },
	#[error("ffmpeg wrote no frame at {0:.2}s")]
	Empty(f64),
}

/// How many words the description gets, from the duration alone.
///
/// The cap is the part that matters and the curve only reaches it smoothly. The shift from
/// detailed to overall is not asked for anywhere; it is what a budget does. Twenty words about
/// two seconds describes what is on the screen, and two hundred about twenty minutes cannot be
/// anything but a summary. See spec/architecture/video/pipeline.md for the table this reproduces.
pub fn words(seconds: f64) -> u32 {
	let curve = 60.0 * (1.0 + seconds.max(0.0) / 2.0).log10();
	curve.clamp(20.0, 200.0).round() as u32
}

/// How many frames the model is shown, from the same curve.
///
/// Taken from the rounded word count rather than the raw curve, because the two disagree: at
/// 25 seconds the curve gives 67.8 words and 8.5 frames, and the spec's table says nine.
pub fn count(seconds: f64) -> u32 {
	(f64::from(words(seconds)) / WORDS_PER_FRAME).round().clamp(4.0, 25.0) as u32
}

/// Where in the clip each frame is taken from.
///
/// Evenly spaced with both ends kept, rather than scene detection: a cut-finder returns a count
/// nobody chose, and returns nothing at all for a clip that holds still. The last frame earns
/// its place -- films put their title card there, and the two runners tested on one clip split
/// exactly on it.
fn timestamps(clip: Clip) -> Vec<f64> {
	let wanted = count(clip.duration) as usize;
	// A seek asks for the first frame at or after the timestamp, so the end of the file is past
	// the last frame and lands on nothing at all. The final frame occupies the interval one step
	// back from there, and the seek aims at three quarters of the way into it: far enough inside
	// that rounding the timestamp to milliseconds cannot push it out the far side, and far enough
	// from the frame before that a duration off by a fraction of a frame does not take that one
	// instead. Measured against a 24.024s clip whose last frame starts at 23.9906.
	let last = (clip.duration - 1.25 * interval(clip)).max(0.0);
	// A clip no longer than a single frame is a single frame, whatever the budget asked for, and
	// the same branch catches a probe that reported nothing: a duration of zero or NaN clamps to
	// here rather than dividing by it. Nothing else needs guarding -- `count` never returns fewer
	// than four, so the division below always has a divisor.
	if last <= 0.0 {
		return vec![0.0];
	}
	(0..wanted).map(|index| last * index as f64 / (wanted - 1) as f64).collect()
}

/// How long one frame is on screen. Thirty a second where the probe could not say.
fn interval(clip: Clip) -> f64 {
	if clip.frame_rate > 0.0 { 1.0 / clip.frame_rate } else { 1.0 / 30.0 }
}

/// A directory nothing else will pick.
///
/// Process id alone is not enough: two clips sampled concurrently in one run would share a
/// directory, and the first to finish would take the other's frames down with it on drop.
fn scratch() -> PathBuf {
	static NEXT: AtomicU64 = AtomicU64::new(0);
	let since = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map_or(0, |elapsed| elapsed.as_nanos());
	let serial = NEXT.fetch_add(1, Ordering::Relaxed);
	std::env::temp_dir().join(format!("cms-frames-{}-{since:x}-{serial}", std::process::id()))
}

/// Write one frame, or nothing where the seek found no frame to write.
fn extract(video: &Path, at: f64, path: &Path) -> Result<(), Error> {
	let output = Command::new("ffmpeg")
		.arg("-nostdin")
		.args(["-loglevel", "error", "-y"])
		// Before -i, so a seek into a long original skips to the nearest keyframe rather than
		// decoding everything up to it. Frame accurate either way since ffmpeg 2.1.
		.args(["-ss", &format!("{at:.3}")])
		.arg("-i")
		.arg(video)
		.args(["-frames:v", "1"])
		// Long edge to 768 whichever edge that is, and never an upscale. Written as an expression
		// rather than computed here because rotation metadata is applied ahead of user filters,
		// so a portrait clip's real dimensions are ffmpeg's to know and not ours.
		.args([
			"-vf",
			&format!(
				"scale='if(gt(iw,ih),min({LONG_EDGE},iw),-2)':'if(gt(iw,ih),-2,min({LONG_EDGE},ih))'"
			),
		])
		.args(["-q:v", QUALITY])
		.arg(path)
		.output()
		.map_err(Error::Ffmpeg)?;
	if output.status.success() {
		return Ok(());
	}
	// A seek that found no frame is a failing exit code carrying an encoder complaint, because
	// the encoder is what is left holding nothing. That is a miss to try again, not a fault.
	let message = String::from_utf8_lossy(&output.stderr);
	if message.contains("received no packets") {
		let _ = std::fs::remove_file(path);
		return Ok(());
	}
	Err(Error::Extract { at, message: message.trim().to_owned() })
}

/// Extract the frames of one clip into a temporary directory.
pub fn sample(video: &Path, clip: Clip) -> Result<Frames, Error> {
	let directory = scratch();
	std::fs::create_dir_all(&directory).map_err(Error::Directory)?;
	// Held from here on, so a failure halfway through takes the frames already written with it.
	let mut extracted = Frames { directory, frames: Vec::new() };

	for (index, wanted) in timestamps(clip).into_iter().enumerate() {
		let path = extracted.directory.join(format!("frame-{:02}.jpg", index + 1));
		// Where the end of a clip actually is depends on a frame rate that is only an average
		// for a variable-rate recording, so the last frame is approached rather than calculated:
		// a seek that came back with nothing is asked again a frame earlier. Bounded, because a
		// clip that answers nothing at any timestamp is a broken file rather than a near miss.
		let mut at = wanted;
		for attempt in 0..=RETRIES {
			extract(video, at, &path)?;
			if std::fs::metadata(&path).is_ok_and(|meta| meta.len() > 0) {
				break;
			}
			if attempt == RETRIES {
				return Err(Error::Empty(wanted));
			}
			at = (at - interval(clip)).max(0.0);
		}
		extracted.frames.push(Frame { at, path });
	}
	Ok(extracted)
}

/// What the model is asked for.
///
/// The framing is the whole instruction, the same as it is for a picture: "describe this video"
/// produces a caption, and asking what a person who cannot watch it would need produces the
/// thing that is useful.
pub fn prompt(frames: &[Frame], clip: Clip, context: &Context) -> String {
	let budget = words(clip.duration);
	let listing = frames
		.iter()
		.enumerate()
		.map(|(index, frame)| {
			format!("  {}. {} -- {}", index + 1, clock(frame.at), frame.path.display())
		})
		.collect::<Vec<_>>()
		.join("\n");

	// Saying that nothing between the frames was sampled is the second guard in this prompt, and
	// it defends against the same thing the context paragraph does: fluent text containing
	// nothing seen. A model handed eight stills out of a film narrates the cuts between them,
	// and every word of that is invention that reads exactly like observation.
	let mut text = format!(
		"Read these {count} still frames and describe the video they came from, for someone who \
		 cannot watch it. They are evenly spaced across {length} of footage, first frame to last, \
		 and they are the whole of what you have: nothing between them was sampled.\n\n\
		 Frames, in order:\n{listing}\n\n",
		count = frames.len(),
		length = clock(clip.duration),
	);

	if !context.is_empty() {
		text.push_str("What this repository already knows about the clip:\n");
		if let Some(label) = &context.label {
			text.push_str(&format!("  Published by: {label}\n"));
		}
		if let Some(excerpt) = &context.excerpt {
			text.push_str(&format!(
				"  Cut from {} to {} of the original\n",
				clock(excerpt.from),
				clock(excerpt.to)
			));
		}
		if let Some(article) = &context.article {
			text.push_str(&format!("  Appears in the article \"{article}\"\n"));
		}
		// This paragraph is the one part of the prompt that is not negotiable, and the one most
		// likely to be cut by whoever next decides it is too long. See
		// spec/architecture/video/pipeline.md, "What the runner is told about the video, and the
		// sentence that has to be in the prompt", for why.
		text.push_str(
			"\nThat is background for reference only, and it is not the answer. Do not describe \
			 the clip by restating it: naming the film, the event, the company or the article \
			 repeats what is already written down and observes nothing. What is wanted is what \
			 happens in the frames -- what is on screen in these pictures, and nothing that could \
			 have been written without opening them. Use the background only to put a name to \
			 something you can actually see.\n\n",
		);
	}

	text.push_str(&format!(
		"Say what kind of footage it is first -- a product film, a stage presentation, a screen \
		 recording, an interview -- because that frames everything after it. Then what happens: \
		 what is on screen, what changes from one frame to the next, and where it ends up. Read \
		 any text in the picture and quote it; a title, a name or a caption burnt into a frame is \
		 usually the most specific thing in the clip. Where two consecutive frames differ enough \
		 that something has plainly happened between them, say that rather than inventing the \
		 transition.\n\n\
		 About {budget} words. Write it as flowing prose, not a list. Do not open with \"A video \
		 of\" or \"This clip shows\" -- start with the content. Reply with the description alone: \
		 no preamble, no quotes, no markdown."
	));
	text
}

/// Sample one clip and write the prompt to go with it.
pub fn prepare(video: &Path, clip: Clip, context: &Context) -> Result<Request, Error> {
	let frames = sample(video, clip)?;
	let prompt = prompt(&frames.frames, clip, context);
	Ok(Request { frames, prompt, words: words(clip.duration) })
}

/// A position in a clip, as a person writes one.
fn clock(seconds: f64) -> String {
	let whole = seconds.max(0.0).round() as u64;
	let (hours, minutes, seconds) = (whole / 3600, (whole % 3600) / 60, whole % 60);
	if hours > 0 {
		format!("{hours}:{minutes:02}:{seconds:02}")
	} else {
		format!("{minutes}:{seconds:02}")
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// The table in spec/architecture/video/pipeline.md, which is the contract rather than the
	/// formula.
	///
	/// Arithmetic with boundaries is the one thing here worth a test and the one thing nobody
	/// would notice going wrong: a budget off by a frame produces a description that reads fine.
	#[test]
	fn the_budgets_match_the_table_in_the_spec() {
		assert_eq!((words(2.0), count(2.0)), (20, 4));
		assert_eq!((words(18.0), count(18.0)), (60, 8));
		assert_eq!((words(25.0), count(25.0)), (68, 9));
		assert_eq!((words(180.0), count(180.0)), (118, 15));
		assert_eq!((words(1200.0), count(1200.0)), (167, 21));
	}

	#[test]
	fn both_budgets_clamp_at_both_ends() {
		// Under the floor the curve goes to nothing and then negative, and neither is a budget.
		assert_eq!((words(0.0), count(0.0)), (20, 4));
		assert_eq!((words(0.1), count(0.1)), (20, 4));
		// The cap is reached around seventy-two minutes and holds however long the clip is.
		assert_eq!((words(86_400.0), count(86_400.0)), (200, 25));
		assert!(words(4000.0) < 200);
	}

	#[test]
	fn the_curve_never_steps_backwards() {
		let mut previous = 0;
		for tenths in 0..6000 {
			let now = words(f64::from(tenths) / 10.0);
			assert!(now >= previous, "words fell at {tenths} tenths");
			previous = now;
		}
	}

	#[test]
	fn sampling_keeps_both_ends_and_spaces_the_rest_evenly() {
		let clip = Clip { duration: 25.0, frame_rate: 25.0 };
		let taken = timestamps(clip);
		assert_eq!(taken.len(), count(25.0) as usize);
		assert_eq!(taken.first().copied(), Some(0.0));

		// The last frame earns its place, and it has to be inside the file to be readable: the
		// end of a clip is past its final frame, and seeking there returns nothing.
		let last = taken.last().copied().expect("a last frame");
		assert!(last < clip.duration, "{last} is not inside a {}s clip", clip.duration);
		assert!(last > clip.duration - 2.0 / clip.frame_rate, "{last} is not the final frame");

		let step = taken[1] - taken[0];
		for pair in taken.windows(2) {
			assert!((pair[1] - pair[0] - step).abs() < 1e-9);
		}
	}

	/// Losing this would silently downgrade every video description written afterwards, and the
	/// downgrade reads as a correct answer.
	#[test]
	fn the_prompt_refuses_the_context_as_an_answer() {
		let frames = vec![
			Frame { at: 0.0, path: PathBuf::from("/tmp/f/frame-01.jpg") },
			Frame { at: 24.9, path: PathBuf::from("/tmp/f/frame-09.jpg") },
		];
		let context = Context {
			label: Some("Apple".to_owned()),
			excerpt: Some(Excerpt { from: 2340.0, to: 2365.0 }),
			article: Some("The machine that was measured".to_owned()),
		};
		let text = prompt(&frames, Clip { duration: 25.0, frame_rate: 25.0 }, &context);

		assert!(text.contains("background for reference only"));
		assert!(text.contains("what happens in the frames"));
		// The context is present as well, because the guard exists to make it safe to give.
		assert!(text.contains("Apple"));
		assert!(text.contains("39:00"));
		assert!(text.contains("The machine that was measured"));
		// Every frame is named, in order, with where it came from.
		assert!(text.contains("/tmp/f/frame-01.jpg"));
		assert!(text.contains("/tmp/f/frame-09.jpg"));
		assert!(text.contains("About 68 words"));
		assert!(text.contains("not a list"));
	}

	#[test]
	fn a_clip_with_no_context_is_asked_about_plainly() {
		let frames = vec![Frame { at: 0.0, path: PathBuf::from("/tmp/f/frame-01.jpg") }];
		let text = prompt(&frames, Clip { duration: 18.0, frame_rate: 30.0 }, &Context::default());
		// The other guard is unconditional: there is no context to restate here, but there are
		// still gaps between the frames for a model to narrate.
		assert!(text.contains("nothing between them was sampled"));
		// Nothing to guard against, so no paragraph guarding against it.
		assert!(!text.contains("background for reference only"));
		assert!(text.contains("About 60 words"));
	}

	#[test]
	fn a_position_reads_as_a_person_writes_one() {
		assert_eq!(clock(0.0), "0:00");
		assert_eq!(clock(24.024), "0:24");
		assert_eq!(clock(2340.0), "39:00");
		assert_eq!(clock(3725.0), "1:02:05");
	}
}
