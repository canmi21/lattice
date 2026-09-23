# The blocks an article body holds

Code, diagrams, pictures and cards -- what a body carries that is not a paragraph. Which of the
three systems writing CSS is entitled to say each decision here, and what happens where two of
them say the same thing, is [architecture/css/layers.md](../architecture/css/layers.md).

## A code language keeps its own name

The language label on a fenced article code block uses the canonical display name supplied by
the syntax grammar catalog: `HTML` remains an initialism, while names such as `TypeScript`,
`JavaScript`, `Objective-C`, and `C++` keep their established casing and punctuation. A fence
alias resolves to the same display name as its language id, so `ts` and `typescript` do not create
two visual names. Plain-text fences keep the label hidden. If a fence names a language outside the
catalog, its authored spelling is preserved rather than uppercased or guessed. Resolution happens
while content is compiled so the browser does not download the grammar catalog merely to print a
short label.

That same top-right position is the code block's copy control. At rest it retains the language
label, or an empty but focusable hit area for plain text. Pointer hover and keyboard focus keep that
label in place while a copy icon enters on its right: `motion` slides the right-anchored inner pair
through a clipping boundary, so the label yields left without a sudden replacement. The transparent
interaction area already has the final revealed width and never changes during the spring; an
animated hit boundary would repeatedly enter and leave a slowly approaching pointer. Reversing the
interaction continues from the live position. Without a language label there is nothing to yield:
the hit area keeps the same geometry and `motion` reveals the icon in place through opacity and
scale, without a lateral entrance or layout movement.

Activation copies the original source rather than reading highlighted HTML, then changes the icon
to a check or cross. Feedback remains for as long as pointer hover or keyboard focus remains. On
leave it starts a short delay before returning to rest, regardless of how long the result was
already visible. Returning before that delay finishes cancels the reset and preserves the result;
the next leave starts a fresh full delay. Its accessible name and live feedback come from the UI
message table. Closing hides the current check or cross before resetting to the copy state, so no
resting icon flashes through the exit. Reduced-motion readers receive each state without the mask
or icon transition.

### The light syntax theme is One Light's palette under One Dark Pro's rules

Shiki's bundle holds 65 themes and two of the One family: `one-dark-pro` and `one-light`. There is
no `one-light-pro`, and the pair is mismatched because of it. One Dark Pro is the elaborated One
Dark -- it colours 250 scopes One Light leaves alone, bare identifiers among them -- so a light
page read beside a dark one looked bare, and the difference was visible in ordinary prose: the
component name inside a closing JSX tag is coloured in dark and was not in light.

So the light half is derived rather than picked.
[one-light-pro.ts](../../apps/site/src/lib/content/build/one-light-pro.ts) keeps every rule One
Dark Pro writes and swaps only the colour, through a table pairing the two
palettes. The pairing was voted from the selectors both themes already define, so it is One Light's
own answer wherever One Light has one; four colours had no shared scope and were settled against
what One Light does with the same scope family. A colour with no counterpart throws rather than
passing through, because a dark colour surviving onto a light page is the kind of wrong that
reaches a reader before it reaches a test. Measured on the case that started it, the derived theme
colours the same 63% of tokens One Dark Pro does, against One Light's 54%, and spends no colour
One Light does not.

**The theme is not a palette the interface may read.** It is a third component-local mirror beside
Cargo's and Mermaid's, exempted for the reason those are --
[architecture/css/authoring.md](../architecture/css/authoring.md), "Colour is never retyped" --
and the open question about where such a palette should live is
[css.md](../todo/css.md), "Tokei draws from a palette of its own, and it is the third one".

**A theme change is a recompilation of the corpus, not a deploy.** The colours are resolved while
an article is compiled and stored in its published object, so nothing on a reader's machine can
change them. What that costs and what deferring it would cost is measured in
[architecture/delivery.md](../architecture/delivery.md), "Where the syntax colours are resolved".

### A scrolling code block fades at both edges instead of drawing a bar

Code wider than the column scrolls and no longer shows a scrollbar for it. What says it scrolls is
a fade at each edge, and each is exactly as wide as the gutter it starts over -- the distance from
the frame to the first character. That width is what makes the pair need no scroll position to be
correct: at rest each fade lies over its own padding and veils nothing, and each begins working the
moment code starts passing under it. A bar was a second affordance that also moved the block's
height on platforms reserving room for it.

