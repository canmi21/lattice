# The rail, and the space beside the article column

The table of contents, the return control, and the region between the window's edge and the
article's first letter. Which of the three systems writing CSS is entitled to say each decision
here, and what happens where two of them say the same thing, is
[architecture/css/layers.md](../architecture/css/layers.md).

## The article is centred; the rail adapts to the region beside it

The table of contents and the return control are one rail down the left of an article, and they
move as one: the same box, the same left edge, written once and consumed by both. They differ
vertically and nowhere else.

**The article never moves.** It is centred in the window at every width, so the region to its
right is empty and exactly as wide as the region on its left. That left region is all the rail
has, and the rail adapting to it is never allowed to shift the article -- a column of text that
slides sideways as a window is dragged is a worse fault than any arrangement of the furniture
beside it. Below the width where the article can hold its own size, the article is what gives,
which is a matter this rule stays out of.

The region runs from the window edge to the article's **first letter**, and the rail's box is
centred in it. To the letter rather than to the column's frame, because the frame is not something
anybody sees: measured against it the rail sat 35px from the window and 60px from the text on an
iPad, and the 25px of column padding in between has nothing the eye can weigh it against, so the
rail reads as pushed left. The page gutter belongs to the region on this side exactly as it does
on the other. Three stages follow:

1. Too narrow: no rail. The article alone, centred, as on any other page.
2. Just wide enough: the rail appears and the spare room is thin, so the left margin takes two
   thirds of it and the gap to the article takes one. An even split here would be even between the
   wrong two things: the rail's leftmost ink is not its text but the return control's glyph, which
   hangs `--rail-icon-overhang` further out, and on an iPad mini an even split left that glyph 27px
   from the window while the entries had 47. Two thirds gives it 43, which is what the next stage
   gives it anyway.
3. Roomier: the margin holds flat at `--rail-hold` while the halves catch up.
4. Wide: the even split, the rail's centre line on the region's centre line, so its margin from the
   window edge and its gap to the article are equal.
5. Past `--rail-left-max`: the left margin holds still, and every further pixel goes into the gap
   between rail and article.

**Stage 5 caps the margin, and it used to cap the centre line.** That was right while the box was
`fit-content` and its width was the browser's answer rather than a number this file held. The box
is `--rail-width` now, so the two say the same thing and the margin is the one the eye reads --
and reading it is what showed the cap was set too far in. At 14rem of centre the rail sat 156px
from the window on a 1600px screen, which is a rail drifted halfway to the text rather than one
beside the window, and a rail is read from the corner of the eye.

It stops at 6rem, the same length the article column's top padding stops at. Past the width where
both are capped the page has one outer breathing room and spends it twice, down the side and above
the title. The whole sequence, in pixels:

| window | region | left margin | gap to text | branch     |
| ------ | ------ | ----------- | ----------- | ---------- |
| 1088   | 208    | 48          | 24          | two-thirds |
| 1120   | 224    | 59          | 29          | two-thirds |
| 1200   | 264    | 64          | 64          | hold       |
| 1280   | 304    | 84          | 84          | even       |
| 1360   | 344    | 96          | 112         | capped     |
| 1600   | 464    | 96          | 232         | capped     |
| 2560   | 944    | 96          | 712         | capped     |

Monotonic and continuous throughout, and every branch of it is one CSS expression.

**Stages 2 through 4 are one expression, and stage 3 is why.** Two thirds of the spare and half of
it are two lines that meet only at zero, so switching between them at a width steps the rail
sideways -- 21px, at the width that switched. A flat hold between them joins the branches where
`2/3 s` reaches the hold and again where `s/2` does, which makes the margin continuous at every
width and puts no second breakpoint in a file that already warns about the one it has. Measured:

| window               | spare | left margin | gap to text | glyph from window |
| -------------------- | ----- | ----------- | ----------- | ----------------- |
| iPad mini, 1133px    | 95px  | 63px        | 32px        | 43px              |
| 11-inch iPad, 1210px | 133px | 67px        | 66px        | 47px              |

