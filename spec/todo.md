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

The article shell qualifies the first sentence of this entry. Its one keyframe is written
`@keyframes -global-note-return-marker`, which is Svelte's opt-out from scoping: the name reaches
the document as `note-return-marker` and any layer could write an `animation-name` pointing at it.
It stays in the selector layer anyway, because what it animates is a note marker the markdown
compiler produced and no class of ours is on that element. So one shape hides two constraints --
sometimes the keyframe's name cannot be reached from the visual layer, and sometimes the name can
be reached and its subject cannot -- and only the first of them is what `stylex.keyframes` repairs.

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

## The gate compares a list, and a list is not a test

`cursor`, `pointer-events` and `user-select` are settled as visual in
[architecture/css.md](architecture/css.md), so the article shell's
`.article-rail, .meta { user-select: none }` moved into the visual layer with everything else. Of
the three, only `cursor` is in the seventy-two properties the migration's snapshot compares.
`user-select` is not, `-webkit-user-select` is not, and neither is `pointer-events`.

Measured while migrating [article.svelte](../apps/site/src/lib/article/article.svelte): the style
was applied to the rail and not to the metadata row beside it, so the row silently became
selectable again -- and the diff over 120 snapshots was empty. It was found by reading the computed
style in a browser afterwards. A static snapshot has a second reason to miss it, which is that
nothing in the harness drags across an element.

The finding is not that one name is missing from a list. It is that the list was written from the
properties a migration was expected to move, while what a migration is allowed to move is decided
by a test -- [architecture/css.md](architecture/css.md) says of its own lists that "the lists are
examples; the test is the rule". A list and a test drift the first time somebody applies the test
honestly.

**The first of those has since been taken and the second is still open.** The list went from
seventy-three properties to ninety-eight, audited against what the site actually declares rather
than against what a migration was expected to touch, and `border-*-style` was found compared on two
edges where width and colour were compared on four. What is still true is that a list maintained by
hand drifts from a test applied honestly, and that nothing reports the drift. Two properties remain
knowingly outside it -- `transition-duration` and `-delay`, which the harness freezes so that two
runs agree, which is the same act that makes them unreadable -- and no custom property is compared
at all, so a utility leaving the markup takes its private variables with it unnoticed.

## An SVG presentation attribute is a fourth writer, and it sits below every layer

[icons.svelte](../apps/site/src/lib/home/icons.svelte) draws ten glyphs and two of them ink
themselves twice. Every branch carried `fill-current`, which is visual and moved; `twitter` also
carries `stroke="currentColor"`, `stroke-width="0.7"` and `stroke-linejoin="round"` as SVG
presentation attributes, and `moe` carries those three plus `fill-rule="evenodd"`. All seven decide
how the glyph looks and none of them is in any of the three layers.

A presentation attribute is defeated by every CSS declaration naming the same property, whatever
layer it sits in and whether it is layered at all. So this is the mirror of the first entry in this
file: there a named vocabulary sits above the visual layer with nothing saying it should, here a set
of visual declarations sits below all three with nothing saying it should. Neither is overridden
today, which is why the migration left these alone -- moving `fill` while `stroke` stayed an
attribute changed no pixel, because nothing anywhere sets `stroke` on these elements.

Deciding it costs a behaviour change rather than a rendering one: a stroke written in the visual
layer stops being overridable by a caller's utility and starts outranking it, on a glyph the
homepage and the tweet block both render. It also asks whether a path's own description belongs to
the site at all -- `fill-rule` is closer to the artwork than to the interface -- which is the
question [`libs/svg-canvas`](../libs/svg-canvas/src/style.css) above is already holding.


## A shadow is one utility, two declarations and four variables the visual layer cannot restate

Tailwind 4.3.3 compiles `shadow-lg` to a rule holding two declarations, not one:

```css
.shadow-lg {
	--tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
	box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
}
```

The four ring variables are registered with `@property` at an initial value of `0 0 #0000`, so the
computed shadow on an element carrying the utility is six layers, four of them transparent. A
`boxShadow` in the visual layer holding only the two real ones renders the same pixel for pixel and
computes differently, which is the one thing a migration is not allowed to do.

