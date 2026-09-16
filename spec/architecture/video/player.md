# What a clip does as a reader moves through it

The three stages a clip has, what raises the chrome and what withholds it, and what the page ships
before any of it is alive. What the controls look like, and why they take none of their colours
from the page, is [styling/player.md](../../styling/player.md); what the clip itself is made of is
[pipeline.md](pipeline.md).

## The chrome is built on `@videojs/core`'s headless store, not its skin

The engine is still the `<video>` element. Between it and the markup in `video-controls.svelte`
sits `@videojs/core`, a state store plus a set of control cores that ships no CSS at all -- every
stylesheet in that project lives in `@videojs/react`, an opt-in skin nothing here imports. What it
gives instead is the tedious half: playback state that follows the element rather than guessing,
fullscreen and picture-in-picture across engines, and text-track modes. Measured at 8.9kB gzipped
for the eleven features the component names, against 10.1kB for the fifteen in the preset.

**It is three packages, not one.** This section used to hand the whole stack to `@videojs/core`,
which is loose rather than wrong: the component imports the eleven features from
`@videojs/core/dom`, `HTMLVideoAdapter` from `@videojs/media/dom`, and `createStore` from
`@videojs/store`. The core supplies the feature set, media supplies the adapter that binds one to
a `<video>` element, and the store is the state container the other two are assembled into.

The component binds to `@videojs/core/dom`, the vanilla layer, rather than to the project's custom
elements: `<media-play-button>` and its siblings are web components with a shadow root, which none
of Tailwind, StyleX or a scoped `<style>` can reach into. Rendering the markup by hand keeps all
three styling layers working.

**`attach` is the step, not the constructor.** `new HTMLVideoAdapter(video)` compiles, returns an
adapter and attaches nothing: measured, the clip played while `store.currentTime` stayed at zero
and `subscribe` fired not once.

## A clip is a picture, then a silent picture, then a player

What the controls look like, and why they take none of their colours from the page, is in
[styling/player.md](../../styling/player.md) -- this section is what they do. The player has three
stages and they are not decoration: each one is a different answer to "what is this thing", and the
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
sitting: see [engagement.md](../../engagement.md).

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

**The blur is made the way every other blur on this site is made.** A small copy of a photograph
is a small photograph: stretched back across a 668px frame it reads as a picture out of focus,
which is what the first version of this looked like and is not what the pictures look like. Their
placeholder is a _thumbhash_ decoded back to pixels -- a handful of coefficients with the rest
thrown away -- so it is a field of colour that was never pretending to be in focus. A clip's frame
is an image like any other, so it takes the same route: sampled, hashed with `rgbaToThumbHash`,
decoded with `thumbHashToRGBA`, and encoded through the canvas at the build's own quality.
Measured as mean neighbour difference, a captured frame reads 3.49 against 0.95 to 11.14 for the
build's own previews -- the same class of picture, which is the whole claim.

WebP through the canvas rather than `thumbHashToDataURL`, which writes an uncompressed PNG: the
build measured that at 3.3KB against a 144-byte WebP of the same pixels.

**The blur is a picture of where the clip actually is.** `preview` is the build's thumbhash, which
is a picture of the first frame: right for a clip nobody has moved, wrong for one the tab left at
fourteen seconds, and the blurred ground is the only thing on screen for that moment. So the record
keeps a hash of the frame it was on beside the position, and a reload blurs that instead. It is
optional: a tainted canvas returns nothing and the poster's own thumbhash is there underneath.
Tainting matters more than it used to, because reading the pixels back is now part of the route --
drawing into a tainted canvas is allowed and `getImageData` is not. The clips are served with
`Access-Control-Allow-Origin` and asked for with `crossorigin`, so in practice it is clean.

**A clip the tab remembers does not show itself until the frame is the right one.** Choosing the
blur correctly is not enough on its own: left alone, an element with metadata decodes and presents
frame zero, and the seek then replaces it in front of the reader. Measured, frame zero at 100ms
against a first paint at 80ms, with the remembered frame not until 315ms -- a quarter of a second
of exactly the cover the blur exists to avoid. Seeking earlier does not fix it either, because a
cached clip decodes frame zero before hydration has run at all. Script cannot win that race; what
it can do is decline to show the result.

**Only a remembered clip is held, and the head script is what says so.** Holding every clip by
default and releasing them from a component would make every reader wait for hydration to see a
picture: measured, a decoded frame at 68ms against hydration finishing at 335ms on a long article,
five times the wait to fix a case that reader does not have. A clip with nothing remembered has no
wrong frame to show, is never held, and is on screen as soon as it decodes with no script
involved. Measured after: the two fresh clips visible at 51ms, the remembered one held through its
seek and fading in on the right frame.

The release waits on `loadeddata` and `seeked` rather than on `requestVideoFrameCallback`. The
frame callback is the more precise signal and the wrong one here, because it fires when a frame is
presented for composition and a transparent element is not in a hurry to be composited -- measured,
that turned a clip ready at 100ms into one revealed at 407ms, the thing being waited for waiting on
the thing doing the waiting. There is a deadline behind both, because a wrong frame is a blemish
and a blank frame is a broken page.