The mini takes the two-thirds branch and the 11-inch the even one, which is the pair `--rail-hold`
was chosen against.

Stage 3 exists because a rail is read from the corner of the eye. Left centred forever it drifts
inward as the window grows, and on a wide monitor a rail halfway to the text is neither beside the
article nor at the edge of anything.

### The rail's box is one declared width

It is one box in the DOM, holding both the table of contents and the return control, rather than
two elements agreeing on a number. `translate: -50%` centres it. **The width is declared --
8.5rem -- and is the same on every article, in every language, and in the first frame the server
sends.** Nothing measures anything to arrive at it.

Getting here took two wrong answers, and both are worth keeping because each looks correct until
it is running.

**A measured width published as a custom property.** No server can know it, so the page painted
at one position and jumped to another the moment it hydrated.

**A box sized to its entries.** `width: fit-content` reads as obviously right -- the entries are
the only thing a reader sees, so why centre anything else -- and it is stable within one view: a
web font swapping in re-sizes and re-centres it with no listener to forget. What it is not stable
across is _content_. The box moves its own centre whenever its entries change width, and the
return control is centred on that box, so the control tracks the length of the longest heading.
Switching one article between languages took the widest entry from 48px of Korean to 104px of
German and slid `Back` 28px across the page. Measured across the corpus, the source views alone
spread the box from 3.25rem to 8.34rem.

That is the fault: **the return control is a fixed part of the page and has no business tracking a
heading.** A reader switching languages is comparing two views of one article, which is exactly
when a control moving 28px is most visible and least explicable.

**8.5rem is where the source headings stop.** The widest source view reaches 8.34rem; the rest
are well under. A translation longer than that wraps, which is what the second line is for -- and
in the article whose headings are longest, five of thirteen Spanish entries take it. Wrapping is
a legible outcome and a moving control is not, so the trade is made in that direction.

The cost is accepted rather than hidden: an article with short headings no longer fills its box,
so its entries sit left of centre with space to their right. That space buys a control that does
not move.

**The number lives in more than one place, and nothing but a pointer connects them.** It is
declared as `--rail-width` in [utilities.css](../../apps/site/src/styles/utilities.css), argued
here, and turned into a column budget across the language boundary by `ONE_LINE` in
[width.rs](../../apps/local/src/i18n/width.rs), which the CMS holds a translated heading to and which
[i18n/segments.md](../i18n/segments.md) explains under "A section heading is also a label, and the rail is narrow".
That budget is **19 columns**, and it is measured in the rendered rail rather than computed from
this width: a label is given the whole 136px, since nothing in the box takes any of it, and at the
13px the entries draw at ten Han characters fit -- twenty columns -- against nineteen Latin ones,
so the smaller is the budget. It held 28 for a long time, from a 192px cap belonging to no rail
the site ever drew, and each record now names its siblings so the next such number is seen beside
what it is derived from rather than one record at a time.

**A wrapped entry gets two comparable lines**, through `text-wrap: balance` on the label. Left to
fill and spill, the break lands wherever the width runs out -- `Independencia de la` over `UI` put
nineteen characters above two, which reads as a mistake rather than as a wrapped label. Balance is
built for exactly this shape of text, short and headline-like, and it evens out one label's own
lines without looking at its neighbours. Where it is unsupported the text fills as before.

**Balance evens the lines; it does not choose where the break may land, and for Han that is the
part that matters.** The label also carries `overflow-wrap: anywhere`, which lets a break fall
between any two characters. For a run of Han that is usually right, and next to a space the author
wrote it is not: `不使用 JS 运行时的代价` came out as `不使用 JS 运` over `行时的代价`, splitting a
word to fill three more characters when the boundary had already been written as a space. Balance
left it there, because two lines of eleven and five characters are comparable -- the fault was in
which breaks were allowed, not in how the lines were evened.