The scroller's end padding had to be made real first. Shiki's `pre` is a block and takes the
content width, so a long line overflows the `pre` rather than widening it, and a scrollable area
grown by a descendant's overflow is not given the container's padding: the reserved right column
bought nothing the moment a block scrolled, leaving code to run under the copy control and, once
there was one, under the fade. Sizing the `pre` to its own content restores it, and is what keeps
the last characters of the longest line clear of the fade at full scroll.

### A titled code block is one framed disclosure

A fenced code block may carry `title`, `collapsible`, and `default` presentation metadata. A title
creates a header that remains visible in both states. It is collapsible unless explicitly fixed
open with `collapsible="false"`; its initial state is expanded unless `default="collapsed"` is
written. `default` accepts only `expanded` and `collapsed`. Collapse metadata without a title, an
unknown value, or a fixed-open block that asks to start collapsed is an authoring error rather than
a state the component guesses how to repair.

The titled form is one rounded rectangle. Its title surface owns the rounded top corners, the code
surface below has square top corners, and one shared outer border encloses both; nesting a second
rounded frame would make the join look like two cards stacked together. The title is a native
button only when the block can collapse, with `aria-expanded` and `aria-controls` naming the code
panel. A collapsed panel is inert as well as visually clipped, so Shiki's focusable `pre` cannot
receive keyboard focus while hidden. The panel uses `motion` to spring between its measured current
height and its content height, including when a reader reverses direction mid-animation. The title
separator remains until a collapse settles, so the moving surfaces never expose a transient seam.
Its border colour remains assigned while its zero-width collapsed edge is dormant; otherwise the
header's colour transition reveals a frame of text-coloured border when that edge returns.
Once expanded, the panel returns to natural height rather than retaining a stale measurement;
reduced-motion readers receive the state change without animation.

## A Mermaid fence becomes a diagram after hydration

Mermaid keeps its standard fenced-code authoring form. The language label is the switch: the site
compiles a `mermaid` fence as a diagram block instead of sending it to syntax highlighting, while
feeds and Markdown targets retain readable source. Keeping the standard form means the CMS's code
block schema preserves it without another custom Markdown node, and an editor can eventually put a
preview beside the same source rather than migrating articles to a repository-only syntax.

The public page renders the diagram in the browser. Only an article that contains one pays for the
Mermaid runtime, and the bordered paper frame is server-rendered first so the late SVG replaces a
deliberate loading surface rather than an empty hole. That first server-rendered frame names its
state with a quiet, centred `Loading diagram…` label as well as an abstract placeholder, so the
reader does not have to infer whether an unfinished graphic is decorative or still working. The
optional fence metadata `ratio="2.77366"` records the rendered SVG's width-to-height ratio as a
positive decimal. When present, the loading surface uses that ratio with the same `30rem` minimum
content width as the eventual result, reserving its responsive height before Mermaid loads. It is
authored geometry, not a heuristic. A missing ratio retains the `13rem` fallback; a known ratio uses
an `8rem` floor, so a short horizontal flow is not padded out to fallback height while taller
diagrams remain governed by their content. Malformed values fail content compilation. The frame
follows the ordinary code-block language without copying its nested surfaces: one thin outer border
contains one uninterrupted paper background, matching the ordinary code surface. Diagram nodes use
the adjacent hover-paper step so they lift out of that deeper field without another component frame,
and take the same corner as the sketch the loading surface draws in their place, which is a step
tighter than the frame's own. A decision is authored as a diamond, which Mermaid draws as a
`polygon` and CSS cannot give a radius to -- its only lever there is a round line join, which blunts
nothing at the hairline a diagram is stroked at. So a box takes the corner through CSS and a diamond
has its points cut into a path while the drawing is being cached, both reading one value from the
palette beside them so they cannot become two numbers. An edge label's ground is not a node and
keeps its own shape. The frame is the sheet and the nodes the step off it, so which of the two is
the lighter follows the theme -- [surfaces.md](surfaces.md), "A sheet takes the theme's own end of
the range, and a step off it goes the other way". An inset border or contrasting padding band makes
a diagram look heavier than the prose and is not used. The stage centres every result vertically
within its reserved height; Mermaid already centres the SVG horizontally. A short horizontal flow
therefore does not cling to the top of the fallback-height frame, and the loading and final
compositions share the same centre. Horizontal overflow remains scrollable. A failed render leaves
the authored source readable inside that surface. The reveal is opacity and blur and carries no
movement: the loading surface already holds the space the diagram lands in, so a rise into it reads
as the picture having been in the wrong place a moment before. It belongs to arriving rather than to
drawing, so only a diagram the reader has not been shown yet fades in -- a redraw for a new theme
keeps the current drawing on screen and cuts to its replacement, without the fade and without going
back through the loading surface, which is what a theme toggle should look like when the picture was
already there. Reduced-motion readers receive the final states without the loading pulse or reveal.
The boundary is implemented in
[mermaid.svelte](../../apps/site/src/lib/blocks/mermaid/mermaid.svelte).

