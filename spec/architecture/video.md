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

## A clip is a picture, then a silent picture, then a player

What the controls look like, and why they take none of their colours from the page, is in
[styling.md](../styling.md) -- this section is what they do. The player has three stages
and they are not decoration: each one is a different answer to "what is this thing", and the
reader moves through them by doing something. `sleeping` looks like a
picture and has no controls. `previewing` is running silently and is an invitation rather than a
player, so it still has no controls. `awake` is a player, and only a reader's own click gets
there, because only a click can buy sound from a browser.

**Sound is the page's, not the clip's.** Once a reader has clicked one clip, every other clip on
the page plays with sound the moment it is previewed, because the question the click answered --
does this reader want to hear this page -- was never about one clip. What a second clip still
withholds is the chrome: that needs its own click, because it is the difference between watching
and operating.

### On a pointer device

A pointer discovers a clip by arriving at it. Arriving starts silent playback and takes the cover
away, because the picture moving is a better invitation than a button on it. Leaving pauses and
keeps the position, so coming back resumes rather than restarts, and the cover comes back with it.
None of this raises the chrome; a click does that.

Once awake, **the chrome follows the pointer and nothing else** -- there while it is on the frame,
gone when it leaves. It does not fade on an idle timer. That is a native player's rule and a
native player fills the screen; this one is a box in a column of prose that the reader is
deliberately pointing at, and a scrubber that vanishes under a resting pointer has to be summoned
back by wiggling it.

**The cover is a guest whenever the row is there, and the only control when it is not.** With the
pointer on the frame there is a whole row along the bottom, so the disc over the middle of the
picture comes up for the two seconds after a state change, holds while the pointer is on it, and
otherwise gets out of the way -- paused included, because a reader who paused with the pointer on
the frame has the row in front of them.

With the pointer off the frame the row is gone and the disc is the only control there is, so what
it does depends on whether there is anything to do. A clip still running -- and an awake one does
keep running, since only a preview ends with the pointer -- needs nothing from the reader and
takes the countdown like any other state. A paused still frame with nothing on it says nothing
about being resumable, so there the disc stays, indefinitely.

**Both edges are countdowns rather than switches.** Arriving does not clear the middle of the
picture in the same frame the row appears in: two things changing in opposite directions at once
reads as a flinch, so the disc leaves on its own a moment later. Leaving does not clear it at all
while the clip is running. Measured across an arrival: the row at 0.82 opacity by 108ms with the
disc still at 1, and the disc gone at 2191ms.

The countdown is the cover's own. The store has an idle flag and it resets on any movement inside
the container, so a reader whose pointer wanders across the picture -- which is what watching looks
like -- kept pulling the Pause button back into the middle of it.

**Before the first click the cover shows one face.** The clip underneath starts and stops in that
stage, and reading `paused` directly meant the glyph reported it: the triangle became two bars for
the length of the fade and then went, a pause button flashing on a clip nobody had started. The
state is not the cover's to report until there is something to report.

### On a touch device

A finger cannot arrive anywhere, so a clip with nothing on it is a picture as far as anyone can
tell, and the cover is the only thing that says otherwise. It is the invitation and nothing else:
a permanent play control in the middle would fight the double tap. A press that wanders slightly
is this device's hover, and unlike a pointer leaving, lifting the finger does not pause -- only
leaving the viewport does. A single tap summons the chrome; a double tap plays and pauses.

### A clip playing elsewhere leaves the frame it left on

An element in picture-in-picture paints nothing where it stands. The browser puts its own
placeholder there -- a black box with a line of text -- and while the poster was still an
attribute it painted that over the poster, so a clip twelve seconds into another window was
represented here by a dimmed still of its first frame. Neither the black nor the first frame is
what left.

So the frame it leaves on is copied into a canvas at `enterpictureinpicture`, and the canvas
stands in for it: same box, same crop, nothing moves when one replaces the other. **Grey and
dimmed, because it is a picture of the clip and not the clip** -- the live one is in the other
window, and a full-colour still would be claiming otherwise. It sits above the element rather than
inside it, because the browser's placeholder is shadow content and no selector reaches it.

The canvas is always in the DOM rather than conditional on the state, because the state and the
drawing arrive in the wrong order: the frame is available at `enterpictureinpicture`, and a canvas
mounted by that same state would not exist yet. Tainting does not matter -- it is displayed, never
read back, and a cross-origin draw only blocks `getImageData` and `toDataURL`.