There are three ways to write it and none of them is good. Declaring `--tw-shadow` from StyleX and
composing the same five-term `box-shadow` puts another framework's private variables in our source
and depends on registrations Tailwind emits only while some shadow utility survives somewhere on
the site. Spelling the four placeholders out as literals -- `0 0 #0000, 0 0 #0000, 0 0 #0000,
0 0 #0000,` and then the real pair -- computes identically and says nothing to a reader about why
four transparent shadows are there. Dropping them changes the computed value.

So `shadow-lg` on [dialog.svelte](../apps/site/src/lib/search/dialog.svelte)'s panel and
`shadow-sm` on [cargo.svelte](../apps/site/src/lib/blocks/cargo/cargo.svelte)'s tooltip stayed in
the markup, under the set rule in [architecture/css.md](architecture/css.md): Tailwind writes the
variable and the shorthand as a unit in one rule, which is checkable, and the member that cannot
move is the `@property` registration. Four more sites carry the same utility --
[modal.svelte](../apps/site/src/lib/components/modal.svelte),
[popover-content.svelte](../apps/site/src/lib/components/popover-content.svelte),
[menu-content.svelte](../apps/site/src/lib/components/menu-content.svelte) and
[tokei.svelte](../apps/site/src/lib/blocks/tokei/tokei.svelte) -- so the decision is the site's
rather than one component's.

It is the same shape as `transition-colors`'s three `--tw-gradient-*` variables, one step worse.
There the private names sit inside a value the visual layer can still state in full; here the value
is composed out of registrations the visual layer has no way to make. Deciding it is either a
shadow of our own in the token layer, which is where a surface's elevation arguably belonged all
along, or saying that a utility whose value is assembled from registered variables is not a
utility the visual layer takes.

The migrated form was written and reverted on
[menu-content.svelte](../apps/site/src/lib/components/menu-content.svelte), which is where the cost
showed itself. A `--tw-shadow` declared from StyleX beside the five-term chain compiles and renders
correctly today, and it is correct only while five other components keep a class this one does not
control: the registrations reach the document because Tailwind scans the markup and finds a
`shadow-` utility somewhere in it. Migrate the last of them and `--tw-inset-shadow` is never
registered, an unresolved custom property makes the whole declaration invalid at computed-value
time, and this panel's `box-shadow` becomes `none`. There is no build error and no console warning,
and the gate cannot see it either: a menu renders nothing until it is opened, which
[architecture/css.md](architecture/css.md) already lists among the surfaces a snapshot never
reaches. A component whose appearance depends on another component keeping a class is a worse
arrangement than the one it replaced, and the failure arrives in a file nobody was editing.

So this is a third reason a declaration cannot leave the layer it is in, and it is neither of the
two already in this file. A rule stays in the selector layer because it needs a selector the other
two layers have no way to write. An SVG presentation attribute stays below every layer because
moving it would change which layer wins. Here the declaration cannot be written by anybody in any
layer: an `@property` registration is not something a component emits, and without it the value the
visual layer would have to state does not resolve at all.

## Two of the site's colours are not the token layer's, and cannot be read from it

[link-card.svelte](../apps/site/src/lib/blocks/link-card.svelte) writes its title and its corner
arrow in `text-black` or `text-white` according to the tone the block declares. Measured across the
markup, those two elements are the only users of either utility on the site, and neither colour is
in [`libs/tokens`](../libs/tokens/src/colors.css): they are Tailwind's own `--color-black` and
`--color-white`.

[architecture/css.md](architecture/css.md) says a colour is read as the variable the token layer
declares and is never retyped, and neither half of that is available here. Retyping gives `#000`,
which the rule forbids and which puts a colour somewhere other than `libs/tokens`. Reading
`var(--color-black)` works only for as long as some utility still names it: `app.css` imports
`tailwindcss` rather than declaring `@theme static`, so a theme variable no generated utility
mentions is not emitted at all -- and moving the last two uses out of the markup is what stops it
being mentioned. The declaration would resolve to nothing and the caption would fall back to
whatever the cover inherits.