### A diagram is drawn in both themes at once, because the palette is inside the SVG

Every other surface answers a theme change for free: the class moves on the root element, the tokens
beneath it repaint, and whatever is drawn from them is already correct in the frame that follows.
A Mermaid diagram is the one thing that is not, because Mermaid resolves the palette while it
renders and writes the resulting colours into a `style` element inside the SVG. Those colours are a
copy, and a copy does not repaint.

Redrawing on the change was the first repair and it is not enough. Measured on an article holding
three diagrams: the suppression sheet `applyTheme` installs opens and closes inside one synchronous
block and is gone at 2.6ms, the page repaints correctly at 8.9ms, and the three diagrams turned at
20.3ms, 31.3ms and 42.5ms -- one to two frames behind everything around them, with no transition
anywhere near it. A render is asynchronous and can therefore never land inside a synchronous
window, which is the whole of why the `!important` sheet cannot help here.

So both drawings are made while the loading surface is still up, and the toggle picks one. The
subscription is `observeTheme` in [libs/theme](../../libs/theme/src/index.ts), whose callback is a
microtask: it runs before the next paint, so an assignment made there turns the diagram in the same
frame as the page. The adapter serialises its renders because Mermaid's `initialize` is global and
every diagram now configures twice, and the two palettes are named rather than switched by a `.dark`
ancestor so the theme that is not on screen stays readable. The price is a second render per diagram
on first load, behind a surface that was already reserving the space.

Mermaid's theme engine accepts hex colours while the site palette is authored in OKLCH. It does not
justify changing the shared palette or scattering overrides across generated SVG selectors. A
component-only [palette](../../apps/site/src/lib/blocks/mermaid/palette.css) therefore mirrors the
interface colours in hex for this adapter alone, with every light and dark value kept together.
Mermaid receives those values through its supported theme configuration; article-authored config
cannot replace the site's security, type, or palette decisions. The duplication is accepted and
local: changing a shared colour may require changing its Mermaid mirror, while every other consumer
continues to have one OKLCH source.

### A dark SVG canvas uses one perceptual ramp across its hues

The SVG canvas contract arrived with unrelated dark ramps under the same class names. Repeated across
a diagram, their changing lightness and chroma made some hues heavy and others washed out. The nine
named roles are eight chromatic colors plus gray. They are semantic samples from the color wheel,
not equal divisions of it: forcing eight forty-five-degree steps would change which color a name
means between themes.

**Light mode defines both hue identity and the fill-to-stroke relationship.** In OKLab, each light
fill is its stroke mixed into the page by roughly seven to twelve percent. Dark mode keeps that
per-color proportion: purple seven percent; teal, coral, and pink nine; blue ten; green and red
eleven; amber twelve. Red and blue retain their chosen dark anchors, while the other hues come from
their light counterparts. Thus teal remains the blue-cyan beside blue, and purple remains the
magenta-purple used in light mode. Gray's light fill is about six percent of its stroke; because the
dark gray stroke is itself translucent, the equivalent near-white pigment is two percent rather
than another ten-percent surface.

The border uses the same pigment as the fill at one quiet alpha step above it: roughly eighteen to
twenty-three percent for chromatic roles and eight percent for gray. It therefore separates two
surfaces without competing with their words. A middle ink step serves supporting text where the
anchor defines one, and a vivid 400-like ink serves the title. A derived middle step keeps hue,
lowers lightness by about `0.057`, and retains about ninety-one percent of the title chroma.

The hues and tone roles live together in [style.css](../../libs/svg-canvas/src/style.css). Neutral
roles retain their alpha hierarchy. The existing custom-property and class names are the markup
contract and do not move.