**And it can be pressed to bring the clip back.** The disc returns wearing the
picture-in-picture glyph, and so does the picture behind it: while a clip is playing somewhere
else, pressing it can only mean one thing. The play disc is withheld for the same reason -- two
discs on one picture is one more than there is anything to press.

### Filling the window is a page mode, not a media one

Two buttons sit next to each other and they are different destinations rather than two sizes of
one, which is why they carry different glyphs. The Fullscreen API leaves the browser behind. The
other fills the window with the browser's own chrome still around it, which no player library
offers because it is not something a media element can do: the frame becomes a fixed black box
over the page.

**It is offered only where it would change anything.** The article column caps at 720px, so below
that the column is already as wide as the window and filling it gains a reader nothing -- the clip
is the same size either way, and a control that does nothing visible is worse than one that is not
there. Withheld in CSS rather than in script, so it is right on the first frame and follows a
window being dragged. The screen-fullscreen button beside it is never withheld: leaving the
browser is worth something at every width, and on a phone it is the only one of the two that is.

**The mode eats the scroll rather than exiting on it.** There is nothing to scroll, so a wheel or
a swipe does nothing at all and the page behind does not move. Leaving restores the position the
reader was at, captured when the button was pressed rather than inside the effect that runs after
-- by then the frame is already `fixed`, the document is that much shorter, and the browser has
clamped the number being saved.

**The clip is fitted and never stretched**, growing until one axis meets the window and stopping,
so anything that is not the window's shape is bordered by black on the other. Both fullscreens
paint the same way -- no border, no corner, black ground -- and they arrive by different routes,
one an attribute this file's own markup writes and the other the Fullscreen API promoting the same
element. Written apart, only the attribute turned the frame off, and a light theme drew a
two-pixel grey rectangle around the picture in full screen. `:fullscreen` sits alone in its
selector list and not beside a prefixed spelling, because an unknown selector in a list
invalidates the whole rule.

The attribute is not decoration either. A scoped `:has(.player-filling)` cannot cross a component
boundary -- Svelte rewrites both halves of the selector into one file's scope and the class
carries the child's -- so the state belongs to the file that draws the frame.

### A reload finds a clip where the tab left it

A reader who reloads mid-article should not have to find their place again, and that is the whole
of what is restored: **a position, never a stage and never playback**. Sound is bought with a
click and a reload has not been clicked, so a restored clip is a picture again until the reader
arrives at it. This is not a new rule -- it is the one a pointer leaving already follows, and a
reload is a longer leave.

The position lives in the `tab` record, which is `sessionStorage`, because it is a fact about this
sitting: see [engagement.md](../engagement.md).

**It is applied when the clip comes into view, not on load and not at the first `play`.** On load
would be wrong because `preload="metadata"` means the clip has not been fetched, and writing
`currentTime` asks the CDN for a range around that offset: three clips in an article would be
three requests on every page view for a reader who scrolls past all of them. At the first `play`
would be wrong for the reason below -- by then the reader has already been looking at the wrong
frame. The viewport is where the two meet: nobody pays for a clip they never reach, and everybody
who reaches one sees the right picture before they touch it.

Every path to playback still goes through one function for the same reason a position is worth
restoring at all: one restored on some paths and not others is worse than one restored on none.

### The poster is a fallback, and the wait is a blur

The poster is cut from the clip and it still does not match it. Encoded separately it lands a
shade off on colour, and where its pixel dimensions differ from the rung being played `object-fit:
cover` crops the two differently, so the first frame of playback arrives with a small visible
shift: two pictures of the same instant, one of them slightly wrong.

The answer is not to show it better but to stop showing it. **A near-miss is only visible because
something sharp is being replaced by something else sharp**, so what fills the wait is the blurred
ground underneath instead -- and a blur gives nothing away, because it is the same handful of
colours whichever encoder made it. The poster becomes what a poster is: the thing on screen when
there is nothing else, which now means when the element has errored.