So a script whose spaces are boundaries prefers them: `word-break: keep-all` for `:lang(zh)` and
`:lang(ko)`, which turns that entry into `不使用 JS` over `运行时的代价`. `overflow-wrap: anywhere`
stays underneath as the floor, so a Han run with no space in it still breaks wherever it must,
exactly as it did before.

**Japanese is excluded, and the measurement is the argument.** Its spaces are not boundaries in
the same sense, so `keep-all` there only removes the opportunities the script does have:
`Web フレームワークだけではない` came apart into four lines, one of them a single kana. Korean is
included on the script's terms rather than on a case observed here -- no entry in the corpus wraps
in Korean yet, and the first one that does would otherwise split mid-eojeol, which is the same fact
the article prose takes `keep-all` on.

Latin was measured too and left alone. `keep-all` moves two of its breaks, one for the better --
French stops splitting `sans-runtime` -- and one for the worse, German stranding an opening quote
at the end of a line. Nothing there was asking to be fixed.

Collapsing changes nothing: the bars occupy less of the box, and the box, the centring and the hit
area stay where they were.

**Nothing inside can widen the box.** The return control is taken out of its flow and the active
indicator is absolutely positioned, which is what lets the indicator and the return icon hang
outside its left edge as ornaments. Both are tuned to that edge: the icon is translated left of it
so the word the control carries lines up with the entries, and a box drawn around either would
push every entry right by the width of a decoration.

**Nothing inside narrows it either, which is what makes the width mean one thing.** No element
between the box and a label's text carries padding, a border or a narrower cap, so `--rail-width`
is the box _and_ the measure a label's text is given: all 136px of it, with the indicator and the
return glyph outside. That is why `ONE_LINE` above can be read off the declaration rather than
off the layout, and it is the part worth not re-measuring -- measured at every window width the
rail is drawn at, the label's content box is 136px on the nose.

The breakpoint that decides whether the rail appears at all is derived from this width by hand --
`8.5rem + 2 * 1.5rem` of clearance beside each side of a 45rem article -- because a media query
cannot read a custom property. It is no longer a test of whether the widest possible rail would
fit; with one declared width it is the rail. Change the width and change that number with it.

### Collapsed, the bars are a thumbnail of the list

The collapsed rail reads as the table of contents seen from too far away to make out words: how
long each entry is, and where the list rises and falls. That is all anyone reads off a column of
bars, and it is the whole design brief -- **a thumbnail, not a chart**. Exact widths were tried
first and said less than they cost; below a tenth of the longest heading the differences are
noise dressed as precision.

**An entry that wraps contributes half its width per line.** Measured flat, a heading that will
occupy two lines still reported one long line -- and being the longest, it set the scale every
other bar was divided by. The rail's longest bar then belonged to the one entry that is not a long
line at all, and everything else was flattened underneath it. The width is measured in the
label's own font rather than the heading's, because the wrap happens in the rail at the rail's
size and the two fonts are not proportional to each other.

**Ten steps of the longest heading**, so a bar is the fraction of the longest heading that this
one is -- which is what it looks like it means. Scaling between the shortest and the longest
instead would spend the whole range on whatever spread the article happens to have, drawing two
headings of six and seven characters a third of the rail apart.

Three rules then shape the column, and each exists because the step alone produced something
that read badly.

**No entry stands more than three steps above a neighbour, and the outlier comes down.** Raising
everything around it satisfies the same constraint and is not the same thing: one entry towering
over its neighbours is what reads badly, so the fix is to pull _it_ back rather than stretch the
rest of the column toward it, which would spend the top of the scale on an article that has
nothing that long in it. **The tenth step is therefore not something every article reaches** --
it is there for a heading long enough to earn it against the company it keeps, and an outlier, by
being an outlier, does not.