This only governs the named canvas palette. A literal `fill` or `stroke` that draws a separate mark
inside an article, including an intentionally solid shape, remains untouched. A literal on a shape
already owned by a named palette class is redundant and must be removed so that the token remains
the one source of its appearance. Replacing raw SVG with a smaller authored form may eventually give
the remaining literals a semantic home, but that is a separate content and compiler decision.

## A picture in an article opens at the size of the window

Two things in a body are pictures: an `svg-canvas` diagram and an `::image`. Both are bound by the
article column, which is 48rem at its widest and 342px on a phone, and both carry detail the
column cannot always afford -- a 600-unit diagram renders at 0.57 of the size it was drawn at on a
phone, where the palette's `0.875rem` label, 14 of the diagram's own units, lands at eight pixels.
Pressing either one opens it on a black ground at the size of the window. They go through one
component, [preview.svelte](../../apps/site/src/lib/components/preview.svelte), which owns the
ground, the sizing, the close control and the dismissal; what a diagram and a photograph differ
about is two numbers and a label, which they pass in.

**The whole picture is the control, because there is nothing else in it to press.** For a diagram
that is a fact about the corpus rather than a choice: any handler an authored diagram carried is
stripped at compile time -- see the article that shipped nine nodes calling a global that does not
exist -- so a node's hover has never done anything. One press with one meaning is what lets the
cursor be `zoom-in` over all of it rather than `pointer` on the nodes and something else between
them. The `svg` is given `display: block` so the control's box is the drawing's box and not the
drawing plus an inline line box's descender.

**A cover inside a link card is the exception, and it is off by default.** That picture is already
inside an anchor, where a button would be invalid markup and a second answer to a press that has
one. So the picture primitive does not open anything unless the caller asks, and only the article
body asks.

**The node hover is a CSS capability query, not the script one.** `(hover: hover)` is the same
question the Support rail asks and the answer is the same answer, but the two are settled in
different places because they are different kinds of thing: the rail changes what a press does and
has to know before it renders, while this changes only a colour. A touch screen synthesises hover
from a tap and leaves it applied, so without the query the node under the finger stays dimmed
behind the view that tap opened, and is still dimmed when it closes. In CSS that costs a media
block and is right in the first frame the server sends.

### The ground is pure black, and the picture brings its own

The ground behind an enlarged picture is `#000` in both themes. It is the one surface on this site
that does not answer to the palette, and its colour is written as a literal rather than taken from
a token for exactly that reason. The page's two grounds are a warm near-white and a warm near-black
and neither of them is black; a picture read against either is being read against the site rather
than on its own.

What the picture keeps is its own ground, which is the page's and therefore the theme's. A diagram
paints no background -- it is strokes and text over whatever is behind it -- so the enlarged view
puts the page colour behind it as a plate: ink on light in the light theme, light on dark in the
dark one, whichever the reader was already looking at. The plate sits on the black and the black
does not move. An opaque photograph covers the plate and never knows it is there.

Nothing else is on that layer. No gutter, no corner radius, no border, no blur behind: every one of
those is the window's edge held away from the picture, and this view exists to close that distance.
The close control is the single exception, and being on a layer that is always dark it is written
for dark rather than themed -- a wash and a hairline, so it stays legible over a photograph as well
as over the ground.

### The picture reaches two opposite edges of the window

A window has four edges and the picture touches two of them, always. Which pair is not a decision
to make; it falls out of comparing the picture's proportions with the window's. The smaller of the
two fits is the one that binds: a picture wider than the window fills its width and leaves black
above and below, a picture taller than it fills its height and leaves black at the sides, and a
square picture in a square window does both. That is one `min()` of two terms, and it is why
nothing here asks what kind of device this is. A phone held upright and the same phone turned
sideways are two different answers to the same expression.

**There is no third term, and adding one is the mistake to not make twice.** Two have been tried
and both were wrong in the same way. A gutter was the first: it left the picture a fixed distance
off every edge, which is the view refusing to do the one thing it is for. A ceiling on how large a
picture may be drawn was the second, and it is the subtler one -- it looked like restraint, it kept
a small diagram from becoming a poster on a large monitor, and the price was that on any window
wider than the ceiling the picture touched nothing at all and sat in the middle of the black with a
margin it never asked for. Whatever the window has, the picture takes. A diagram enlarged past the
size it was drawn at is coarse, and coarse at the size of the window is what was asked for.