**The blur is a picture of where the clip actually is.** `preview` is the build's thumbhash, which
is a picture of the first frame: right for a clip nobody has moved, wrong for one the tab left at
fourteen seconds, and the blurred ground is the only thing on screen for that moment. So a pause
keeps a thirty-two pixel WebP of the frame it paused on beside the position, about a kilobyte, and
a reload blurs that instead. It is drawn from a canvas rather than encoded as a thumbhash, which
reaches the same place without carrying an encoder into the bundle, and it is optional: a tainted
canvas returns nothing and the thumbhash is there underneath. The clips are served with
`Access-Control-Allow-Origin` and asked for with `crossorigin`, so in practice it is clean.

**The choice is made before anything is painted, and it takes a script to make it.** There is no
declarative way: `sessionStorage` is a JavaScript API, and no media query, attribute selector or
server negotiation can read it. What can be chosen is *when* -- an inline `<head>` script, running
synchronously before the parser reaches the first `<video>`, is as early as any decision about a
document can be made, and it is the same ground the theme script already stands on. Reading the
record during hydration instead meant a returning reader saw the thumbhash first and their own
frame a moment later: one blur replacing another, in aid of hiding a swap.

**The script emits values, not appearance.** Each remembered clip becomes a `--clip-ground` on a
selector matching it, and whether anything is drawn with that stays the component's business --
which is what keeps the blur from returning behind the letterbox bars in full screen, where the
component deliberately draws no ground at all. The thumbhash lives in the `var()` fallback, so a
reader with no record needs nothing to have run.

Both halves of every entry are whitelisted before they reach the stylesheet: the clip name against
`[A-Za-z0-9._-]`, the still against a base64 data URI. The record is same-origin and the reader's
own, which is not the same as trusted -- a value that can put arbitrary text inside a selector or a
`url()` can write arbitrary CSS, and "our own code put it there" is an argument about today.

Measured: `--clip-ground` set at 59ms with zero paint entries recorded, against a first paint at
84ms, and its value none of the three thumbhashes the server sent.

So the poster does what a poster is for -- something to show while there is nothing better -- and
goes the moment the element has painted a frame of its own. What produces one is a seek, which is
why the restore above happens on the same signal: a clip the tab left at fourteen seconds is
showing its first frame until something moves it, and a clip with nowhere in particular to be is
nudged a ten-thousandth of a second, because assigning the position the element already reports is
not a seek and decodes nothing. Every source is seeked exactly once, tracked rather than inferred,
and the count resets when a rung swap calls `load()` and throws the decoded frame away.

**`readyState` does not mean a frame has been painted, and reading it as if it did is what broke
this.** `HAVE_CURRENT_DATA` and above say the *data* for the current position is available.
Measured on a clip sitting at `readyState` 4 -- enough data for the whole thing -- with
`totalVideoFrames` still 0: nothing had been decoded, so the guard skipped the seek, so nothing
ever was. The poster came off an element painting nothing and what showed through was the
thumbhash beneath it, a blurred sixteen-pixel placeholder stretched across the frame.

`requestVideoFrameCallback` is the signal that a frame reached the compositor, and it is the one
used where it exists. Firefox does not have it, so `seeked` carries the same claim there: the seek
is unconditional, and a completed seek has by definition put a frame up.

The attribute comes back on `emptied` and `error`, the two ways a decoded frame stops being true:
a source swap, or a clip that has stopped working.

**It is kept where it stops changing, not while it changes.** `timeupdate` fires four times a
second and every write is a read, a parse, an edit and a stringify of the whole record. Pausing
and leaving the page are the two moments the number is worth keeping, and `pagehide` is the one
that catches a reload -- which is the case this exists for. A clip that reached its end drops its
entry rather than storing the duration, because a finished clip starts again.

## What the page ships before the player is alive

A clip is in the document long before anything can work it, and two different readers are inside
that window: the one whose bundle has not landed yet, and the one who has no bundle at all. They
want opposite things and the page used to give them both the same thing.

### The chrome is rendered from the first frame, not from hydration

The controls component used to be withheld until the clip and its frame were bound, which is
after hydration. That is fine for the row along the bottom, which nobody sees until they point at
it, and wrong for the cover: it is the one part a reader sees before they touch anything, so it
did not exist and then appeared at full opacity. Measured, nothing until 400ms against a first
paint at 88ms.

So the component renders from the start and its two element props are optional -- **the clip and
its frame, once there are any**. Everything that touches either is an effect or a handler, so
nothing runs until there is something to run against, and each guard says so at its own site
rather than being implied by a gate in the parent. The server writes the same disc the client
keeps, so there is nothing to appear, and nothing to press either. Measured after: present from
the first sampled frame, and not one change across 576 of them.

