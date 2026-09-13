# Deferred: where the layering is not yet what it should be

[architecture/css.md](architecture/css.md) says a migrated component renders exactly what it
rendered before, and that moving a declaration into the layer it belongs in is a second change.
This file is where that second change waits.

An entry here is a finding, not a plan. It says what was found, what the evidence is, and what
deciding it would cost -- and it stops there, because the ordinary rule for a list of known
problems applies: one item at a time, proposed and explicitly accepted before anything is written.
The workspace's `agent-protocol.md` says why, and the reason bites hardest on a list like this one,
where every entry was judged once already by whoever was mid-migration when they wrote it.

Anyone finishing a component adds what they found. Nobody works an entry as part of the migration.

## The named layer in CSS is the visual layer, written before there was one

`utilities.css` and [`libs/primitives/style.css`](../libs/primitives/src/style.css) hold a
vocabulary of named surfaces -- `focus-link`, `spring-underline`, `article-link`, `quiet-control`,
`pill`, `value`, `jump-target`, `selectable`. Measured across the site's markup, 426 of 1601 class
tokens are these rather than Tailwind utilities, which is the vocabulary announcing itself.

`libs/primitives` is the interesting half. It is CSS rather than TypeScript for one reason: a
Svelte application and a plain-TypeScript application both consume it, and CSS was the only thing
both could read. StyleX removes that constraint, so the package could become typed and composable
for both consumers at once. That is the strongest single argument for this whole arrangement and it
is deliberately not being taken during the migration, because it changes a boundary two
applications depend on rather than the inside of one component.

## Geometry is derived through a cascade of custom properties

`--rail-width`, `--rail-hold`, `--rail-left-max`, `--rail-icon-overhang`, `--pill-height`,
`--pill-radius`, `--pill-overhang`: a length is declared on an ancestor and the elements below it
compute from it. Roughly a third of `utilities.css` is this, and the newsletter's pill is the same
shape at component scale.

It works, it is readable, and it is the pattern the visual layer is least able to hold: StyleX's
model is that everything on an element comes from a class on that element. The question this file
is holding is not whether the arithmetic is right -- [styling.md](styling.md) argues each number at
length -- but whether the derivation belongs in the selector layer, in the visual layer as a
composed style, or somewhere it currently is not.

## The article body's typography reaches elements no component renders

61 of the 351 rules in Svelte `<style>` blocks are `:global`, and the largest group is
[article.svelte](../apps/site/src/lib/article/article.svelte) and
[body.svelte](../apps/site/src/lib/article/body.svelte) styling prose the markdown compiler
produced: `strong`, `s`, `hr`, `blockquote`, `pre`, `code`, `picture`, `img`, `.shiki span`.

Under the three layers this is correctly the selector layer, because there is no element to put a
class on. What is unresolved is that it is also the site's prose typography, which is the visual
layer's subject, and it is currently unreachable from it. Whether the compiler should be emitting
classes the visual layer can name is the decision, and it reaches into the content pipeline rather
than into a stylesheet.

## The floating surfaces are styled from the component that summons them

`.menu-content`, `.popover-content`, `.modal-overlay`, `.modal-content`, `.search-panel`,
`.search-overlay`, `.preview-stage`, `.preview-ground` are all reached with `:global` because Bits
UI portals them out of the component tree. Same shape as the paragraph above and a different cause:
here the element exists and is ours, it is simply somewhere else in the document.

## `libs/svg-canvas` is a 527-line global stylesheet

It styles generated SVG, so it is the selector layer by the definition in
[architecture/css.md](architecture/css.md). It is also five times the size of every other file in
that layer, unscoped, and loaded by whoever imports the library. Whether a drawing's appearance is
the drawing's or the site's is the question underneath it.

## The CMS has no third layer

`apps/cms` renders no Svelte. It is `index.html` plus TypeScript building DOM directly, against
1396 lines of hand-written CSS with semantic class names, and Tailwind is imported but almost
unused. Two of the three layers exist there and the selector layer does not, because there is no
component scope to be the escape hatch.

So the site's arrangement does not transfer to it unchanged, and the shared vocabulary above is the
only piece that crosses. Whether the CMS follows, and what the third layer is there if it does, is
its own decision and not a consequence of this one.

## Ancestor state reaches the visual layer only through a marker nobody owns

`section.svelte` reveals its anchor button while the pointer is over the heading. Tailwind spells
that `group` plus `group-hover:`, and the two halves cannot be split across layers -- StyleX
outranks Tailwind's utilities, so a resting `opacity: 0` in the visual layer would win over a
`group-hover:opacity-100` left in the markup and the control would never appear. Moving the
resting opacity therefore means moving the hovered one.