Because the picture is fitted rather than filled it never exceeds the window, so the view never
scrolls and nothing in it can be reached only by panning. That is the whole of the first
arrangement that was wrong: it held a diagram to the size it was drawn at and let the overflow be
scrolled, which on a phone meant a picture cut off by the screen it had just been opened on.

**A press anywhere dismisses, and a drag does not.** Eight pixels of slop between pointer down and
up, on the primary pointer only: a pinch puts a second one down elsewhere and lifts it a few pixels
from where it landed, which is a tap by every measure except intent.

### The picture and the control that opens it are siblings

A drawing arrives as a subtree of `text` nodes in the order a renderer emitted them, which is a
word list and not a reading. It should reach a screen reader as one thing with one name, and the
name should be what `local diagram` derived -- see [i18n/request.md](../i18n/request.md). So the canvas carries
`role="img"` and the description as its label, and the whole subtree under it collapses to that
one node. Measured on the accessibility tree of an article: where there were a dozen loose strings
there is now one image, and one button beside it.

**Neither nesting works, which is why they are siblings.** Put the drawing inside the button and
its reading is gone -- a control's contents are presentational -- and worse, the button's own name
becomes whatever the labels happen to spell. Put the button on top of the drawing and the pointer
hits the button instead of the nodes, and a node that cannot be hovered is the one thing this
arrangement was built to preserve.

So the drawing and the button sit side by side inside a frame, and the frame takes the press. The
button is absolutely positioned over the drawing with `pointer-events: none`: it is there to be
reached by Tab, to be named, and to carry the focus ring, and it is hit by nothing. It has no
handler of its own either -- the click a keyboard makes on it is a real click and reaches the
frame by bubbling, so there is one way in rather than two that have to agree.

That leaves a `div` with a click handler and no keyboard handler, which is what the two waived
a11y rules are about. The keyboard path is the button inside it, and neither rule can see that
from where it is looking.

The same arrangement serves a photograph, where the picture names itself through `alt` and the
button says `Enlarge image`. A Mermaid diagram takes `role="img"` and a label without any of this,
because it has no button to sit beside and the same word-list problem to solve.

A quadrant was already built this way and needed only the reading. Its regions are `aria-hidden`
and its figure is `role="img"`, so the visual labels stay exactly as they are drawn and the
accessibility tree holds one image beside them.

**The reading is its name, not a description hung off one.** The figure used to be named by its
title and described by sentences assembled from its labels, and both of those are the author's
words in the source language -- a directive is not translated. So a Chinese view announced an
English name and then described it in Chinese, which is a worse reading than either language
alone. The derived reading opens by saying what the figure is called, so naming the figure after
it loses nothing and leaves one voice. The old pair stays as the fallback for a figure nobody has
described yet, where the source language is all there is either way.

Both labels are interface copy and resolve at the page's locale like every label around them, and
so does the description -- it is translated into all eight, which is what makes a diagram
described rather than described in English at a Korean reader.

An enlarged photograph also asks for a source sized to the window rather than to the column. The
inline `sizes` names the article measure, and left in place it would have enlarged a source chosen
for a sixth of the pixels -- the crop goes too, for the same reason: it is how the picture is shown
in a column of prose, and this is the view that exists to get past the column. With no ceiling on
the drawn size, `sizes: 100vw` is what keeps a photograph on a wide window sharp: the browser is
being told the truth about how large it is about to be painted, and picks its source accordingly.

## A quadrant groups claims without inventing scores

A categorical comparison uses a `:::quadrant` container with `::quadrant-item` children. The
container names all four axis directions and gives the figure an accessible title; each item names
one of the four regions and may add one short note. A region may hold no items or several. This is
separate from Mermaid's numeric `quadrantChart`: when an article can defend only relative direction,
placing labels at exact coordinates would manufacture precision that the argument does not contain.

Visible copy is deliberately compressed because position carries the comparison. A title names the
decision in a few words, each axis end uses one short term, and a box normally contains only its
subject. An item note remains available for a distinction that position cannot encode, but it is
not a restatement of either axis. The longer explanation belongs in the figure description and in
the readable non-visual fallbacks. This keeps nuance without making every visual reader parse the
same relationship twice.