What still gates it is `support`. A browser that refused every source gets the notice instead,
because a player drawn over a clip that will not decode is a lie.

### The no-script player lives in `<noscript>`, and nobody else ever sees it

The other reader in that window is the one who will never get a bundle, and a clip has to work for
them too: scripting off should still mean a player rather than a picture that does nothing. The
element therefore used to be served with `controls`, which `onMount` then took off.

That showed the fallback to the wrong audience. Every reader watched the browser's own control bar
for as long as hydration took -- measured at 247ms and 21 painted frames on a warm local load, and
longer over a network -- so the thing that exists for readers without script was being paid for by
the readers who have it. The section above is what the waiting reader gets instead, and it is not
the same thing: a disc that will work in a moment, rather than a second player that will vanish.

`<noscript>` is the exact tool for that split, and the split is the whole point. **With scripting
enabled a browser does not parse `<noscript>` contents as markup at all**: they are raw text, so
there is no element, no request, and nothing to paint. With scripting disabled they are the only
copy. So the fallback is kept and the flash is removed, rather than one being traded for the
other. Measured after: zero frames.

The two copies must not both show, so the block carries a one-line `<style>` hiding the scripted
element, which is marked `data-script-only`. It matches on that attribute rather than on the
class because a `<style>` written into markup is not the compiler's and carries no scope hash.
It repeats once per clip, which is the price of the fallback being self-contained where the
element it replaces is.

**It also names the frame, and that is a cascade fact rather than a readability one.** Svelte's
scoped rules are unlayered, so `.video-surface.svelte-hash { display: block }` is an ordinary
author rule at two classes; `video[data-script-only]` is one class and one element and loses to
it. Naming the frame makes it two classes and an element, which is the smallest thing that wins
without `!important`.

**A fallback nobody can reach is a fallback nobody has tested.** This one shipped broken -- both
copies stacked -- and the markup, the served HTML and the scripting-enabled half all looked
correct, because none of them is the thing that was wrong. The condition `<noscript>` is defined
against is *scripting disabled*, and a sandboxed iframe without `allow-scripts` is exactly that:
give it `allow-same-origin` as well and the result can be read back. Six `<video>` elements where
three were wanted, and then three.

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

### The pairing is checked by arithmetic, and the arithmetic is not about the track

`cms captions <clip> <track.vtt> --language <tag>` is a command of its own rather than a branch of
the import, because a clip and its track do not arrive on the same day and often the track never
arrives at all. Two of the three clips here have none.

It refuses on two things. **The excerpt and the clip must be the same length**: `excerpt` in
`data/media.yaml` was written by a person and `duration` in the manifest was measured by ffprobe,
nothing derives one from the other, so agreement is evidence and disagreement is proof that one of
the two describes something else -- and cutting against a window that is out by a second puts every
cue on screen a second early, which looks like working software. The tolerance is 0.25s, which is
two frames at thirty and an order of magnitude under any mispairing; measured over the three clips
the real gap is 0.000s, 0.024s and 0.051s. **And the track must say something during the window**,
because an empty cut over twenty-four seconds of a keynote is a wrong file rather than a silent
passage.

**Neither of those is a check on the track.** A WebVTT file carries no account of which recording
it transcribes, so a track for a different video, handed to a clip whose excerpt is a window that
track happens to have cues in, passes both -- demonstrated on this repository's own material, where
Apple's event track attaches cleanly to the Mac Pro film. There is no stricter rule to reach for:
the fact a rule would need is not in the file. What exists instead is the opening line, printed
back quoted beside the clip it went onto, and read by the person who typed the command. `[LIGHTER
SPARKS]` under the Mac Pro film is not subtle.

The window has one home. There are no `--from` and `--to` flags: the cut file cannot record where
it came from, `excerpt` is the one written account of it, and a flag would be a second place to put
the same fact with no trace of which was used.

## Every clip plays at one level, and the peak is what caps it

Two numbers are measured at import and stored on the record: **integrated loudness** in LUFS and
**true peak** in dBTP, both from EBU R128 by way of ffmpeg's `loudnorm`. The gain a clip is played
at is the smaller of what the loudness asks for and what the peak allows -- measured over the
three clips here, one wants 1.93 to reach the target and is held to 1.81 by its own peak, which is
the ceiling doing exactly its job.

