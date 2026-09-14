# Video, and the one format it is published in

[media.md](media.md) covers pictures. Video shares its addressing, its two-file split between what
a tool derives and what a person writes, and its rule that a source names the origin rather than the
route. What is here is what differs, and video differs in one way that decides everything else:
**a browser that cannot decode the format shows nothing**, where a picture in an unsupported format
can be re-encoded by the CDN on the way out.

## One codec, chosen against measured support

AV1 in MP4, `faststart`, and no second encoding of the same picture.

Measured on 2026-09-14, from caniuse:

| format | full support | partial | notes |
| ------ | -----------: | ------: | ----- |
| H.264  | 96.68% | 0 | universal, and twice the bytes for the same picture |
| WebM container | 95.30% | 0.95% | Safari included, minus alpha |
| AV1    | 79.26% | 15.02% | the partial is Apple, hardware decoders only |
| HEVC   | 17.51% | 74.81% | eight separate conditions, and a patent pool |

**The percentages are not comparable and reading them as a ranking is the mistake to avoid.** AV1's
partial is one condition -- Apple devices with a hardware decoder, and no software fallback behind
it, so an older iPhone does not play slowly, it does not play. HEVC's is eight, and it is the reason
HEVC is not a candidate despite the larger number.

**MP4 rather than WebM, and the reason is not the container.** Both play nearly everywhere. AV1 on
Apple hardware is decoded through a pipeline built around ISOBMFF, and that is the only path to the
hardware decoder that the 15.02% depends on. MP4 is also the family AVIF already belongs to, so the
site's pictures and its video are one codec and one container lineage rather than two.

**A container does not compress.** Remuxing between MP4 and WebM changes the headers and the index
and nothing else. What the container does decide is whether playback can begin before the file has
arrived, which is `faststart` -- the index at the front rather than the back. That is a bigger
difference to a reader than any codec choice, and it is not a quality decision.

## What a device without a hardware decoder gets

**Today: a notice, and nothing else.** The `<video>` fails to decode, the poster frame stays where
it is, and the reader is told the format is not supported with a link to the source page. That is
the whole of what is built.

The three-branch arrangement below is decided rather than speculative, and it is deferred. It is
written here rather than in a ticket because the reason it is not built is a judgement about
priority, and a judgement that leaves no trace gets re-argued from nothing.

### Decided, not built

Detection is one line and reliable, so the branch is cheap to add whenever it is wanted:

```js
const av1 = MediaSource.isTypeSupported('video/mp4; codecs="av01.0.05M.08"');
const wc  = typeof VideoEncoder !== 'undefined';
```

**Hardware decode.** Play it. There is nothing to optimise: a hardware decoder is fixed-function
silicon, 1080p costs the CPU almost nothing, and transcoding to a smaller copy would spend a full
decode and encode pass to save an expense that is already near zero.

**No hardware decode, but WebCodecs.** Decode ahead of time rather than in real time. Software AV1
decode does not hold 30fps on the devices that need it, and a stuttering picture is a worse failure
than a wait: the reader gets a progress bar, the clip is decoded with a WASM decoder and re-encoded
through the platform's own H.264 encoder -- the expensive half is hardware -- and the result is
cached against the asset's content id, so the wait happens once per device rather than once per
visit. Frames cannot be kept decoded: one 1080p frame is 8.3MB and twenty-five seconds is 6.2GB, so
the pipeline is per-frame, decode then encode then discard. The progress bar's denominator is why
the manifest stores a frame count.

**Neither.** The poster frame and a link to the source page, which is what ships today for both
non-native cases.

**The choice to publish one encoding rather than two is deliberate and it is a storage decision.**
An H.264 rendition beside the AV1 one would cost about 3.5MB per clip and remove both branches
entirely, and it was declined in favour of not storing it. What that spends is the reader's battery
and about forty seconds, once, on a minority of devices. Revisit it if this site ever carries many
long videos rather than a few short excerpts, because the storage argument is the whole of the case
and it scales against the decision.

**What holds the deferral in place** is that AV1 is 79.26% with hardware decoders behind most of
the rest, the videos here are short excerpts rather than the substance of an article, and the
branch costs a WASM decoder, a JS muxer, a cache layer and a progress UI. It stops holding if a
video ever carries an argument a reader must see, or if the measurement below comes back saying the
wait is short.