**Two neighbours on the same step are separated by one step**, toward whichever side they were
already nearer. One step rather than more: these two headings are genuinely the same length, and
a bigger push would say they are not. Two steps was tried and is too much -- with evenly sized
headings it leaves only differences of two and three, so the column can do nothing but alternate,
and equal headings get drawn three steps apart. **A tie is broken by the heading's own text**, so
the same heading falls the same way on every render while two different ones in the same position
do not; anything derived from the index would make every article break its ties identically,
which is a pattern rather than a choice.

**A column where nothing reaches the low end slides down until its shortest entry rests on the
third step.** An article whose headings are all long has no short bar to anchor it and reads as
uniformly heavy, with the bottom of the scale unused. The third step rather than the first,
because the shortest entry in such an article is still a long heading. This is **a shift, never a
rescale**: every difference above it was chosen by the two rules, and rescaling would quietly
undo them, where moving all of the steps by one amount changes none of them.

So neither end of the scale is guaranteed. The first step is reached by an article that really
has a two-character heading among longer ones; the last by one that has a heading long enough to
earn it. The middle is where every column lives.

**A bar may never be wider than the widest label.** The box is `fit-content` around the entries
at full expansion, which holds only while the text is the widest thing in it -- and in an
article whose headings are all short it is not. Two of them had a longest label of 52px against
a 64px bar, so the bars sized the box, and hydrating them from their served width to their real
one widened it under a control centred on the same box: the rail sat still while `Back` slid 6px
left, over the whole length of the bar animation. Capping the bars at the widest label as drawn
restores the invariant rather than patching the symptom -- a thumbnail should not be wider than
what it is a thumbnail of.

Every bar is served at the fifth step and animates to its own, so the column resolves outward
from the middle rather than growing from nothing.

### The active mark opens with the column, not to where the column is going

The mark beside the entry being read is drawn only while the rail is open, so every hover is the
one occasion it has to appear -- and it appears while the column beneath it is still fanning out
of its collapsed stack. Its open position is therefore where its entry is _going_, and writing it
there the moment the mark becomes visible puts it as far from its own label as everything above
that label has yet to expand: a tenth of a column for the first entry and the better part of one
for the last. Nothing then moves it, but the rail grows around its centre underneath it, and the
mark rides up with the box -- measured at 209px of separation at the instant it appeared and 125px
of travel afterwards, which reads as the mark flying in rather than the column opening.

**So the mark is drawn from the layout the rail is in, frame by frame, and stays on its entry
throughout.** It is beside its label when it appears and beside it when everything stops, and it
fades in on the labels' own tween rather than switching on part-way through theirs.

Those frames are reconstructed rather than read off the rail. Only two lengths move during a
reveal -- what is left of a bar, and how much of a label has arrived -- and both are run against
the same two constants the bars and the labels are run against, so a frame of the layout is
arithmetic in them. Sampling the column instead would mean a forced layout every frame to learn
what this side already knows, and the answer read back mid-flight is the unreliable one: a button
measures 28px in flight and 24px at rest. It is the same answer the return control gives to the
same question below, for the same reason.

### One property, one writer

**Every animated property on the rail has exactly one thing writing it.** The mark's opacity is
written by the per-frame reconstruction above and by nothing else; a bar's opacity is written by
its animation and by nothing else. This has been broken twice, in two different ways, and neither
failure announced itself.

**A value set behind the animation's back is never rendered.** The library keeps a value per
element and property, so a property it has animated once, and that is then assigned directly,
reads to it as already at its target. Nothing is drawn. This is how the mark came up at full
strength on a first hover and not at all on any hover after it.