**Loudness, not peak, sets the target.** Peak alignment puts the loudest single sample of every
clip in the same place, which makes a clip with one door slam and quiet dialogue quiet throughout.
LUFS is K-weighted and gated -- built to agree with what an ear calls equally loud -- and is not an
arithmetic average.

**This is normalisation, not compression, and the distinction is the whole point.** One constant
multiplies the whole clip, so every peak and every valley moves by the same decibel and the
dynamic range is exactly what it was. Pushing loud parts down to a ceiling and leaving quiet parts
alone is a limiter, and a limiter is the thing that changes how a recording sounds. What sounds
like the cautious option -- "set a maximum and push down what exceeds it" -- is the one that
alters the recording; the one that sounds like averaging is the one that does not.

**Nothing is re-encoded.** The numbers are stored and the gain is applied at playback, because the
bytes are the content id: every rung, every article reference and every object in the bucket is
addressed by it. A number in a record can also be re-tuned later, which a baked-in gain cannot. It
also means the measurement can be backfilled -- `cms video` measures a published clip that has
none without deriving a single pixel again.

The target is -18 LUFS with a -1 dBTP ceiling. -18 sits near the loud end of this corpus rather
than the quiet end: a target below every clip would attenuate all of them and leave the site
playing under its own headroom. So a quiet clip is raised, which is why a ceiling is needed at
all, and why `video.volume` -- capped at 1 -- is not always enough. A `GainNode` covers the rest,
built only from a click, because a context created without a gesture starts suspended and a
suspended context after `createMediaElementSource` is not quiet but silent.

The reader's own level multiplies this, starts at half, and persists in `localStorage["state"]`
under `video.volume`. There is no way to read the system volume and there will not be: an
element's volume is its own gain, and the operating system's mixer is downstream of it.

## What is wired and what is not

`cms video` imports: probe, ladder, encode, publish, poster, record, and the article's reference
rewritten. `refs::scan` reads `::video`. `cms gc` keeps a clip's rungs, its tracks, its poster and
the poster's own variants. The site renders a clip, chooses a rung at hydration and falls back to
the poster and a notice. `cms captions` cuts a track to a clip and attaches it. `cms clip` samples
the frames, writes the prompt, asks, and records the answer where a picture's description goes, so
`cms locale` carries it into every language with no branch of its own.

The CLI is complete. What is not built is the software-decode path -- see the decision above -- and
nothing on the front end reads a caption track yet.

Measured over the three clips here on the first real batch: 60, 60 and 75 words asked for, 62k
tokens in, three answers that read the burnt-in text rather than restating the background. The
guard paragraph held -- the Mac Pro film came back with "Jony Ive", "Chief Design Officer" and
"virtually unlimited possibilities" quoted off the frames, not with "Apple's Mac Pro film". One
answer identified a clip this repository had mislabelled in its own head: the keynote joke is a
scripted sitcom scene with Chinese subtitles, not anything Apple published, which is why that clip
carries an excerpt and no source.

## Open

**What a software decoder actually manages, measured on a device that needs one.** It is the only
number in this file nobody has taken, and it decides two things at once: how long a progress bar
would be, and whether a source that publishes a single 1080p rung would leave that path with
something it cannot finish. It is not blocking while the branch is unbuilt, and it is the first
thing to measure on the day it is. Estimating it would be worthless.

**What the sampling interval lets through.** Measured on the three real clips it is 2.57s, 3.43s
and 3.12s between frames, and anything on screen for less than that can be missed silently. The
first real batch caught every title card there was to catch -- two names and a tagline off the Mac
Pro film, a road marking off the event clip, two lines of Chinese subtitle off the third -- so on
this evidence the interval is not obviously too wide. Three clips is not a measurement, and none of
them cuts fast. It stays open until something with a rapid montage has been through it.

**Whether a caption track is part of what the runner is shown.** It is text, it is already cut to
the excerpt, and for a clip whose substance is narration it carries more than the frames do. It is
also the thing most likely to be restated instead of observed, which is the failure the prompt
already has to guard against for the context.

**Following `cid://` at render time.** Nothing resolves it yet. A poster's credit is meant to
resolve through its video to whoever published it, and until something walks that link the scheme
is a convention with no consumer.