So both stayed in the markup and the card is the one migrated component whose colours are not all
in one place. Deciding it is either a black and a white in `libs/tokens`, which is a decision about
the palette rather than about this card -- a caption over a photograph is the only thing on the site
that is deliberately the same colour in both themes -- or a rule that Tailwind's own theme variables
are readable from the visual layer, which needs a way to keep them emitted.

That last half is the shadow entry above arriving from the other direction. There the visual layer
cannot make an `@property` registration; here it cannot keep a `@theme` variable alive. Both are a
value the visual layer can state only while the markup somewhere else keeps a class.

## A style that is only ever conditional cannot be merged into a class attribute

`stylex.attrs()` builds its result by omission. Read in `@stylexjs/stylex` 0.19.0: `props()` adds
`className` only when the resolved string is neither null nor empty, and `attrs()` adds `class` only
when `props()` returned one, so a call whose every argument is switched off returns `{}`. Written as
`stylex.attrs(cond && styles.x).class` that is `undefined`, and a Svelte class attribute
interpolating it renders those nine characters as a class token beside the real ones.

It bites once so far. link-card's corner arrow takes `mix-blend-difference` only when the block
declares no tone, and there is no unconditional declaration left on that element to hold the
attribute open, so the utility stayed in the markup. The one other conditional on the site --
[switcher.svelte](../apps/site/src/lib/locale/switcher.svelte)'s caret -- passes an unconditional
style first and never sees it.

Three repairs, and they are not equivalent. A `?? ''` at each site is one more thing to remember at
exactly the place [architecture/css.md](architecture/css.md) already says a rule cannot be checked.
A helper that merges class strings is the repair that file proposes for `attrs` replacing `class`,
and it would absorb this case for free. Writing the off state as its own style so that something
always resolves adds a declaration the markup never had, which a migration may not do. The middle
one belongs with the `attrs` hazard rather than beside it.

## A wrapping floor moved and the language override on top of it could not

[toc.svelte](../apps/site/src/lib/article/toc.svelte) writes its entry labels with
`overflow-wrap: anywhere` and then, for Chinese and Korean, `word-break: keep-all` on top of it.
The comment beside the second calls the first its floor, and it is: a Han run with no space in it
still breaks wherever it must.

Both decide how the text looks and neither moves an element, so under
[architecture/css.md](architecture/css.md) both are the visual layer's. The floor moved. The
override did not, because it is reached through `:lang(zh)` and `:lang(ko)`, and nothing on this
site has established whether StyleX takes a functional pseudo-class as a condition key. Reading
does not settle it -- the plugin either emits the rule or drops it silently -- and the migration's
gate does not either, because no entry in the corpus wraps in Korean and the Chinese one that does
would have to be driven at a width that makes it wrap.

The rendering is unchanged: the two are different properties, the scoped rule is unlayered, and the
interaction between them is the layout algorithm's rather than the cascade's. What is left is one
mechanism written in two places, and the set rule in [architecture/css.md](architecture/css.md)
does not cover it -- that rule keeps a group together only where something else already writes the
group as a unit, and nothing writes `overflow-wrap` beside `word-break`.

Deciding it costs a build and a look at the emitted sheet. It is the same question the first entry
in this file is holding one level up: `utilities.css` writes `line-break` and `word-break` against
`:lang(ja)` and `:lang(ko)` for the article prose, so whether the vocabulary can become typed
depends on the same answer.

## A data attribute on the element itself is a condition the visual layer cannot state

[support.svelte](../apps/site/src/lib/support/support.svelte) draws its like pill dark once the
reader has liked: `.like[data-liked='true']:is(:hover, :focus-visible)` sets a border colour, a
background and a text colour. All three are visual, the element is one the component renders
itself, and no descendant or ancestor is involved -- so by every test in
[architecture/css.md](architecture/css.md) the declarations belong in the visual layer. StyleX
cannot hold them. Its conditions are pseudo-classes, pseudo-elements and at-rules; an attribute
selector is not among them, and the attribute is the whole of what distinguishes this state.

