# A caption, from the track it is cut from to the line it is set as

How a track is cut to an excerpt and checked, and how a cue is typed and placed once the player
draws it. The player around it is [player.md](player.md); the type it inherits is the prose's, and
that stack is [architecture/fonts.md](../fonts.md).

## A caption is set in the page's voice and placed in the black

**The type is the prose's, and that is the whole of the decision.** The body's stack already names
a Latin face and then a CJK one, and a browser picks per glyph, so `font-family: inherit` sets a
caption in either script the way the paragraph above it is set. The colours are the player's
rather than the page's, for the player's reason: a caption is read against a frame this site does
not choose and which changes twenty-four times a second.

**Whether it breaks is decided here, not in the file.** The files arrive already broken, and they
are broken for a column narrower than most of the places they are shown: a caption that would sit
comfortably across two thirds of the picture was cut in half anyway. So the break in the file is
treated as a suggestion about _where_ rather than an instruction to break at all.

One number decides whether. A caption that fits within 90% of the picture's width stays on one
line however the file was written; above that it breaks. Measured on a 672px picture, all nine
cues of a clip came back to one line, at 122 to 479 against a threshold of 605.

**Where it breaks is a separate question, and the answer is balance rather than fill.** Filling the
first line is the obvious rule and it is wrong: it strands whatever is left. Measured on a 452px
picture, filling broke "A car drives down the highway, then it disappears into a tunnel." at 358
and 61 -- a second line of two words, which is the shape a caption should never take. Choosing the
break that leaves the two lines most nearly equal puts it after "highway," instead, at 208 and 207.
Punctuation is worth a nudge rather than a veto: a clause boundary is a better place to stop than
an arbitrary word boundary, but not at the cost of two lines that do not match.

The width measured against is the _picture's_, not the element's: in full screen the bars are part
of the element and no part of what a caption has to fit across. The originals are kept, because
every recompute rewrites the text and without them the second pass would be measuring the first
pass's answer.

**Where it sits is a question only full screen asks.** In an article the frame is 16:9 and the
picture is cropped to fill it, so there are no bars and the bottom of the picture is the bottom of
the box. Full screen fits rather than crops, so a window that is not the clip's shape leaves black
above and below -- and a caption drawn at the bottom of the picture covers picture that did not
need covering.

So the bar is measured, and it gets the caption only if it is **half again as tall as one**.
Holding the caption is not the test and never was: a bar the exact height of a caption puts it
against both edges at once, which reads as an accident rather than as a placement. At one and a
half the leftover is half a caption, a quarter of one above it and a quarter below, and that is
the least that looks deliberate. Below that ratio the bar is refused even though the caption would
fit in it, and the caption goes over the picture instead.

**A caption on the picture is held off its bottom edge, by an amount taken from the caption rather
than from the box.** The same gap under a caption twice the size looks half as big, so the
clearance is 0.8 of the size the caption is set at -- 12.8px under a 16px caption in an article,
24px under the 30px one a full screen gets. What it replaces is 3.5% of the _element_, which was a
different quantity in every shape: 13.2px in an article, 8.8px on a phone, 35px in a
thousand-pixel window, and exactly nothing where the picture was fitted and the bar too shallow,
since there the caption was drawn at the picture's own bottom edge and its descenders were cut off
by the letterbox.

**The caption's height is its line boxes and nothing else.** The plate is painted to exactly that
box rather than around it: measured on a 668px frame at 16px, a one-line plate runs 653.0 to
675.0, 22px against the 21.6 the 1.35 line-height asks for; on a 448px frame at 14px a two-line
plate runs 530.5 to 568.5, 38px against 37.8. The figure used to carry an extra 0.4 of the size
for what the plate was said to add above and below, and the plate adds nothing -- 6px of fiction
at 16px and 12px at 30px, which pushed every centred caption that much below the middle of its
bar.

**Sideways, the plate is padded with text, because a cue cannot be padded with CSS.** WebVTT
publishes the properties that reach a cue and `padding` is not among them: `padding: 0 0.5em` in
the stylesheet, served to a fresh navigation, left the plate the same 443.0px it is without it. So
a fixed space sits on each side of every line -- fixed rather than ordinary because only U+0020
and the tabs and newlines beside it collapse, and a collapsing one is dropped at exactly the two
positions it is wanted in. It is a fraction of the em, so it grows with the caption, and it adds
no height. The reachable widths are the characters themselves: 4px a side for the thin space this
takes, against 8 for the no-break space, 7 for the four-per-em and 2 for the hair. A width between
them means setting the pad in its own cue class and scaling it with `font-size`, which is worth
doing the day the exact number matters. The wrapping is then decided on the padded line, since the
plate is what has to fit across the picture.