**And a reactive `style` attribute is a writer, however little of it is reactive.** Svelte
compiles an interpolated `style` to an assignment of the whole `cssText`, so a template that
interpolates one value in it rewrites every declaration in it -- erasing what the animation put
there, and guarding only against its own previous string, never against the animation's writes.
Render effects run before user effects in a flush, so the sequence per handover was: the template
snaps both bars to their destination with no animation; the animation then resolves its start
from the value it cached before the wipe, jumps both back, and springs. One frame at the
destination, then a jump home, then the move -- on two bars at once, in opposite directions. That
is the flicker the reading cue had while scrolling, and it was intermittent only because an
animation still in flight masks the wipe: handovers closer together than the spring's settle look
clean, and one after the column has come to rest shows all of it.

**So a template writes the first paint and then stops.** What a server renders is the honest
resting state -- no entry is being read, because nothing has scrolled -- and the moment there is
an entry being read, the property belongs to the animation. The one place that needs care is the
handover at mount: an effect that skips its first run leaves nobody to draw a mark the template
no longer draws, which on a page opened partway down would leave the entry unmarked until the
reader next scrolled.

### Absent rather than squeezed

The rail appears only where the region holds it with `--rail-edge` clear on both sides. An earlier
rule gave it whatever the region had, so between the old breakpoint and the width it actually
needed it was drawn narrow and pressed against the window edge, where entries wrap to three lines
and the column reads as something that fell off the page. A control that cannot be shown properly
is better not shown: the headings are still in the document, and the article is what the reader
came for.

The test is made against `--rail-width` rather than the measured box, because a media query
can read neither. So it asks whether the widest rail this site can draw would fit, and an article
with short headings is shown no earlier than one without -- the alternative is a breakpoint that
moves per article, which is a worse thing to explain than a conservative one.

`--rail-edge` decides both when the rail appears and how much air it has when it does, and the two
cannot be separated: centred in the region, its margin and its gap are the same length. Raising it
buys a rail that never looks cramped at the cost of a band of window widths that show none.

**The breakpoint is now three rem conservative, deliberately left so.** The region grew by the page
gutter when it was redefined to reach the text, so the clearance test it encodes is met at 65rem
rather than the 68rem the media query still holds. Moving it would make the rail appear on windows
that have never shown one, which is a change to what the page is rather than to how it is spaced,
and the spacing fix did not need it. The number stays where it is until somebody decides that
question on its own terms.

### Rejected: centring the rail and the article together

Treating rail, gap and article as one block centred in the window balances the page at every width
and was built to see. It moves the article -- right by half the rail as the rail appears, and off
the window's centre from then on. The article holding still is worth more than the balance.

The lengths this is computed from sit together on `:root` in
[utilities.css](../../apps/site/src/styles/utilities.css) so they can be argued with in one place. One
is repeated by hand: the width at which the rail appears is written as a number in the media query
and has to be kept in step with the ones it is derived from.

## The space above the title is the space beside it

The article column's top padding is not a number chosen per width. It is the distance from the
window's edge to the first letter, measured on the side and applied to the top, so the text sits
the same distance from the edge above it as from the edge beside it.

Below the column's cap that distance is the page gutter and nothing else: a phone gets 1.5rem, the
same length `px-6` spends on each side, and the heading sits an even margin from three edges. Past
the cap the column stops growing and every further pixel of window becomes margin, so the distance
grows and the heading is pushed down by exactly what has opened up beside it. One expression,
continuous through every width, with no breakpoint and no script in it:

```css
padding-top: clamp(var(--page-gutter), var(--page-gutter) + (100% - var(--rail-column)) / 2, 6rem);
```

**The cap is what makes the two stages meet without a step.** 6rem is what the top was before any
of this and what the bottom still is, and the growing gutter reaches it at 54rem -- fourteen rem
before the rail appears at 68. So by the time the page grows a table of contents the heading has
already settled where it used to be, and the rail's arrival moves nothing vertically. Reverse that
ordering and the breakpoint becomes a jump. Measured:

| window | side gutter | top padding | rail |
| ------ | ----------- | ----------- | ---- |
| 390px  | 24px        | 24px        | no   |
| 744px  | 36px        | 36px        | no   |
| 1133px | 231px       | 96px        | yes  |

