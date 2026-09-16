# Keyboard focus, and the controls it is drawn on

Where the ring goes, what colour it is at rest, and the compact controls it most often lands on.
Which of the three systems writing CSS is entitled to say each decision here, and what happens
where two of them say the same thing, is [architecture/css/layers.md](../architecture/css/layers.md).

## Keyboard focus follows the visible control

Keyboard focus uses a real `0.125rem` outline in the accessibility accent colour. The outline is
flush with the control rather than floating outside it: the visible edge is the location being
identified, and a second page-coloured moat makes compact controls look larger than they are. A
real outline also remains available to forced-colours mode; a `box-shadow` is not a substitute.

The focusable DOM box does not always represent the control. A padded row whose identity is an
icon puts the outline on that icon; a focusable code child puts it on the surrounding code frame.
The shared focus utilities in
[utilities.css](../../apps/site/src/styles/utilities.css) cover direct, inner-child and containing-frame
placement so components do not redraw the same geometry locally. Controls with a visible border
may recolour that border instead when adding an outline would duplicate the edge.

**Where the control is not a rectangle, the ring is not one either.** The ring is a rectangle
everywhere on this site because everywhere else the control is, and the two places in the player
where it is not are worth the exception. A slider is 16px of hit area around a 3px bar, so the
ring goes on the bar -- the sibling element that draws the seek track, and the shadow
pseudo-element that draws the volume one, one rule per engine. The cover is a 64px disc holding a
30px glyph, and neither rectangle is the thing being pointed at, so the outline becomes an actual
stroke on the path: two closed rings around the pause bars, one around the triangle, nothing
around the disc. `paint-order: stroke fill` is what makes a stroke read as an outline rather than
as a thickening -- the fill covers its inner half, so a stroke of 2w shows w outside the shape.

Each of these restates the pointer suppression locally, because the utilities' version matches the
focused element and these rules draw on something else. That is the cost of leaving the utilities,
and it is why they are the only two.

**A control that hands its outline to a child stops drawing its own.** The base-layer backstop
below fires on anything focused, so without that suppression the control wears two rings: one
around the hit area and one around the icon inside it. It belongs to `focus-ring-inner` rather
than to the call sites, and it is the narrow case suppression is for -- the position is already
marked, by the child.

How much padding is hit target rather than control is a question worth measuring rather than
eyeballing, because the icon set is rarely the answer. The player's buttons are 30px around a 16px
glyph, and on the landscape box glyphs the ink is about 10.5px tall, so a ring on the button stood
9.3px clear of anything drawn -- against 6px for the section-link copy, which is 24px around the
same 16px box. Phosphor was suspected and was not the cause: its bold glyphs fill 84-91% of their
viewBox where mingcute's fill 67-75%, so they sit tighter in their box than the rest of the site's.
The 7px on each side was the hit target, and the outline belongs inside it.

No control shows the browser's own focus indicator. Chrome draws that as a two-tone ring, a light
contrast edge paired with its blue, which reads as a stray white border against these surfaces, and
it reaches anything that takes focus without opting into one of the utilities above -- a menu panel
that focuses itself as it opens is the case that surfaced it. A base-layer rule replaces it with the
same accent outline rather than removing it, so a control that was never given a focus utility stays
visible to the keyboard rather than going silent. Suppressing focus outright belongs only where
something else already marks the position, as with a parent that hands its outline to a child.

### The ring's colour is declared at rest, or it fades in from the text

An outline has a colour even while `outline-style` is `none` and nothing is drawn, and unless it
is set that colour is `currentColor`. Naming the accent only inside `:focus-visible` therefore
leaves a control whose outline colour _changes_ when it is focused -- which is invisible until
something animates it.

Something does. Tailwind v4 added `outline-color` to `transition-colors`, and nearly every
control here carries that utility for its hover. So the ring faded in from the element's own text
colour over whatever duration the hover happened to use: a pale flash ahead of the blue, worst on
anything light-on-dark, and reported as "a white ring, then the blue one". Ten controls on the
home page alone were doing it, measured as a resting `outline-color` equal to each element's
`color`.