So the pill's resting surface and its hover moved and its liked hover stayed, and one control's
appearance is now written in two layers with nothing in either saying the other exists. It works
only because a scoped rule is unlayered and therefore outranks the visual layer for the properties
they share, which is the accident [architecture/css.md](architecture/css.md) already declines to
promise. The same shape is in [preview.svelte](../apps/site/src/lib/components/preview.svelte),
where `[data-starting-style]` and `[data-ending-style]` carry the opening and closing opacities
that Bits UI drives.

This is not the ancestor entry above wearing different clothes. There the state is held by another
element and Tailwind spells the pair `group` and `group-hover:`, so the two halves are in one layer
and the question is how to split them. Here the state is the element's own, Tailwind writes it as a
`data-[...]` variant, and the question is that one of the two layers that could hold a visual
declaration cannot hold this one at all. Deciding it is either that half of the markup moving to
Tailwind's variants, or a rule that a property with an attribute-conditioned value keeps every one
of its values in the selector layer.

## A portalled surface is out of Svelte's reach and not out of the visual layer's

The entry above on floating surfaces says Bits UI portals them out of the component tree and they
are therefore reached with `:global`. Migrating
[preview.svelte](../apps/site/src/lib/components/preview.svelte) sharpens that: the portal is what
puts them out of the *selector* layer's reach, and it puts them out of nothing else.

The component writes `class="preview-ground fixed inset-0 z-50"` on `Dialog.Overlay`, and Bits UI
puts that string on the element it renders in the portal. Svelte does not add its scoping class to
a component's `class` prop, which is the whole reason the rules below are `:global`. A StyleX class
is a plain global class name and travels the same prop, so the visual layer could reach all three
of these surfaces -- the ground, the stage and the close -- without a selector of any kind.

It was not taken, and the reasons are worth recording because they are not the portal. The ground's
`#000` and the close's wash and hairline are literals rather than tokens, argued as such in
[styling.md](styling.md), so moving them would put the site's only unthemed colours into the layer
whose one structural guarantee is that a colour is a token variable. And every one of those rules
has a second half conditioned on a data attribute, which is the entry above: the transitions would
move and the opacities they animate could not. Three rules split across two layers, for nothing
gained.

So the decision here is downstream of the other two rather than its own. What is new is only that
the constraint on these surfaces has been misattributed: they are unreachable by one layer, not by
two.

## An attribute condition is one `:is()` away from the visual layer after all

The entry above measures that StyleX's conditions are pseudo-classes, pseudo-elements and at-rules,
and concludes that an attribute-conditioned value has nowhere in the visual layer to go.
[architecture/css.md](architecture/css.md) has since said the same in stronger words -- "the shape
has no spelling in the visual layer at all" -- and quoted the type that is supposed to settle it,
`` `:${string}` ``. That type is exactly the hole: StyleX rejects a key by what it opens with
rather than by what it contains, and `:is([data-highlighted])` opens with a colon. Compiled through
the same Babel plugin the build uses:

```css
.xbhnonm:is([data-highlighted]) {
	background-color: var(--color-paper-hover);
}
```

Nothing on the site writes one, which is why the language switcher's menu rows kept
`data-[highlighted]:bg-paper-hover` in the markup along with the mark's `text-text-soft` and the
`group-data-[highlighted]:text-text-strong` it cannot be separated from. Choosing `:is()` mid
migration would be inventing a convention rather than moving a declaration, and the ancestor half
still needs the marker that the ancestor entry above is holding.

So this does not settle that entry, it widens it. The choice is not two ways but three: the markup
keeps every attribute-conditioned value, or the selector layer does, or `:is([attr])` becomes how
the visual layer says an attribute and the same spelling is used everywhere. Whichever is chosen,
the sentence in [architecture/css.md](architecture/css.md) has to change with it: a rule stated as
an impossibility is the one kind a reader never re-measures.

