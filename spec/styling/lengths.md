# A length is measured, and a box is fitted to its ink

How a number in this repository is arrived at, and what a box has to be for a length to reach it.
Which of the three systems writing CSS is entitled to say each decision here, and what happens
where two of them say the same thing, is [architecture/css.md](../architecture/css.md).

## Browser lengths are authored in rem

The default authoring ratio is `16 CSS pixels = 1rem`, matching the site's root size on the
author's device. When the user describes a browser length in pixels without explicitly requiring
the `px` unit, treat the number as a design measurement and store its rem conversion. This covers
hairline borders and CSS written through JavaScript as well as ordinary layout declarations.

Geometry read from the DOM is reported in CSS pixels. Calculations may stay numeric in that
coordinate system, but any value written back to a style is divided by the live root font size and
serialized as rem. The helpers in [@canmi/units](../../libs/units/src/index.ts) keep authored
measurements and live DOM measurements distinct; they moved out of the site when the CMS began
animating lengths of its own, and [units.ts](../../apps/site/src/lib/client/units.ts) re-exports them
so the ten components importing that path did not have to change.

Pixel quantities intrinsic to non-browser-length coordinate systems do not convert: raster asset
dimensions, codec limits, favicon selection and fixed-size image or canvas composition remain
pixels. SVG view-box coordinates remain unitless. An external browser API that only accepts pixels
may keep them when no equivalent percentage is available; that constraint is documented beside the
call rather than being generalized into a styling exception.

## A decoration painted on a box needs the box to hug the text

The spring underline is a background pinned to the bottom of its element, because a background
can grow from zero width and `text-decoration` cannot. That buys the animation and takes on one
liability: a background knows where the box is and nothing about where the baseline is.

Flex and grid stretch their items by default, so a link inside either gets whatever height the
row grew to, and paints its stroke at the bottom of that. Measured on a licence page, the same
class of link sat 27.5px under its glyphs in one row and 2.5px in the next -- the difference was
a neighbouring cell being tall, not anything about the link. `align-self: baseline` on the class
is the fix, declared once rather than at each call site: the failure is invisible until some
unrelated cell in the same row happens to grow, which is exactly the kind of thing nobody
remembers to guard at the point of use. It is ignored outside a flex or grid container.

## A label column is measured, never guessed

A two-column definition list whose label column is a fixed width is a bet that no translation
is wider than the number. The licence pages lost that bet in five of nine locales at
`6.5rem`: `Documentación` needs 111px against 104px and had nowhere to go, while
`Archivos de licencia` and `ライセンスファイル` wrapped to a second line beside a single-line
value. Both are the same fault wearing two faces, one for a word that cannot break and one for
a phrase that can, which is why a wider number only moves the boundary.

So the column is intrinsic -- `auto` -- and shared across the sections that have to line up,
through `grid-template-columns: subgrid`. Sizing each list separately would also never overflow
and would leave two lists on one page disagreeing about where their values begin, by 45px in
Japanese. Intrinsic sizing answers the translation, subgrid answers the alignment, and neither
answer is a measurement anybody has to maintain.

## A summary provider mark follows the last letter, not the punctuation

The provider mark at the end of an article summary is visually anchored to the text line above
it rather than to the paragraph edge. When the summary's final line has room for the mark, the
mark remains on that line and its right edge aligns with the final letter on the preceding line.
When the final line has no room, the mark moves to the following line and aligns with the final
letter on the summary's final text line instead.

Punctuation does not supply that anchor. A line ending in `block，` aligns the mark with the right
edge of `k`, and a Chinese sentence ending in `。` aligns it with the preceding Han character.
This keeps the mark tied to the last piece of ink that carries the sentence rather than to the
variable optical width of its closing punctuation. Because both the line break and the anchor
depend on the rendered font and available width,
[article.svelte](../../apps/site/src/lib/article/article.svelte) measures them from the same browser
font metrics and recalculates them when the paragraph resizes.

## An article block has to be a block to be spaced like one

The article column spaces what it holds with `space-y-4`, which in this version of Tailwind is a
`margin-block-end` on each child but the last. That works on every block and on nothing else: a
non-replaced inline box discards its vertical margins, so an inline child takes the rhythm from
whatever came before it and gives none to whatever comes after.

An embedded picture was that child for as long as the block existed. `picture` is inline in the
browser's own stylesheet, and the `img` inside it being `display: block` does not change what the
wrapper is. So an image sat 16px below the paragraph above -- a gap that belonged to the paragraph
-- and 0px above the paragraph below, while a link card, whose anchor carries `block`, had 16 on
both sides. The asymmetry was visible without being measurable by eye: the two blocks look alike
and only one of them was spaced.

**The failure is silent, which is the part worth writing down.** Nothing is missing from the
markup, nothing overlaps, and the margin is there in the computed style -- it simply has no effect
on that box. A new block type is one `display` value away from the same bug, so the check is one
line: every child of `.article-content` must compute to a block-level display. Measured after the
fix, across every article: no inline children, and every picture sits 16px from its neighbours
except where the next thing is a heading, which brings its own 48.

## A pill's rounded cap is optically pulled in, so the box is pulled out to match

A pill's edge, averaged down its own height, sits `(1 - pi/4)r` inside its box: the two rounded
caps remove exactly that much of the area a flush rectangle would cover, so a `rounded-full`
control reads as narrower than its declared width. `--pill-overhang` in
[app.css](../../apps/site/src/styles/app.css) pulls the box out by `0.2146` of the radius to
compensate, so the pill reads as the width of its text column rather than as an indent -- lower
the coefficient if it overshoots, and `0` is the uncompensated box.

`--pill-height` has to be set on the element or an ancestor rather than read back from
`rounded-full`, because that utility clamps the radius to half the height and CSS cannot see the
result. The newsletter pill shares this derivation rather than repeating it: `newsletter.svelte`
derives its own row geometry from the same `--pill-radius` and `--pill-overhang`, so a second copy
of the coefficient would drift from the first the moment either radius changed. `app.css` only
computes the variable; each consumer then pulls whichever sides actually touch its own column.

## The leader carries the clearance it needs, so it can take it away

An article row is a title, a dotted leader and a date on one line, and the leader is the part that
gives way: its flex basis is zero, so it takes only the space the other two leave and closes to
nothing on a narrow screen. Clearance around it was the row's `gap`, and a gap belongs to the row
rather than to any item in it -- so when the leader closed, its 24px of clearance stayed behind,
holding open a space with nothing in it while the title beside it was cut short for want of two
pixels. On a phone that turned a title that fits into one ending in an ellipsis.

The clearance on the title's side now lives inside the leader, as the margin of a pseudo-element
that draws the dashes. It is part of the leader's own width, so it closes when the leader does,
and while there is room it puts the dashes exactly where the gap used to. The date's side stays a
real margin: it has to survive, because a title that genuinely does not fit still has to be told
apart from the date beside it.

The shape is self-limiting at the end. Once the leader is narrower than the clearance it holds,
the dashes are zero-length and nothing is drawn, so the row never shows a two-dash stub on its way
to showing none.