The fix belongs to the utilities and not to the fifteen call sites: the focus classes state
`outline-color: var(--color-accent)` at rest, so focusing a control changes only the outline's
width and there is nothing left to interpolate. A component that reaches for a narrower
`transition-[background-color]` to dodge this is treating the symptom, and the next component
will not know to.

The general rule, which outlives this one property: **a value that only appears under a state
should be declared in the base too, whenever anything transitions it.** A transition interpolates
from the value that was already there, and "there was no value" resolves to something -- here the
text colour -- rather than to nothing.

Text links are a separate visual category from buttons and cards. Their outline follows the text
line height and a tight corner, even when an outer button has padding to make its hit target larger.
Inline icon-and-label links use that same height. Padding belongs to interaction geometry and must
not silently turn a text link into a tall focus badge.

That corner is applied only while the outline is drawn. A radius also clips the element's own
background, and one sized to round a focus outline is several times the height of a stroke painted
along the bottom of the same box, so a resting radius shortens that stroke's lower edge without
touching its upper one and bows a straight line into a lens. On a text link the radius has no work
to do outside focus, so it belongs to the focus state rather than the base rule.

Article prose links carry a thin, rounded underline in the strong border colour at rest, then draw
another in the article metadata text colour from left to right on hover or keyboard focus. Each
stroke sits one step below the previous one on the neutral ramp, which runs strong text, text, soft
text, strong border, border. Holding both strokes under the prose they mark keeps the affordance
subordinate until interaction. The second stroke uses the same sampled non-linear spring as the
translation notice link. It is a layered background rather than `text-decoration`, because the latter cannot
animate its width; the resting layer remains visible throughout, so the animation reinforces an
affordance instead of being the only indication that the text is a link.

### Quiet metadata controls share one surface

Compact icon-and-label controls in metadata rows draw one shared surface. At rest they are soft
text with no ground. Hover and keyboard focus strengthen the text **and** add the `paper-hover`
background; changing only the ink leaves too little feedback for a padded button, while a
permanent surface would make secondary actions compete with the content. The article summary
disclosure is the reference control, and language selection and licence-page actions take the
same geometry and states rather than copying its utility list.

The surface is `surfaces.quietControl`, a StyleX recipe. It was the `quiet-control` class in
[utilities.css](../../apps/site/src/styles/utilities.css) until it stopped being able to hold its own
users, and that is the argument for the move rather than a preference between two spellings. **A
class cannot be specialised.** A control wanting this surface with one difference has to win a
cascade fight whose outcome depends on which plugin appends its stylesheet last, so every control
that needed a variant abandoned the name and wrote the declarations out -- which is to say the
vocabulary decayed exactly where it was most needed. Seven controls kept the class, and they are
the ones that wanted it unchanged: the four licence routes add a font size, the language
switcher and the theme toggle add nothing at all, and the article's summary disclosure adds only
what it does while there is nothing to disclose. A recipe composes, so the name survives being
specialised. See [architecture/css/extraction.md](../architecture/css/extraction.md).

Only the appearance is in the recipe. The geometry -- the inline-flex box, the centred items, the
padding, and the negative inline margin that lets a padded control keep its ink aligned with the
unpadded text beside it -- is layout, and it is Tailwind utilities on each of the seven controls.
The class was a mixed rule and the two halves went to the two layers that own them.

The visible focus outline stays on a `focus-link-inner` child, matching the text-and-icon shape
inside the padded hit area. A Lucide icon in this row is `0.875rem`, and a Lucide icon in the
language menu's trailing marker slot is `0.8125rem`. The language marks are not a box size at all;
see below. None of these are interchangeable: they are optical calibrations for different view
boxes.

### An icon set is sized by the ink it carries, not by one class for all of it