That sentence has since been changed, before any of the three was chosen. It now carries the
counterexample, the emitted rule, and the admission that the impossibility was a true observation
about the type generalised one step past what had been tested. The choice above is still open.

## Tokei draws from a palette of its own, and it is the third one

[architecture/css.md](architecture/css.md) exempts two component-local palettes from the rule that
a colour is the token layer's -- Cargo's and Mermaid's -- and [styling.md](styling.md) argues both.
[tokei.svelte](../apps/site/src/lib/blocks/tokei/tokei.svelte) has a third that neither file names:
a colour per language from `langColor`, three hexes in `FUNCTION_COLORS` for code, comments and
blanks, two `rgba()` literals inline on the tile's completion bar, and two whites inking a tile's
label over whatever colour the language happens to be.

The whites are the ones the migration had to rule on, because they are `fill` on an element this
component renders and `fill` is visual by the same test that moved `fill-current` in
[icons.svelte](../apps/site/src/lib/home/icons.svelte). They stayed, for the reason the link card's
black and white stayed two entries above: a colour that no token declares cannot be stated in the
layer whose one structural guarantee is that a colour is a token variable. So `.tile-name` and
`.tile-size` are now a `fill` in the selector layer and a size and a weight in the visual one.

What is unresolved is smaller than the palette and larger than this component. Two exemptions
written as a list have a third member nobody added, and the test that admits them -- artwork rather
than interface -- is not written anywhere. Deciding it is either naming the exemption instead of
enumerating it, or a home for a chart's palette that is neither the token layer nor a component.

## A `transition` shorthand sets five lists and the migrated form writes three

`transition: background-color 150ms ease-out, border-color 150ms ease-out` on
[github.svelte](../apps/site/src/lib/blocks/github.svelte)'s repository card is one declaration and
five computed longhands, each of them a two-item list: `transition-property`, `-duration`,
`-timing-function`, `-delay` and `-behavior`. The shorthand sets the last two to their initial
values once per item, so the element computes `transition-delay: 0s, 0s` and `transition-behavior:
normal, normal`.

The migrated form writes three of the five. It was arrived at on
[code-block.svelte](../apps/site/src/lib/blocks/code-block.svelte)'s `copyIcon`, whose comment says
exactly why the curve is stated twice -- "a transition's other lists are read per property, and one
value against two properties is not the same computed style as two" -- and then stops at the curve.
`transition-delay` and `transition-behavior` are left to their initial values, which are
single-item, so a two-property transition that moves into the visual layer computes `0s` where it
computed `0s, 0s` and `normal` where it computed `normal, normal`.

Nothing renders differently and nothing animates differently: the delay is zero either way and the
behaviour is normal either way. What changes is the computed value, and
[architecture/css.md](architecture/css.md) makes the computed value the measure -- it is the same
argument that keeps three `--tw-gradient-*` variables in every migrated `transition-colors`, where
the names are another framework's and the values animate nothing. The two answers disagree, and
they disagree inside one property.

Whether the gate would catch it is not known here. The harness is not in the tree, and
[architecture/css.md](architecture/css.md) says only that the list has gone from seventy-three
properties to ninety-eight and that a migration moving a property nobody has compared before should
say so. This is that: `transition-behavior` reached Chrome in 117 and is younger than most of the
list.

It reaches only the transitions that were written as a shorthand naming more than one property.
A single-property shorthand sets a one-item delay, which is what the initial value already is, and
a Tailwind utility such as `transition-transform` writes one duration against its four properties
itself -- which is why `code-block.svelte`'s `chevron` is right as it stands and its `copyIcon`,
moved from a two-property shorthand, is the first instance. `github.svelte`'s card is the second.

Deciding it is either that a moved shorthand states every list it set, which makes the visual layer
wordier at each site, or that the two lists whose values are inert are outside what sameness means
-- which needs writing down somewhere a reader will find it before they write the third one.

## An arrowhead is a shape made of borders, and the test cannot cut it in half