The bottom keeps 6rem at every width and is not part of this. The space under the footer competes
with nothing, so there is nothing for it to yield to on a phone -- which is the asymmetry's whole
justification: the top is expensive because it stands between the reader and the first word, and
the bottom is not.

`--page-gutter` exists so the length the sides spend and the length the top spends are one
declaration. Changing it, or `--rail-column`, moves where the cap is reached; check it still lands
below 68rem.

## A subsection is nearer, and for that reason unlisted

An article may carry a second heading level. It renders at the same size, weight and colour as
a section, and differs only in sitting closer to what precedes it -- `mt-8` where a section
takes `mt-12`.

**Type size cannot carry this distinction, because it is already spent.** The scale runs 16px
title, 15px heading, 14px prose: one pixel apart, separated by weight rather than size. A third
level below that lands on the prose size with only weight left to spend, and weight is what
divides a heading from prose in the first place. Enlarging the section to make room would undo
the restraint the whole scale is built on. Space is the remaining signal, and the honest one:
sitting nearer says _this belongs to what is above it_, which is exactly the relation.

**Only sections are listed in the table of contents.** The rail is 8.5rem wide -- 136px at the
default root size -- and collapses to a column of bars: a way to reach a section rather than an
outline of the article. A subsection is reached by arriving at its parent and reading on. The
figure here read 192px, which is a correction: `--rail-width` in
[utilities.css](../../apps/site/src/styles/utilities.css) declares `8.5rem`, and "The rail's box is
one declared width" above said so while this sentence said otherwise.

The two rules hold each other up, and neither works alone. Filtering the rail while the two
levels look identical would make the listing look incomplete: a reader who cannot see that a
heading is a subsection can only conclude the table of contents lost it. Made visibly nearer,
the same listing reads as complete, and needs no explanation. It also keeps the levels honest
for a screen reader, which is told the nesting either way.

**What is filtered is the listing, not the address.** Both levels are anchored, both resolve,
and a link to a subsection works exactly as before. Demoting a heading is therefore reversible
in the reader's terms even though it changes the segment id -- see [i18n/segments.md](../i18n/segments.md) on
migrating the translations rather than rebuying them.

Which headings may be demoted is a question about the article, not about the rail: a subsection
is one its parent can stand for. Demoting a heading because it is short, or to tidy the rail,
trades a reader's ability to reach it for an appearance, and that is the wrong way round.

## The return control rests level with the title

The control at the top left of an article sits on the same line as the article's heading. The two
are the first things on the page, and one floating above the other reads as attached to nothing.

It leaves that line only when something is in its way, which is the table of contents: opened
under the cursor, or simply tall with entries in a short window. What counts as "in its way" is
half the control plus the gap it keeps from the first entry, measured rather than assumed so a
larger root size or a second line of text moves the threshold with it. Nothing here knows whether
the entries are open or merely numerous -- both are a taller rail, and the same rule answers both.

Below twice that clearance there is no room left to keep, and the control takes the middle of the
band that remains rather than being pushed off the top edge. The two expressions are equal exactly
where they meet, so the control slides between them as a window is resized instead of jumping.

The rule before this one put the control in the middle of the band above the entries whether or
not the band had room to spare. On an ordinary article that sat it 12px above the title -- close
enough to look like a mistake rather than a decision, which is what it was.

## Article home navigation yields to the table of contents

On a wide article viewport, the return control occupies the empty interval between the top of
the viewport and the rendered top of the table of contents. Its icon aligns vertically with the
article title in the collapsed default, giving that interval a deliberate upper bias rather than
an arbitrary fixed offset. Expansion keeps that alignment while there is room. Only when the ToC
would cross the corresponding midpoint does the control rise to the live midpoint between the
viewport and the ToC, splitting the remaining space evenly without moving the ToC itself.
Following that boundary must not add a second layout loop to the ToC animation. The return control
calculates its collapsed and expanded endpoints before the state changes, then runs its own spring
between them with a compositor transform. It does not sample the ToC's intermediate geometry or
inherit its trajectory, but the spring is tuned so both controls visually arrive and settle
together. A reversal starts from the control's current position, and reduced-motion preference
changes snap to the corresponding endpoint.