StyleX's own answer is `stylex.defineMarker()`, and it is refused here twice: first with `the
return value of defineMarker() must be bound to a named export`, then, once exported, with
`unable to generate hash for defineMarker(). Check that the file has a valid extension and that
unstable_moduleResolution is configured`. A `.svelte` file is not an extension that API will hash,
and `unstable_moduleResolution` is not set in `vite.config.ts`. The component uses
`stylex.defaultMarker()` instead, which compiles to the literal class `.x-default-marker` -- one
name, shared by every component that calls it, so two of them nested would have the outer one's
hover reveal the inner one's control.

Deciding it costs a build-config change and a file convention: `unstable_moduleResolution` in the
vite plugin, and a `.stylex.ts` home for markers that components import. That is the same shape of
question as the `libs/primitives` entry above -- a boundary rather than the inside of a component.

## `truncate` is one utility and two layers

`truncate` is `overflow: hidden` plus `text-overflow: ellipsis` plus `white-space: nowrap`. The
first decides how large the box is and the other two decide how the text looks, so under
[architecture/css.md](architecture/css.md) the utility straddles the boundary and no third of it
can move without settling where the other two go. The package page carries eight of them and six
other components carry nine more.

Splitting it costs three declarations across two layers at every site, and the markup stops saying
that the element ellipsises -- which is the argument for utilities, applied against itself.
Keeping it whole leaves `text-overflow` and `white-space` as the only typography the visual layer
does not own. The decision is about compound utilities in general rather than about this page,
and `line-clamp` has the same shape.

## A shared visual vocabulary, arrived at by two people writing it separately

The two directory pages were migrated an hour apart by different hands, and seven of the nine
style objects on the second are the first's character for character: the page ground, the trail
link, the heading, the section heading, the row with its radius and hover fill, the dashed leader
and the tabular count. Fifty-seven of eighty lines in one module block are shared verbatim with
another file. Nobody copied deliberately; both were translating the same markup under the same
rules and arrived at the same place.

That is the extraction threshold reached from an unusual direction. The workspace's rule says a
thing is extracted when it acquires a second consumer, and normally the second consumer is a
decision somebody makes. Here it is a measurement: the duplication already exists, in two files
that will drift the first time one of them is edited alone.

Tailwind's `transition-colors` list is the same problem at its smallest. It is now written out
five times -- the two directory pages, the package page, the article section and the newsletter --
as ten properties including three `--tw-gradient-*` custom properties that are another framework's
private variables and that this site never sets. Whether they belong in our source at all is a
second question, and it has to be answered wherever the string finally lives or the two answers
will disagree.

So there are two things to settle and one place to settle them. **Where a shared visual constant
lives**: a `.stylex.ts` module components import, which is the same boundary question as
[`libs/primitives`](../libs/primitives/src/style.css) above and should be answered with it rather
than beside it. And **what the shared surfaces are called**, which is the part that cannot be
mechanical, because a name that describes the markup it came from stops being true the third time
it is used.

The timing function and the duration are literals in every migrated file today and follow the
same string wherever it goes.

## Layout sits in the selector layer, in nearly every block that has one

[architecture/css.md](architecture/css.md) says a migration moves the visual layer and stops
there, which is why a migrated block comes out smaller and still mixed. `code-block.svelte` is the
first one large enough to show what is left: `position`, `top`, `right`, `z-index`, five
`display`s, four widths, three `overflow`s and a `height`, most of which needs no selector to
reach the element it styles.

Measured across the site: 203 of the 327 rules in the 25 `<style>` blocks name nothing but a
class on an element the component itself renders, and 329 of the declarations inside them are
layout. Under [architecture/css.md](architecture/css.md) that is the markup's, written as
utilities on the element, and it is sitting in the one layer that exists to hold what the other
two cannot address.

Moving it is a second pass rather than a corollary of the first. It is hand-authored geometry
rewritten as utilities -- `min-width: 1.5rem` as `min-w-6`, `padding-inline: 0.25rem` as `px-1` --
and the part of it a data attribute gates, such as the code block's `[data-phase='collapsed']`,
can only follow through Tailwind's `data-[...]` variants, which one component on the site uses
today. What it buys is a block that finally means one thing.

## A directory row asks for a focus ring and every rule that could draw one declines

The licence directory and the registry directory write their rows the same way:
`focus-ring-within` on the anchor, `focus-visible:outline-none` beside it, and a `focus-link-inner`
on the licence name two levels down, inside the flex span that also holds the leader. Driven with
the keyboard at 1600px, no ring appears on either page. The row reports `outline-style: none` and
so does the name inside it, while every other control in the same tab order reports
`solid 2px oklch(0.623 0.214 259.815)`.

Three rules could have drawn it and none matches. The base layer's `:focus-visible` is overridden
by the row's own `outline-none`. `.focus-ring-within:has(:focus-visible)` wants the focused element
to be a descendant, and here the row is the focused element. `:focus-visible > .focus-link-inner`
wants a direct child, and the name is a grandchild. So the row is reaching for the container
variant of a vocabulary whose direct variant is the one it wants: its hit area and its visible
control are the same element.

Measured on the migrated licence directory and on the registry directory, which is unmigrated and
writes the identical row -- both read the same, so this is not something the migration introduced.
Moving `outline-none` out of Tailwind's `utilities` layer and into StyleX's changes nothing here
either, because both of them beat the `base` layer the ring is declared in.

Deciding it is a choice between `focus-ring` on the row and lifting `focus-link-inner` to be a
direct child of it, and either changes what a keyboard user sees on two pages.

## Two conditions on one property are ranked differently by the two layers

Both Tailwind and StyleX let a declaration be conditional, and where two conditions can be true at
once they disagree about which one wins. The newsletter's submit button is the case: `hover:opacity-85`
beside `disabled:opacity-60`, and a request in flight disables the button under a pointer that is
still resting on it, because Chrome matches `:hover` on a disabled control.

Tailwind emits its `hover:` block before its `disabled:` rule at equal specificity, so the dimmer
of the two wins -- measured on the unmigrated component, 0.6. StyleX sorts `:hover` after
`:disabled` and keeps doing so whichever order the pair is written in, and inside a
`@media (hover: hover)` query as well -- measured twice, 0.85. Neither ordering is documented and
neither vendor would notice changing it. The only reason this was caught is that the migration
drove the state; no snapshot has a disabled button in it.

The component states the exclusion instead, `:hover:not(:disabled)`, which makes the two mutually
exclusive rather than ranked and therefore reads the same under either ordering. What is left
unresolved is that this is a repair rediscovered per component. Nothing checks that a migrated pair
of overlapping conditions still resolves the way it did, and
[css-layers.ts](../apps/site/scripts/css-layers.ts) is about the order of the layers rather than
about what sits inside one. Deciding it is either a rule that overlapping conditions are always
written as exclusions, or a check that can see the pair.

## A keyframe holds the resting values the visual layer now owns

Svelte rewrites a keyframe's name to a scoped one and rewrites the `animation` properties in the
same block to match. Nothing outside that block can name it: an `animation-name` written in the
visual layer points at a keyframe that does not exist. So the newsletter's eight keyframes stay in
the selector layer, and so do the eleven classes whose whole content is an `animation` naming one,
even though [architecture/css.md](architecture/css.md) lists motion as the visual layer's subject.

The part that is a finding rather than a consequence is what the keyframes contain. `cool`'s `to`
block is `background-color: var(--color-paper-hover)` and `color: var(--color-text-soft)`, which is
the chip's resting appearance character for character -- and that resting appearance is now a
StyleX style at the head of the same file. The two were adjacent before the migration and are now
in two layers and two halves of the file with nothing tying them together, so changing the chip's
ink without changing the keyframe lands the animation somewhere the element does not rest. `spend`
and `.spent` are the same shape in `visibility`.

Deciding it is either `stylex.keyframes`, which moves the interpolation into the visual layer and
leaves the Svelte block only what genuinely needs a selector, or a convention that a keyframe's
endpoint and the resting declaration read one custom property rather than two literals.

## An unlayered utility swallows a transition the markup still carries

The newsletter's unsubscribe control is `focus-link spring-underline` and, until this migration
moved it into the visual layer, `transition-colors duration-200` beside them. Measured, the control
reports `transition-property: --underline-progress`, a duration of 315ms and the shared spring:
`.spring-underline` in [utilities.css](../apps/site/src/styles/utilities.css) sits outside every
`@layer`, an unlayered rule outranks every layered one, and its `transition` shorthand takes all
four longhands. The ten-property list has never reached the element, and the hover colour on that
control snaps rather than fades.

Moving the declaration changes nothing, because StyleX is layered too and loses to the same rule --
which is why it was carried across unchanged rather than dropped, a migration moving what the
markup said rather than what it achieved. The finding is that the named layer is unlayered in some
places and layered in others with nothing saying which, so an element carrying a vocabulary class
and a utility for the same property has no way to say which it meant. Deciding it means giving
`utilities.css` and [`libs/primitives`](../libs/primitives/src/style.css) a layer of their own,
which is the boundary question the first entry in this file is already holding.