**The choice is made before anything is painted, and it takes a script to make it.** There is no
declarative way: `sessionStorage` is a JavaScript API, and no media query, attribute selector or
server negotiation can read it. What can be chosen is _when_ -- an inline `<head>` script, running
synchronously before the parser reaches the first `<video>`, is as early as any decision about a
document can be made, and it is the same ground the theme script already stands on. Reading the
record during hydration instead meant a returning reader saw the thumbhash first and their own
frame a moment later: one blur replacing another, in aid of hiding a swap.

**The script emits values, not appearance.** Each remembered clip becomes a `--clip-ground` on a
selector matching it, and whether anything is drawn with that stays the component's business --
which is what keeps the blur from returning behind the letterbox bars in full screen, where the
component deliberately draws no ground at all. The thumbhash lives in the `var()` fallback, so a
reader with no record needs nothing to have run.

**The selector names the frame and not the `<video>`, and a custom property is why.** The ground is
drawn on the box the element sits in -- it has to be, because a held element is transparent and
takes its own background with it -- and a custom property inherits downwards and only downwards. A
`--clip-ground` set on the `<video>` is set on a _descendant_ of the one box that reads it, so the
frame's `var(--clip-ground, <thumbhash>)` took the fallback every time and a returning reader was
shown a blur of the opening frame after all. Measured on a clip left at two seconds: 999 characters
of remembered still in the record, the same 999 characters computed as `--clip-ground` on the
`<video>`, and a 194-character build thumbhash computed as the frame's `background-image`. The
element still needs `--clip-hold`, and inherits it from the frame, which is the direction that
works. The clip's name therefore sits on the frame as `data-clip`, and the selector is the bare
attribute rather than an element and an attribute.

Two values are produced and they are read by two different boxes, so a change to either half has to
be walked from where it is written to where it is finally used. Checking the head script alone
would have shown a correct value for the right clip; checking the stylesheet alone would have shown
a correct `var()` with a fallback. Both ends were right and the path between them was not.

Both halves of every entry are whitelisted before they reach the stylesheet: the clip name against
`[A-Za-z0-9._-]`, the still against a base64 data URI. The record is same-origin and the reader's
own, which is not the same as trusted -- a value that can put arbitrary text inside a selector or a
`url()` can write arbitrary CSS, and "our own code put it there" is an argument about today.

Measured on the box that reads it: the frame's `background-image` sampled at 250.8ms with zero
paint entries recorded, against a first paint at 272ms, and its value the 1027-character still from
the record rather than any of the three thumbhashes the server sent. Sampling the _value_ rather
than the box was what let this look right while it was wrong -- `--clip-ground` had always been set
on time, on an element nothing asked.

Measured against the picture as well, since the point of the blur is that it is a blur of
somewhere: the mean colour of a clip left at 21.98 seconds, its remembered still, and the build
thumbhash are (137, 141, 131), (139, 145, 135) and (49, 70, 63). Six apart against a hundred and
thirty-two.

So the poster does what a poster is for -- something to show while there is nothing better -- and
goes the moment the element has painted a frame of its own. What produces one is a seek, which is
why the restore above happens on the same signal: a clip the tab left at fourteen seconds is
showing its first frame until something moves it, and a clip with nowhere in particular to be is
nudged a ten-thousandth of a second, because assigning the position the element already reports is
not a seek and decodes nothing. Every source is seeked exactly once, tracked rather than inferred,
and the count resets when a rung swap calls `load()` and throws the decoded frame away.

**`readyState` does not mean a frame has been painted, and reading it as if it did is what broke
this.** `HAVE_CURRENT_DATA` and above say the _data_ for the current position is available.
Measured on a clip sitting at `readyState` 4 -- enough data for the whole thing -- with
`totalVideoFrames` still 0: nothing had been decoded, so the guard skipped the seek, so nothing
ever was. The poster came off an element painting nothing and what showed through was the
thumbhash beneath it, a blurred sixteen-pixel placeholder stretched across the frame.

`requestVideoFrameCallback` is the signal that a frame reached the compositor, and it is the one
used where it exists. Firefox does not have it, so `seeked` carries the same claim there: the seek
is unconditional, and a completed seek has by definition put a frame up.

The attribute comes back on `emptied` and `error`, the two ways a decoded frame stops being true:
a source swap, or a clip that has stopped working.

**It is kept while the clip runs, not only where it stops.** Pausing, ending and leaving the page
are still kept the moment they happen, and `pagehide` is the one that catches a reload -- but those
three were chosen when the entry was a number, and it is now a number and a picture of it. A tab
that is discarded, a device that sleeps, a phone that never reaches `pagehide` at all: each of
those leaves the picture from wherever the clip was last paused, or, for a clip played straight
through from the start, no picture at all. So `timeupdate` is used as a clock -- it fires only
during playback and stops on its own, with nothing to unwind -- thinned to one keep every two
seconds of wall clock.

**The still is the cost, not the write, and that is the opposite of what this used to say.**
Measured on a 1080p clip: the canvas draw and `toDataURL` together are 1.59ms, and the read, parse,
edit and stringify of the whole record are 0.01ms. `timeupdate`'s own four a second would be 6.4ms
in every second of playback; one in eight is 0.8ms, and buys a remembered picture that is never
more than two seconds out of date.

A clip that reached its end drops its entry rather than storing the duration, because a finished
clip starts again.

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
against is _scripting disabled_, and a sandboxed iframe without `allow-scripts` is exactly that:
give it `allow-same-origin` as well and the result can be read back. Six `<video>` elements where
three were wanted, and then three.