The text begins on the same vertical line as the ToC labels and bars. The return icon sits beyond
that line, making direction peripheral while the words preserve the rail's alignment.

The initial document already contains the collapsed ToC and the return control in their resting
positions. Heading identity and order are compile-time article structure, so withholding them
until the browser scans rendered headings only creates a late structural insertion. Browser-side
measurement progressively replaces the ToC's equal placeholder bars with widths derived from the
rendered labels; it does not create the navigation itself.

The control is absent with the ToC rail on narrow viewports. Moving it into the article column
there would turn a desktop spatial aid into another piece of article content and compete with
the title for the first line of attention.

At the other end of the article, its bottom edge becomes the side rail's lower boundary. The
resting layout does not move until the ToC would cross that edge. After contact, the ToC follows
the article end upward as the reader scrolls; expanding it keeps its bottom pinned and grows only
upward. The boundary is the end of `<article>`, before the blank interval and Newsletter divider,
so article navigation does not continue into the page's next region.

The return control applies the midpoint rule once to each resting ToC state, fixing the distance
between them until viewport resize or rail geometry changes. When the article end moves the rail,
the same lower-bound offset is added to both controls instead of dividing their new gap again.
They therefore leave the viewport as one spatial group. The return spring still interpolates
between its own collapsed and expanded endpoints, so a hover transition keeps an independent
trajectory even while both endpoints share the scroll displacement.

Scroll handling uses a cached document-space article end and observed box sizes: a scroll frame
performs arithmetic and compositor writes, not fresh layout reads. A pre-hydration frame applies
the collapsed endpoints after browser scroll restoration, before the component observers take
over, so reloading at the article end does not leave the rail centered until hydration.

## Back is one step up the reading trail {#back-is-one-step-up-the-reading-trail}

The return control at the top left of an article does not mean "the homepage". It means one step
back the way the reader came, which is the homepage only when that is where they came from. A
reader who followed a card from one article into another and is then sent home has lost the
thread they were reading, and the control that did it looked like the way back.

The trail is a list of paths in `sessionStorage["trail"]`, named the way the `localStorage` keys
in [engagement.md](../engagement.md) are -- one lowercase noun, no prefix. The storage was chosen
for its lifetime rather than its convenience: one tab, surviving reloads, gone when the tab
closes. Two tabs on one site are two readers here, and they get two trails.

**The browser's own history is not this.** Its previous entry may be an anchor jump inside the
same article, a locale switch, or a page on somebody else's site -- none of them a step in a
reading trail, all of them indistinguishable from one at the moment Back is pressed. Nothing but
the trail records the sequence, which is why it is recorded rather than inferred.

Two consequences worth knowing before changing it. **The record carries the page it belongs to**,
because a reload arrives looking exactly like a fresh visit, and a trail that could not say which
page it was for would offer a way back to somewhere the reader never was. And **arriving at a
page already on the trail cuts back to it** rather than appending, whichever way the reader got
there -- this control, the browser's button, a link that happens to point back. Stated once, it
saves special-casing each of them, and it is what stops two articles that link to each other from
growing a trail between them without end.

Every page records, not only articles, even though only an article shows the control. The step it
has to remember is usually taken somewhere else, and a page that declined to record itself would
be a hole the next article's Back link falls into.

The server cannot see any of this, so the markup ships the homepage -- right for a reader
arriving directly, which is everyone the server can see -- and the destination is corrected after
hydration. Nothing moves when it changes: the label is the same word either way, which is what
makes the correction invisible rather than a flicker.