## The ladder, and the measurement that sets it

**1080p is the dividing line.**

| source | published |
| ------ | --------- |
| above 1080p | two rungs: 1080p, and the larger of 2K or 1440p / 4K that it fits; above 4K is forced down to 4K |
| exactly 1080p | one rung |
| below 1080p | one rung, at the nearest standard tier *below* it; a source under the lowest tier is its own rung |

Tiers are named by height -- 360, 480, 720, 1080, 1440, 2160 -- because a tier has to be one axis or
a vertical video snaps to the wrong one. Scaling preserves the aspect ratio; nothing is forced onto a
tier's exact frame. **Upscaling is never done**, which is [media.md](media.md)'s rule for pictures
and holds for the same reason.

**Why 1080 and not 720.** The column an article renders a picture in is `48rem`, which is 768 CSS
pixels, and `picture.svelte` already names that number in its `sizes`. At the two-times pixel ratio
of a retina desktop or an iPad that is **1536 physical pixels**, and on a phone -- 342 CSS, which is
390 less two 1.5rem gutters -- three times is 1026. So 720p at 1280 wide covers the phone with room
and falls a fifth short of the desktop, where it would be enlarged; 1080p at 1920 covers both with
margin. 4K is two and a half times what the column can show and exists for the full-screen view
only.

**Unlike a picture, nothing chooses a rung for free.** `srcset` and `sizes` let the browser pick;
`<video>` picks a `<source>` by type and never by size. So a chooser runs at hydration, and it picks
by a different rule on each branch: **by what the display needs** where there is a hardware decoder,
and **by what a software decoder can finish** where there is not, because software decode cost
scales with pixel count and the wait is the reader's. That is the same hydration point the fallback
already uses.

One consequence to watch rather than pre-solve: a source at exactly 1080p publishes one rung, so the
software path has only the heaviest rung to take. If a measured wait turns out to be intolerable the
answer is another rung below it, not a change to the playback logic.

## What is stored, and where

The split is [media.md](media.md)'s: what a tool can rebuild from the original goes in the manifest,
what a person wrote cannot be rebuilt and goes beside the description.

**Derived, in `data/metadata.json`:** duration, dimensions and ratio, the full codec string the
`<source>` element needs, frame rate, **frame count**, whether there is an audio track, byte size,
and each rung keyed by its own content id. The frame count is not decoration: it is the denominator
of the progress bar the software path shows, and without it the bar cannot be honest.

**Authored, in `data/media.yaml`:** `source`, exactly as a picture carries it -- a `url` and an
English `label` naming the origin rather than the route. Plus two a picture has no use for:

- `excerpt`, the range in the original the clip was cut from. Nothing in the cut file records that
  its twenty-five seconds began at 39:00, and no tool can recover it.
- `poster`, the content id of the first frame.

**The poster is an ordinary image asset, not a field of the video.** Stored through `cms image`
like any other picture, with its own id, its own AVIF rungs, its own thumbhash and its own
description in eight languages, and carrying `source: cid://{blake3}` pointing at the video it was
taken from -- see [media.md](media.md) for why a source can point inward and why it names the asset
without an extension.

**It is stored because it is the fallback, not because it is a nicety.** A reader whose device
cannot decode AV1 and has no WebCodecs sees this frame and a link, and that is the whole of what
they get; a poster that had to be extracted on demand would need a decoder at exactly the moment
there is none. It also has to be an `<img>` a browser paints with no script, and an image asset
already carries everything a poster needs, so a second kind of picture would only be a second place
to write alt text.

A last frame is not stored. Playback ends on it, and nothing renders it.

## What the objects are called

```
image/{ab}/{cd}/{cid}.avif      a picture, or a video's poster frame
video/{ab}/{cd}/{cid}.mp4       one rung
captions/{ab}/{cd}/{cid}.vtt    one text track
meta/{blake3}.json              the record
```

**A prefix names what kind of object it is and the cid names the object, and nothing in a key says
what an object belongs to.** A caption does not live under the video it captions, and a poster does
not live under the video it posters: a content id is about itself and nothing else, and the same
bytes reached from two articles are one object either way. Where things belong together is the
record's job, which is the only place the relationship is written and therefore the only place it
can go wrong.