The container's optional `description` attribute is the author's place to explain the comparison's
context in Markdown. It is not required for accessibility: the component always generates an English
structural description from the horizontal and vertical axis endpoints and every item-region pairing,
with an explicit empty-state sentence when there are no items. When authored copy exists it precedes
that structural fallback rather than replacing it. The template connective language is deliberately
English-only; author-provided labels remain in their source language, matching the code-like directive
translation boundary.

The rendered figure uses a centred Cartesian cross. Its intersection stays at the exact centre of the
outer frame. The four regions first take their intrinsic item sizes, then the largest region defines
four equal-width and equal-height corner tracks. Content is not centred within those tracks. Every
non-empty region anchors its first authored item by the card corner nearest the cross, using the same
inline and block gap in all four directions; further items flow away from the cross. The nearest card
in a sparse region therefore aligns with the nearest card in a denser region opposite it, while an
empty region draws nothing and cannot pull another region towards the centre. The layout is tuned for
the common case of one to three items in a region; further independent items wrap outward instead of
being merged or stretching an axis indefinitely. A small minimum keeps sparse figures legible, while
maximum inline and block sizes preserve breathing room around dense ones.

Both lines span the full item area. Only after that boundary does the positive end add its arrow and
then its axis label; negative labels sit beyond the opposite boundary without an arrow. The result is
four content corners with a short axis extension at the centre of each outer edge, rather than labels
stealing length from the cross. The vertical line carries an arrow only at its top end and the
horizontal line only at its right end, so the positive directions remain explicit without decorating
all four endpoints. A region accepts zero or more independent items. Each item becomes its own
content-width bordered paper-hover label; siblings are centred together and wrap as a group instead
of being concatenated into an invented combined object, and no axis line crosses one. An empty region
is whitespace, not a dashed placeholder: absence already carries meaning here, while an outlined empty
object would imply missing or loading data. Numeric ticks remain absent.

The authored title is an accessible name and a non-visual fallback, not a visible title bar. A hidden
`figcaption` gives the title and generated description separate HTML nodes; the figure's image role
references them with `aria-labelledby` and `aria-describedby` instead of flattening everything into
one oversized accessible name. The visual stage remains `aria-hidden`, so a screen reader receives
the semantic summary once rather than traversing decorative axis and card markup.

The outer frame therefore contains only the visible comparison. It matches a code block or Mermaid
diagram and uses only shared interface tokens; it has no data-visualisation palette of its own. The
page receives static HTML and CSS; the figure adds no client-side renderer or component-local runtime.
Feed, Markdown and plain-text targets lower the figure to a readable list of axis-region labels and
items instead of dropping its meaning. Directive attributes remain structural and therefore follow
the existing non-translatable directive rule in [i18n/segments.md](../i18n/segments.md). The boundary is implemented in
[quadrant.svelte](../../apps/site/src/lib/blocks/quadrant.svelte).

### A name that is two words is held together

A space inside a product name is a break opportunity, and in a line that is otherwise CJK the
break lands there: `均以 MIT` at the edge, `License 发布` starting the next. Interface copy
writes a non-breaking space inside such a name, as the JSON escape `\u00a0` rather than a
literal, so the next person to edit the file sees the character instead of deleting it by
accident.

This is for names a reader knows as one thing. Ordinary prose wraps where it likes.

## An article is offered in one shape, wherever it is offered

`::article` renders the row the homepage lists, unchanged -- the same sheet-of-bars thumbnail,
title, dotted leader and date, from the same component. It does not get the bordered box
`::github` and `::linkcard` wear.

The box is not a house style every card owes; it is what those two need. A repository and an
external page are foreign objects quoted into the page, and the border is what says so. An
article of this site's own is not foreign, and the site already has a way of putting one in
front of a reader. A second one would be a second answer to a question that has an answer, and
the two would drift -- the homepage's row and the in-body card would agree on the day they were
written and not after.

Both alternatives were built before this was settled. A box in `::github`'s shape read as a card
about something external; a box in the tweet card's shape, carrying description and a character
count, read well on its own and still said "this is a different kind of thing than the six rows
on the homepage", which is exactly what it is not.

It opens in place, like every other link here. Opening the in-body one in a new tab was tried
first and is what [the reading trail](rail.md#back-is-one-step-up-the-reading-trail) replaced: a
new tab buys the reader their position back by handing them a window to close, and it answers only
for the one link that was built to open it.

What a card holds is the subject's, not the shape's:
[workspace.md](../architecture/workspace.md) has why a card pointing inside the corpus carries no
copy of its own.