[quadrant.svelte](../apps/site/src/lib/blocks/quadrant.svelte) tips each of its two axes with a
triangle, drawn the way CSS has always drawn one: a pseudo-element at `width: 0; height: 0` with
three borders, two of them transparent and the third the arrowhead itself.

```css
.vertical-rule::before {
	width: 0;
	height: 0;
	border-inline: 0.3125rem solid transparent;
	border-block-end: 0.5625rem solid var(--color-border-strong);
	content: '';
}
```

Every test in [architecture/css.md](architecture/css.md) gives two answers here at once. The border
widths are the only size the element has, so they decide how large it is; the border colours decide
how it looks, and one of them is a token. `transparent` is neither: on a box with no width it is
how CSS says a side does not exist, which is shape rather than appearance. And `content` is not
classifiable at all -- it is what brings the element into being, so the rule survives whatever else
leaves it.

The rule stayed whole, and the cost of that is worth naming rather than leaving implicit. The axis
line beside the arrowhead is `border-inline-start: 0.0625rem solid var(--color-border-strong)`,
which did move, so one figure's ink is now written in two layers from the same token. Changing the
axis to a different one leaves the arrowhead behind, which is the trap the keyframe entry above
describes in a different property. StyleX can reach a pseudo-element -- the newsletter already
writes `'::placeholder'` -- so the split is available; what stops it is that taking it means
rewriting the shorthand into longhands in the selector layer to make room for the colour, which is
restructuring rather than moving.

Deciding it is either that a shape drawn out of borders is one declaration however many properties
it spans, or that the arrowhead stops being borders -- a `clip-path`, or a glyph -- and the
question disappears with the technique.

## One border, two spellings, and the migration is what put them side by side

Counted inside the thirty-five `stylex.create` blocks the site now carries, `borderWidth` appears
as `'1px'` ten times and as `'0.0625rem'` seven. Both are one pixel at the default root size and
neither is at any other, so the site has two answers to what a hairline is and they part company
the moment a reader enlarges text.

Two files carry both. In [`blocks/quadrant.svelte`](../apps/site/src/lib/blocks/quadrant.svelte)
and [`blocks/mermaid/mermaid.svelte`](../apps/site/src/lib/blocks/mermaid/mermaid.svelte) the
pre-migration source declares only `0.0625rem`, in a scoped rule; the `1px` arrived from Tailwind's
`border` utility in the same component's markup. So neither spelling was invented here and the
migration is faithful in both directions -- it is the act of putting the layout layer's answer and
the selector layer's answer into one object that makes the disagreement legible. It was always
there and nothing could see it.