The two fanout levels are [media.md](media.md)'s and exist for the same reason.

## The record is one shape per kind, not one shape with holes

`type` is already the first field of every record, and it becomes the discriminant rather than a
label: a video's record is shaped for video rather than a picture's shape with video fields added
and picture fields left empty.

```
the envelope   version, blake3, created, updated
  type: image  thumbhash, exif, source{w,h,ratio,bytes}, variants{quality}
  type: video  duration, frameRate, frames, audio, poster,
               source{w,h,ratio,bytes}, variants{codec}, captions
```

The gain is not fewer fields, it is that neither kind has to explain what it lacks. A video under
the picture's shape has to put something in `thumbhash` -- the poster's, or an empty string -- and
both are untrue. Absent is the honest answer and only a per-kind shape can give it.

`quality` does not carry over: it is a 0..1 the image encoder was given, and a video's CRF is not
the same quantity under a different name. `variants` carries the full codec string instead, because
that is what a `<source>` element has to be told.

This is a change of shape rather than an addition, so the manifest's `VERSION` moves with it.

## The description is written from frames this repository chooses

The runner is given still frames and a word budget. It is not given the video and it is not given a
shell.

**That is a boundary decision, not a belief about how a model should watch.** A local agent CLI can
in fact watch a video: handed the file and a `Read` tool plus a shell, one of them read the
container with `ffprobe`, pulled eight frames with `ffmpeg`, looked at four of them and returned an
accurate description, unprompted about method. What it needed to do that was a shell, and this runs
unattended across a whole library, where nothing has any business executing anything. So the frames
are extracted here, where the count is decided, reproducible and reviewable, and the runner's tools
stay `Read` and nothing else.

The cost is worth naming: prescribing the sampling is prescribing how the model sees, which is the
thing an instruction should usually avoid. It is accepted because the alternative is a shell.

**Frames are evenly spaced and both ends are kept.** The last frame earns its place: films put
their title card there, and the two runners tested on one clip split exactly on it -- the one that
saw the final frame read "Jony Ive" off it and named a Mac Pro, the one that did not called the
same object a cheese grater. Even spacing rather than scene detection, because a cut-finder returns
a count nobody chose and returns nothing at all for a clip that holds still.

Which frames are sampled is an implementation detail and not a contract. Only the first is stored;
the rest exist for the length of one call.

**One curve sets both budgets**, so the summary and the evidence it is written from cannot drift
apart:

| duration | words | frames |
| -------- | ----: | -----: |
| 2s | 20 | 4 |
| 18s | 60 | 8 |
| 25s | 68 | 9 |
| 3m | 118 | 15 |
| 20m | 167 | 21 |
| cap | 200 | 25 |

`words = clamp(60 * log10(1 + seconds / 2), 20, 200)`, then `frames = clamp(words / 8, 4, 25)` from
the **rounded** word count -- 25s gives 67.8 words raw, and 67.8/8 rounds to 8 where 68/8 rounds to
9. The table is what a person reads, so the formula follows it.

**The frame count is not a budget. It is a sampling probability for short events, and that is why
the ratio is a floor rather than a ceiling.** Eight frames over eighteen seconds is one every 2.57
seconds, so anything on screen for less than that is a coin flip. Measured on the Mac Pro clip: the
only sentence of English in the film, a title card, was caught by exactly one frame of the eight.
One fewer and it is gone, and nothing reports the loss -- what comes back is a fluent description of
a metal object, which is the same failure the prompt's two guards exist for, arriving through a
third door.

**The redundancy that looks like waste is the same mechanism and must not be trimmed.** On that clip
frames 1 and 2 are both lattice close-ups and frames 5 and 6 both hold the same title card: four of
eight carrying two pieces of information. That is what a fixed grid over uneven content produces,
and the grid is what catches the one-off. Cutting the ratio to a twelfth drops the 18s clip to five
frames at 4.5s spacing and the title card's odds from roughly 58% to 33%.

Raising it is not free either: ten frames against the same sixty words is six words each, and a
description written six words at a time is a list. Revisit only on the observable failure -- a
description that comes back having missed a title card.

