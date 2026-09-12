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