Measured in the window-filling mode, which is the same fitted picture and the same code as a full
screen. At 900x900 the bar is 196.9 against a caption of 57.4, so the caption is centred in it:
69.8px of black above the block and 69.7 below. At 1000x730 the bar is 83.8 against a caption of
63.8 -- enough to hold one, not half again -- so it is refused, where before the caption sat in it
with 5.3px of black under its descenders; it now sits on the picture, 18.9px above an image ending
at 646.3. At 1200x800 the bar is 62.5 and never had a chance; the caption's bottom edge moves from
737.5, which was the picture's own bottom edge, to 714.8. In an article nothing moves: 96.5% was
13.2px of clearance and 0.8 of a 16px caption is 12.8.

This is reachable at all because **cues are positioned against the element box rather than the
picture**: `line` as a percentage of a box that includes the bars can put a cue inside them. The
files already say `line:96.5%,end`, so `lineAlign` is `end` and `line` names the bottom edge of
the cue box, which is the edge that has to clear the picture. **The file is the only thing that
says so in Chrome**, which parses the `end` out of the cue and then does not expose `lineAlign` on
the object at all -- `'lineAlign' in cue` is false there, so the assignment that sets it is for
the engines that do have it and a track written without `,end` would be placed by its top edge.

It is also the file that stands when nothing can be measured. A clip whose metadata has not
arrived has no picture to measure a bar against, so the computation declines to run and
`line:96.5%` is what the reader gets.

**It is recomputed on shape and never on cues.** A caption is one line or two and nobody knows
which until it arrives, so measuring each one would put every caption in a slightly different
place and read as jitter. The height allowed for is the worst case, two lines, and the answer is
recomputed only when the shape it was computed from changes: the window resizing, and either full
screen being entered or left. Measured across ten samples spanning several one- and two-line cues,
the line stayed at a single value and moved only on leaving full screen.

That worst case is also what the bar is measured against, and what is centred in it, and the two
follow from each other: a fixed bottom edge cannot centre a one-line caption and a two-line one at
the same time, and the one that is centred has to be the one the space was reserved for. So a
caption that turns out to be a single line hangs at the bottom of its reserve -- half a line, 14px
at the size a 900px-tall window gives -- below the middle of the bar. The alternative is to centre
one line and let a second grow upwards, which puts a two-line caption against the picture's bottom
edge in the narrowest bar this rule accepts; reserving the worst case is the error that falls on
the common case rather than on the awkward one, and it is bounded by half a line either way.

## Captions are a fact about the reader, not about the clip

A reader who turns captions on has said something about themselves -- a quiet carriage, an accent
they find hard, or simply that they read faster than they listen -- and none of it is a fact about
whichever clip they happened to be watching. So there is one answer for the whole site, in the
`reader` record, alongside their volume.

**A clip with no tracks is not an answer.** It cannot show captions, so the store reports them as
not showing, and a preference that mirrored the store would be turned off by every silent diagram
and title card on the page: the reader says "on" once and has it taken away by a clip that was
never able to honour it. So the preference is written only by the button and read only where there
are tracks to read it onto. A clip without them does not use the value and leaves it exactly as it
was, and the next clip that has them comes up with captions already on.

That also gives one path onto the clip rather than two. Whether the answer arrives as a press now
or out of the record at load, the same effect puts it there.

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
in `data/record/media.yaml` is that offset, so the original timing is an addition away, and the two must
now agree -- change the window and the track is re-cut, exactly as the rungs are re-encoded.

A cue straddling the window's start clamps to zero rather than being dropped: WebVTT timestamps are
unsigned, so a negative one loses the cue or the file, and zero is the accurate statement anyway --
the cue _is_ on screen at the instant the clip begins. The end clamps to the clip's length for the
inverse reason.

### The pairing is checked by arithmetic, and the arithmetic is not about the track

`local captions <clip> <track.vtt> --language <tag>` is a command of its own rather than a branch of
the import, because a clip and its track do not arrive on the same day and often the track never
arrives at all. Two of the three clips here have none.

It refuses on two things. **The excerpt and the clip must be the same length**: `excerpt` in
`data/record/media.yaml` was written by a person and `duration` in the manifest was measured by ffprobe,
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
SPARKS]` under the Mac Pro film is not subtle. The language is not checked either, for the same
reason the pairing is not, which is why `--language` is required and never inferred.

The window has one home. There are no `--from` and `--to` flags: the cut file cannot record where
it came from, `excerpt` is the one written account of it, and a flag would be a second place to put
the same fact with no trace of which was used.