Frames go out at 768 on the long edge. Enough to read text burnt into a picture -- one of these
clips ends on a title card -- and far below what any of them is stored at.

**What the runner is told about the video, and the sentence that has to be in the prompt.** The
frames are handed over with the context this repository already holds: the source's label, the
excerpt's range in the original, the article it sits in. That is not instruction about method, it
is fact already written down, and withholding it produces the cheese grater.

But context handed to a model that is asked for a summary invites the failure that looks most like
success: **restating the background instead of describing the frames.** An answer that says the
clip is Apple's Mac Pro film is not wrong and contains no observation, and nothing downstream can
tell it from one that watched. So the prompt says in as many words that the context is background
for reference and that what is wanted is what happens in the frames. The distinction is the whole
of the instruction, and it is the one part of this prompt that is not negotiable.

## A caption track is cut to the clip and shifted onto its timeline

The cues that overlap an excerpt window are kept -- overlap, not "start inside", because a cue
running from 2:16 to 2:20 is on screen when a clip starting at 2:18 begins -- and their timestamps
are moved onto the clip's own timeline at import.

**The two options were not symmetric and that is what decided it.** Storing them on the original's
timeline reads like the conservative choice: the correspondence survives and every consumer
subtracts. But one of the two consumers cannot subtract. A `<track>` element hands its source to the
user agent's own text-track engine and there is no offset attribute and no hook between them, so
"every consumer subtracts" means shipping a WebVTT parser to the browser to undo arithmetic this
machine can do once -- and when that script does not run the reader does not lose captions, which
announces itself, they get captions displaced by two minutes and eighteen seconds, which looks like
working software.

What is given up is that a stored track no longer says where in the original it came from. `excerpt`
in `data/media.yaml` is that offset, so the original timing is an addition away, and the two must
now agree -- change the window and the track is re-cut, exactly as the rungs are re-encoded.

A cue straddling the window's start clamps to zero rather than being dropped: WebVTT timestamps are
unsigned, so a negative one loses the cue or the file, and zero is the accurate statement anyway --
the cue *is* on screen at the instant the clip begins. The end clamps to the clip's length for the
inverse reason.

## What is wired and what is not

`cms video` imports: probe, ladder, encode, publish, poster, record, and the article's reference
rewritten. `refs::scan` reads `::video`. `cms gc` keeps a clip's rungs, its tracks, its poster and
the poster's own variants. The site renders a clip, chooses a rung at hydration and falls back to
the poster and a notice. Captions cut and store. Frames sample and the prompt is written.

**One command is missing: the one that asks for a clip's description.** `frames::prepare` returns
the frames and the prompt, and `runner::ask_vision_many` can be handed a series, so both halves
exist and neither is reachable from the CLI. It is not a branch in `cms alt`: that command hands a
runner one file and asks it to look, which is what a picture is, and the note in `alt::pending`
says so. It is a command of its own beside `cms diagram`, which is the same shape -- one operation,
one subject, one prompt.

Until it lands, a clip has no description, and the fallback is not nothing: the poster is an
ordinary image asset and `cms alt` has already described it in eight languages.

## Open

**What a software decoder actually manages, measured on a device that needs one.** It is the only
number in this file nobody has taken, and it decides two things at once: how long a progress bar
would be, and whether a source that publishes a single 1080p rung would leave that path with
something it cannot finish. It is not blocking while the branch is unbuilt, and it is the first
thing to measure on the day it is. Estimating it would be worthless.

**What the sampling interval lets through.** Measured on the three real clips it is 2.57s, 3.43s
and 3.12s between frames, and anything on screen for less than that can be missed silently. The
observable failure is a description that comes back having missed a title card, and it is worth
watching for on the first real batch. Same class as the software-decode number: nobody has taken it,
and it decides whether the frames were enough.

**Whether a caption track is part of what the runner is shown.** It is text, it is already cut to
the excerpt, and for a clip whose substance is narration it carries more than the frames do. It is
also the thing most likely to be restated instead of observed, which is the failure the prompt
already has to guard against for the context.

**Following `cid://` at render time.** Nothing resolves it yet. A poster's credit is meant to
resolve through its video to whoever published it, and until something walks that link the scheme
is a convention with no consumer.