`fontFamily` divides the same way and the halves are genuinely different. Fifteen declarations say
`var(--font-mono)`, which is Tailwind's theme variable and is defined nowhere in this repository;
four say the literal `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. Tailwind's stack
carries Monaco, Liberation Mono and Courier New; the literal one does not. A reader on a machine
that has Monaco and not Menlo reads two different fonts on one page today, and has for as long as
both spellings have existed. [`blocks/github.svelte`](../apps/site/src/lib/blocks/github.svelte)
says in a comment why it kept the literal one, which is the correct behaviour for a migration and
also the reason this entry exists rather than a commit.

The rest is a scale nobody named, and the counts say which parts are already agreed and which are
not. Colour is agreed: of 198 colour declarations, 186 read a token and the twelve that do not are
keywords -- `transparent`, `inherit`, `currentColor` -- plus two literal fills inside one icon.
Weight is nearly agreed at three values for 32 declarations. Radius is not: 42 declarations take
eleven distinct values, and two of them, `calc(infinity * 1px)` and `624.9375rem`, are the same
pill written twice. Size is not: 90 declarations take twelve values including `0.71875rem` and
`0.78125rem`, eleven and a half and twelve and a half pixels, which are two components each
rounding a judgement rather than a decision anyone made twice, and one `0.9em` among rems. Line
height is the least settled of all -- 41 declarations, fifteen values, mixing unitless ratios with
`rem` lengths, which are not the same kind of thing.

Deciding it is not one choice but three, and only the first is cheap. Naming the scale that exists
costs nothing and changes nothing. Collapsing `1px` and `0.0625rem` into one name is a visual
change on whichever side loses, so it needs the gate run over it rather than an argument. And the
two mono stacks are a question about which one is right, which is not a layering question at all.

## Naming the scale costs nothing and renames a sixth of the stylesheet

Naming the scale that exists was the cheap one of the three choices the entry above leaves open,
and it is taken: [vocabulary.stylex.ts](../apps/site/src/lib/vocabulary.stylex.ts) holds the
twenty-five values three or more components had written out, and no value on the site changed.
Thirty-three of the site's 187 StyleX rules came back under a different class name all the same.
Every declaration, every selector shape and every layer is identical; only the names are not, and
that is a property of the compiler rather than a choice made while naming.

StyleX resolves an import itself, at compile time. Under `commonJS` module resolution -- the
unplugin's default, and now stated in [vite.config.ts](../apps/site/vite.config.ts) -- a
`defineConsts` group reaches the importing file as a proxy, so `radius.md` arrives at
`stylex.create` as `var(--x1ahajgk)`. The atomic class is hashed from the declaration as written,
and the value is put back only when `processStylexRules` assembles the stylesheet. So
`.x6i6fhv{border-radius:.375rem}` is now `.x13k99{border-radius:.375rem}`, and so on thirty-two
more times.

The resolution that would have kept the hash is `experimental_crossFileParsing`, which inlines the
literal by parsing the imported file rather than proxying it. It cannot be reached at 0.19.0:
`evaluateImportedFile` guards its own parse with `if (!ast || ast.errors || ...)` and
`parseSync` returns `errors: []`, which is truthy, so every cross-file evaluation deopts and the
`stylex.create` that reached for the import fails the build with `nonStaticValue`. Measured
against the pinned plugin, not read off the changelog.

Two consequences belong to the class name rather than to the value. A class now depends on the
const module's path and on the key's spelling, so renaming `text.px14` rewrites part of the
stylesheet while changing no declaration. And a key that does not exist is not an error the
compiler reports: the proxy answers any string, so a typo compiles to a `var()` nothing declares
and the browser drops the declaration in silence. `tsc` is the only thing standing between that
and a page.

What is left to decide is what the site's test of sameness is. A comparison of the emitted rules
line for line answers "did the stylesheet change", and it now answers yes to a change that moved
nothing; the same comparison with the class names taken out answers "did a declaration change",
which is the question about the site. Both were scripts written for this change and kept out of
the tree with the migration's own harness, so nothing asks either one today.

## A reduced-motion answer is three declarations that only mean anything together

Nine style objects, across eight components, write the same three lines against
`@media (prefers-reduced-motion: reduce)`: `transitionProperty: 'none'`, `transitionDuration:
'0s'` and `transitionTimingFunction: 'ease'`. None of the three was given a name. Each is a CSS
keyword or a zero, so a name would replace a word a reader already knows with a word they would
have to look up, and `0s` is the value least worth a lookup on the site.

The repetition is real anyway, and it is not of a value. What repeats is a *set*: three
declarations that say one thing, which is that this element does not animate for a reader who
asked for that. The three do not always travel together: counted across the same blocks the
property appears twelve times, the duration fourteen and the curve nine, and
[switcher.svelte](../apps/site/src/lib/locale/switcher.svelte) answers with the property alone.
Whether each of those is deliberate is a question one name would have made visible and three
literals never will. `defineConsts` cannot hold it -- a const is a value, and this is three of them
against a condition. `stylex.create` can, and a shared style composed into each component is what
the visual layer is for, which is the argument
[architecture/css.md](architecture/css.md) makes for the layer in the first place.

Deciding it costs the first composed style on the site, and with it the question of where a
composed style lives and whether a component may be handed one it did not write -- which is the
boundary the first entry in this file is holding for `libs/primitives`. It is also the first thing
the vocabulary module would hold that is not a literal, and the module is named for the literals.