A box size is a promise about the space an icon may use, and that is not what the reader sees. The
reader sees the ink. Mingcute's language marks do not fill their view boxes alike, so the one
`h-4` they all carried shipped four different sizes: rasterised at a 16px box and measured by
counting painted pixels, `translate-line` and `translate-2-line` reach 12.00px of ink where
`translate-2-ai-line` and `world-2-line` reach 13.38px, and the first pair is lighter in mass
besides. The English, Spanish and Simplified rows read up to 15.5% smaller than the five beside
them, in a column whose whole job is to be compared by scanning straight down it.

**The figure each mark is normalised on is `sqrt(extent * sqrt(mass))`**: how far the ink reaches,
corrected by how much of it is inside that reach. Reach alone is the wrong thing to equalise --
bringing a narrow mark up to the widest reach scales its strokes with it and it arrives as the
heaviest mark in the menu -- and mass alone under-corrects for the same reason in reverse. Both
terms scale with the box, so the figure does too, and each mark's height is a ratio of measured
numbers rather than a second round of guessing.

**An ornament does not vote on size.** `translate-2-line` and `translate-2-ai-line` are one
drawing: rasterised together at a 16px box they share 53.36px² of ink, the plain one has 0.86px²
of its own from an antialiased edge, and the whole of the other's extra 14.2px² sits in the
top-right corner, which is the sparkle. A sparkle is ink, so it raises its mark's figure and
lowers its scale, while the plain mark's scale goes up -- and the letterform they share then
arrives at two sizes on rows that sit next to each other, which is the one comparison this
correction exists to get right. So the plain mark is sized by its sibling's measurement instead of
its own. It measures smaller on the figure, 9.65 against 10.73, and that is the price of the
drawing matching, which is the thing actually being looked at.

This is an exception and is written as one. Two marks qualify only when they are the same drawing
differing by a decoration; glyphs that merely resemble each other are still measured apart.

**The size they are normalised to is the compass on the closed trigger**, which is itself a
correction: `size-3.75` rather than the row's Lucide `size-3.5`, because a circle that reaches its
box reads smaller than a glyph that only reaches it at the corners. That mark is the one this
control was already right at, so the menu is brought to it. It settles the trigger as well, which
was two sizes rather than one: the compass and the mark that replaces it differed by up to 12%
according to which language was being read.

The heights are written out as literal classes, because Tailwind reads source text and would not
find a height it has to evaluate. A test parses them back and holds each to the ratio its measured
optical size asks for, so the literals cannot drift from the table they stand for.

**The trailing marker is not brought along.** A check is a light statement -- it says only that
this row is the one -- and a check enlarged to match a compass beside it would be a check
insisting. It measures 6.06 against the compass's 9.29 in the same slot, and that difference is
the two marks meaning different things rather than one of them being wrong.

## `:focus-visible` is the browser's guess, and the site keeps its own answer

The pseudo-class is a heuristic, and it is not ours. Where it is least reliable is focus a script
moved: a menu handing focus back to its trigger as it closes is the case that matters here, and
engines disagree about whether that counts. Guess wrong on a phone and a keyboard affordance is
drawn for somebody who has no keyboard.

So the document records what the last input actually was -- `keydown` of a navigation key marks
`kbd`, `pointerdown` marks `pointer`, and touch arrives as a pointer like any other. **A
positively known pointer takes the outline away**; the pseudo-class still decides everything else.

**It is written as a suppression, never as a keyboard requirement**, and that asymmetry is the
point. With the attribute absent -- no input yet, or the tracker never installed -- the rule does
not apply and plain `:focus-visible` stands. It can therefore show a ring once too often, and it
can never leave a keyboard user with no indicator at all. The opposite spelling fails silently in
exactly the direction that matters.

Text inputs are the older, narrower case of the same idea. Pointer focus strengthens the existing
field border; keyboard focus adds the accessibility outline. They needed it first because a text
input commonly matches `:focus-visible` after a click, the caret having to stay visible, so the
pseudo-class alone was never enough there.

Roving-focus menu items and SVG data marks keep their component-native highlighted surface or
stroke. Those states already identify the current keyboard target and forcing a rectangular ring
around them would describe the wrong shape.
