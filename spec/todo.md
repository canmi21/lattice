# Deferred: where the layering is not yet what it should be

[architecture/css/migration.md](architecture/css/migration.md) says a migrated component renders exactly what it
rendered before, and that moving a declaration into the layer it belongs in is a second change.
This file is where that second change waits.

An entry here is a finding, not a plan. It says what was found, what the evidence is, and what
deciding it would cost -- and it stops there, because the ordinary rule for a list of known
problems applies: one item at a time, proposed and explicitly accepted before anything is written.
The workspace's `agent-protocol.md` says why, and the reason bites hardest on a list like this one,
where every entry was judged once already by whoever was mid-migration when they wrote it.

Anyone finishing a component adds what they found. Nobody works an entry as part of the migration.

The CSS migration is where the file started and not what it is limited to. A finding is anything
found in passing that is a defect in where a decision lives rather than in what it decided, and
those are not a property of stylesheets. The rules above hold whatever the language.

## `.gitattributes` is a list nothing keeps complete

Two paths are marked `linguist-generated=true` so a forge reads this repository as what somebody
wrote rather than as what its tools emit -- [architecture/workspace.md](architecture/workspace.md),
"Machine output is marked, so the language statistics describe the repository". A third path that
becomes machine output and is not added goes on being counted, and nothing fails.

The evidence that this drifts is the file itself. It carried ten lines of reasoning citing
`spec/architecture.md`, a file that does not exist, and the citation survived because
`mise run refs` reads code under `apps/` and `libs/` and the documents, and `.gitattributes` is
neither.

Deciding it costs a definition. A gate has to answer "is this machine output" without a person,
and the only honest proxy is the set of paths this repository's own generators write -- which is
a second list, kept by hand, with the same failure. Worth doing only alongside a reason to
enumerate those outputs anyway.

## The named layer in CSS is the visual layer, written before there was one

`utilities.css` and [`libs/primitives/src/style.css`](../libs/primitives/src/style.css) hold a
vocabulary of named surfaces -- `focus-link`, `spring-underline`, `article-link`, `pill`, `value`,
`jump-target`, `selectable`. Measured across the site's markup before any of them moved, 426 of
1601 class tokens were these rather than Tailwind utilities, which is the vocabulary announcing
itself.

**One of them has been taken, and which half went where is the part to be exact about.**
`quiet-control` is now `surfaces.quietControl` and the class is deleted. It went first because its
users had already measured the defect this entry describes: seven components kept it and the ones
that needed a variant wrote its declarations out instead, a class being the one kind of name that
cannot be specialised. It was also a mixed rule, so the move split it -- the appearance to the
recipe, and the box, the alignment, the padding and the negative inline margin to Tailwind
utilities at each of the seven call sites. Nothing else moved with it. The remaining names in
`utilities.css` stand, and `libs/primitives` is untouched and still deferred, for the reason below
rather than for want of a spelling.

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
is holding is not whether the arithmetic is right -- [styling/lengths.md](styling/lengths.md) argues
each number at length -- but whether the derivation belongs in the selector layer, in the visual
layer as a composed style, or somewhere it currently is not.

## The article body's typography reaches elements no component renders

61 of the 351 rules in Svelte `<style>` blocks were `:global` at the time, and the largest group is
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
[architecture/css/layers.md](architecture/css/layers.md). It is also five times the size of every other file in
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
unstable_moduleResolution is configured`. A `.svelte` file is not an extension that API will hash.
The component uses `stylex.defaultMarker()` instead, which compiles to the literal class
`.x-default-marker` -- one name, shared by every component that calls it, so two of them nested
would have the outer one's hover reveal the inner one's control.

The second half of that error message named a blocker that is gone, and saying so here is a
correction: `unstable_moduleResolution` **is** set in the vite plugin -- see
[architecture/css/layers.md](architecture/css/layers.md), "The module resolution is stated rather than defaulted,
because it is what makes `$lib` reachable" -- and `lib/vocabulary.stylex.ts` is already the
`.stylex.ts` home a marker would live in. Neither is a cost this decision still has to pay, and
the entry priced both.

What keeps `defaultMarker()` in place is the extension refusal above plus a type mismatch the
component records at [section.svelte](../apps/site/src/lib/article/section.svelte): `when.ancestor`
is called with no explicit marker, because its parameter is branded for a `defineMarker()` symbol
and the default marker is branded as itself, so handing the default one over would not type check.
A named marker in a `.stylex.ts` file is what that parameter wants, and moving to one is now a
change inside two files rather than a boundary question.

## `truncate` is one utility and two layers

`truncate` is `overflow: hidden` plus `text-overflow: ellipsis` plus `white-space: nowrap`. The
first decides how large the box is and the other two decide how the text looks, so under
[architecture/css/layers.md](architecture/css/layers.md) the utility straddles the boundary and no third of it
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

[architecture/css/migration.md](architecture/css/migration.md) says a migration moves the visual layer and stops
there, which is why a migrated block comes out smaller and still mixed. `code-block.svelte` is the
first one large enough to show what is left: `position`, `top`, `right`, `z-index`, five
`display`s, four widths, three `overflow`s and a `height`, most of which needs no selector to
reach the element it styles.

Measured across the site at the time: 203 of the 327 rules in the 25 `<style>` blocks named
nothing but a class on an element the component itself renders, and 329 of the declarations inside
them were layout. Under [architecture/css/layers.md](architecture/css/layers.md) that is the markup's, written as
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
even though [architecture/css/layers.md](architecture/css/layers.md) lists motion as the visual layer's subject.

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
[architecture/css/layers.md](architecture/css/layers.md), so the article shell's
`.article-rail, .meta { user-select: none }` moved into the visual layer with everything else. Of
the three, only `cursor` is in the seventy-two properties the migration's snapshot compares.
`user-select` is not, `-webkit-user-select` is not, and neither is `pointer-events`.

Measured while migrating [article.svelte](../apps/site/src/lib/article/article.svelte): the style
was applied to the rail and not to the metadata row beside it, so the row silently became
selectable again -- and the diff over 120 snapshots was empty. It was found by reading the computed
style in a browser afterwards. A static snapshot has a second reason to miss it, which is that
nothing in the harness drags across an element.

The finding is not that one name is missing from a list. It is that the list was written from the
properties a migration was expected to move, while what a migration was allowed to move was decided
by a test, and a list and a test drift the first time somebody applies the test honestly. That
observation is now [architecture/css/layers.md](architecture/css/layers.md)'s own argument for
giving the test up: the enumeration there is the rule, and the test is only how the enumeration
grows.

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
	--tw-shadow:
		0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1)),
		0 4px 6px -4px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
	box-shadow:
		var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow),
		var(--tw-ring-shadow), var(--tw-shadow);
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
the markup, under the set rule in [architecture/css/migration.md](architecture/css/migration.md): Tailwind writes the
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
[architecture/css/migration.md](architecture/css/migration.md) already lists among the surfaces a snapshot never
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

[architecture/css/authoring.md](architecture/css/authoring.md) says a colour is read as the variable the token layer
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
exactly the place [architecture/css/authoring.md](architecture/css/authoring.md) already says a rule cannot be checked.
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
[architecture/css/layers.md](architecture/css/layers.md) both are the visual layer's. The floor moved. The
override did not, because it is reached through `:lang(zh)` and `:lang(ko)`, and nothing on this
site has established whether StyleX takes a functional pseudo-class as a condition key. Reading
does not settle it -- the plugin either emits the rule or drops it silently -- and the migration's
gate does not either, because no entry in the corpus wraps in Korean and the Chinese one that does
would have to be driven at a width that makes it wrap.

The rendering is unchanged: the two are different properties, the scoped rule is unlayered, and the
interaction between them is the layout algorithm's rather than the cascade's. What is left is one
mechanism written in two places, and the set rule in [architecture/css/migration.md](architecture/css/migration.md)
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
[architecture/css/layers.md](architecture/css/layers.md) the declarations belong in the visual layer. StyleX
cannot hold them. Its conditions are pseudo-classes, pseudo-elements and at-rules; an attribute
selector is not among them, and the attribute is the whole of what distinguishes this state.

So the pill's resting surface and its hover moved and its liked hover stayed, and one control's
appearance is now written in two layers with nothing in either saying the other exists. It works
only because a scoped rule is unlayered and therefore outranks the visual layer for the properties
they share, which is the accident [architecture/css/layers.md](architecture/css/layers.md) already declines to
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
puts them out of the _selector_ layer's reach, and it puts them out of nothing else.

The component writes `class="preview-ground fixed inset-0 z-50"` on `Dialog.Overlay`, and Bits UI
puts that string on the element it renders in the portal. Svelte does not add its scoping class to
a component's `class` prop, which is the whole reason the rules below are `:global`. A StyleX class
is a plain global class name and travels the same prop, so the visual layer could reach all three
of these surfaces -- the ground, the stage and the close -- without a selector of any kind.

It was not taken, and the reasons are worth recording because they are not the portal. The ground's
`#000` and the close's wash and hairline are literals rather than tokens, argued as such in
[styling/blocks.md](styling/blocks.md), so moving them would put the site's only unthemed colours
into the layer whose one structural guarantee is that a colour is a token variable. And every one of
those rules has a second half conditioned on a data attribute, which is the entry above: the
transitions would move and the opacities they animate could not. Three rules split across two
layers, for nothing gained.

So the decision here is downstream of the other two rather than its own. What is new is only that
the constraint on these surfaces has been misattributed: they are unreachable by one layer, not by
two.

## An attribute condition is one `:is()` away from the visual layer after all

The entry above measures that StyleX's conditions are pseudo-classes, pseudo-elements and at-rules,
and concludes that an attribute-conditioned value has nowhere in the visual layer to go. This entry
opened by quoting a stronger sentence that has since been retracted, so the quote is withdrawn from
here too. [architecture/css/authoring.md](architecture/css/authoring.md) now calls the impossibility
"a true observation about the type generalised one step past what had been tested", and carries the
same compiled rule this entry does. The type in question, `` `:${string}` ``, is exactly the hole:
StyleX rejects a key by what it opens with rather than by what it contains, and
`:is([data-highlighted])` opens with a colon. Compiled through the same Babel plugin the build
uses:

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
the sentence in [architecture/css/authoring.md](architecture/css/authoring.md) has to change with it: a rule stated as
an impossibility is the one kind a reader never re-measures.

That sentence was changed before any of the three was chosen, which is the convergence the top of
this entry now records: each file carries the counterexample and cites the other. The choice above
is still open, and this entry stays with it.

## Tokei draws from a palette of its own, and it is the third one

[architecture/css/authoring.md](architecture/css/authoring.md) exempts two component-local palettes from the rule that
a colour is the token layer's -- Cargo's and Mermaid's -- argued in
[styling/controls.md](styling/controls.md) and [styling/blocks.md](styling/blocks.md).
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
[architecture/css/migration.md](architecture/css/migration.md) makes the computed value the measure -- it is the same
argument that keeps three `--tw-gradient-*` variables in every migrated `transition-colors`, where
the names are another framework's and the values animate nothing. The two answers disagree, and
they disagree inside one property.

Whether the gate would catch it is not known here. The harness is not in the tree, and
[architecture/css/migration.md](architecture/css/migration.md) says only that the list has gone from seventy-three
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

Every test in [architecture/css/layers.md](architecture/css/layers.md) gives two answers here at once. The border
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

The pill is worse than that sentence says, and the extra spellings are outside the count. Those 42
declarations are the visual layer's, and a corner that is fully round is written four ways across
the site: `calc(infinity * 1px)`, `624.9375rem`, `9999px` -- in
[preview.svelte](../apps/site/src/lib/components/preview.svelte)'s scoped block and again on
`.article-preview-thumbnail [data-icon-bar]` in
[`libs/primitives`](../libs/primitives/src/style.css) -- and `50%` on
[`blocks/github.svelte`](../apps/site/src/lib/blocks/github.svelte)'s language dot. The last is the
one that is not a synonym: a percentage is a share of the box, so on anything that is not square it
draws an ellipse where the other three draw a stadium. Every element carrying it is square today,
which is why nothing looks wrong and why nothing would say so if one stopped being.

Deciding it is not one choice but three, and only the first is cheap. Naming the scale that exists
costs nothing and changes nothing. Collapsing `1px` and `0.0625rem` into one name is a visual
change on whichever side loses, so it needs the gate run over it rather than an argument. And the
two mono stacks are a question about which one is right, which is not a layering question at all.

## Nothing in the tree asks whether a declaration moved

[architecture/css/extraction.md](architecture/css/extraction.md) now says what the gate on a naming change is -- build,
and compare the multiset of emitted declarations per layer -- and no check makes that comparison.
It was two scripts written for this change and kept out of the tree with the migration's own
harness, so the next person to name a value has to write them again or trust a reading.

The comparison would be cheap and it is not the migration's snapshot harness: one build, which
`check-css` already runs, and a sorted diff of what the stylesheet declares against a committed
list. What it costs is a file that has to be regenerated on purpose whenever a value is meant to
change, which is every other kind of edit to the visual layer, and a stale one fails loudly on
work that is correct. Whether that trade is worth making is the decision.

One consequence of the mechanism has nowhere to be recorded but here, because it is a fact about
this repository rather than about StyleX. **A constant's key spelling is part of the stylesheet.**
The class is hashed from `var(--<consthash>)` and the hash is over the module path and the key, so
renaming `text.px14` or moving the module rewrites rules while changing no declaration. Every name
in [vocabulary.stylex.ts](../apps/site/src/lib/vocabulary.stylex.ts) was therefore argued once,
before anything read it, and a later rename is not the free edit it looks like.

## A line height with no reason behind it is a lookup, not a name

`1.4` is the site's third repeated line-height ratio -- [cargo](../apps/site/src/lib/blocks/cargo/cargo.svelte),
[tokei](../apps/site/src/lib/blocks/tokei/tokei.svelte) and
[mermaid](../apps/site/src/lib/blocks/mermaid/mermaid.svelte) -- so it clears the three-component
threshold that every other name in the vocabulary was admitted by. It was left a literal anyway.

Nothing distinguishes it. It is on no scale: Tailwind's neighbours are `leading-snug` at 1.375 and
`leading-normal` at 1.5, and no utility writes 1.4. No comment beside any of the three says why.
Two of the three are the same block copied -- cargo's tooltip and tokei's are the same eight
declarations in the same order -- so the three components are closer to two decisions than to
three. A
name for it would have to say where it sits in a list of three, which stops being true the moment
there is a fourth, and a reader following the name arrives at the same three characters they
started from.

That is the same shape as the `0.71875rem` and `0.78125rem` the entry above names, one step
further on: there two components each rounded a judgement, here three landed on one number and
nobody chose it. Deciding it is either moving each of the three onto the scale, which is a visual
change on at least two of them and therefore needs the gate rather than an argument, or writing
down that a scale is allowed members nobody chose -- in which case the threshold for a name is not
repetition alone, and [architecture/css/extraction.md](architecture/css/extraction.md) says it is.

## A reduced-motion answer is three declarations that only mean anything together

Nine style objects, across eight components, write the same three lines against
`@media (prefers-reduced-motion: reduce)`: `transitionProperty: 'none'`, `transitionDuration:
'0s'` and `transitionTimingFunction: 'ease'`. None of the three was given a name. Each is a CSS
keyword or a zero, so a name would replace a word a reader already knows with a word they would
have to look up, and `0s` is the value least worth a lookup on the site.

The repetition is real anyway, and it is not of a value. What repeats is a _set_: three
declarations that say one thing, which is that this element does not animate for a reader who
asked for that. The three do not always travel together: counted across the same blocks the
property appears twelve times, the duration fourteen and the curve nine, and
[switcher.svelte](../apps/site/src/lib/locale/switcher.svelte) answers with the property alone.
Whether each of those is deliberate is a question one name would have made visible and three
literals never will. `defineConsts` cannot hold it -- a const is a value, and this is three of them
against a condition. `stylex.create` cannot hold it either, and this entry said it could.

**What stood here was that it can**, "and a shared style composed into each component is what the
visual layer is for, which is the argument [architecture/css/layers.md](architecture/css/layers.md) makes for the
layer in the first place". The argument is sound and the premise is false, which is the combination
worth leaving on the page: a shared composed style is exactly what the visual layer is for, and
this set is the one kind of thing it cannot be made of.

Measured on the pinned Babel plugin. A compiled style object maps one key per property to one class
string, conditions included, so a group carrying only the reduced-motion branch of
`transitionProperty` is not a branch added to what the component declares -- it is replaced by it.
Against a card writing the three defaults, `props(group, card)` comes back with the three default
classes and none of the three branch classes; reversing the arguments loses the defaults instead.

**The stylesheet cannot report that**, which is why the reading looked safe. Both forms compile the
same six classes, because the group's declarations are still compiled wherever they are written.
Only the element's class attribute says which of them it ended up wearing.

So the branch travels with a default, and the nine sites have nine of them: the two-item lists on
github's card and twitter's, which are a copy of each other, `transform, translate, scale, rotate`
on the code block's chevron, `opacity, transform` on its copy icons, `transform` on the enlarged
picture, `grid-template-rows` on the article summary, three-item lists on the support pill, and
`color` and `transform` on the two footnote controls. The escapes were measured and none is
available: a function in `create` emits `var()` for each default and registers three custom
properties, which is six rules the stylesheet did not have; a helper called inside `create` fails
the build on the cross-file path [architecture/css/extraction.md](architecture/css/extraction.md) already records as
broken; and there is no `include` in the API at 0.19.

What is left to name is the three literals, which the paragraph above declines. The composed style
this entry was waiting on now exists -- [surfaces.ts](../apps/site/src/lib/surfaces.ts) holds four
groups -- and this is the one thing it cannot hold. So the entry is no longer about naming and is
entirely about the reading: whether
[switcher.svelte](../apps/site/src/lib/locale/switcher.svelte) answering with the property alone,
and the twelve, fourteen and nine counts above, are that many deliberate decisions or one decision
written inconsistently. No arrangement of the visual layer will make that visible, and answering it
is a person reading nine style objects.

## One property has a measured policy in one layer and a flat assertion in the other

[utilities.css](../apps/site/src/styles/utilities.css) answers `text-wrap` for article prose with a
rule conditioned on language and on width. `.article-content` sets `wrap` at rest and takes
`pretty` only for English, German, Spanish and French, and only above 45rem. Both exclusions are
measured rather than omitted: in WebKit at 354px `pretty` adds lines in every language, eleven in
German and forty-two in Japanese, and roughly doubles the mean right-hand gap everywhere; on
Japanese it takes that gap from 1.6% to 7.9% and the loose lines from 1 to 58.
[styling/prose.md](styling/prose.md) argues each of those numbers, and the comment beside the rule
calls the narrow column the correction a phone forced.

Four licence pages answer the same property with no condition at all. `summary` in
`routes/licenses/[license]`, `routes/licenses/pkgs`, `routes/licenses/pkgs/[registry]` and
`routes/licenses/pkgs/[registry]/[...package]` is the same three declarations in the same order --
`lineHeight: line.relaxed`, `textWrap: 'pretty'` and `color: var(--color-text-soft)` -- and the
middle one is what the rule above spends a paragraph deciding not to give to Japanese or to a
narrow column.

Nothing overrides anything today, because the two reach different elements: one is article prose
and the other is a licence page's summary line. What is unresolved is that one property now has a
policy in one layer and a flat assertion in the other, and the flat one is what a reader gets on a
phone.

**The reach is larger than those four and has not been counted.** `color: var(--color-text-soft)`
beside `textWrap: 'pretty'` recurs on six components across eight style keys; the members of that
group were not enumerated when it was found, so six is a floor rather than the number. Anyone
deciding this counts them first.

## A value is written twice on one element, once as a class and once in the visual layer

[body.svelte](../apps/site/src/lib/article/body.svelte)'s note close carries `focus-ring` in its
markup and `borderRadius: radius.sm` in its style object. `:where(.focus-ring, .focus-ring-inner,
.focus-ring-within)` in [utilities.css](../apps/site/src/styles/utilities.css) already sets
`border-radius: 0.25rem`, and `radius.sm` is `0.25rem`, so the element is told the same thing twice
by two layers.

Nothing renders differently and nothing will until one of the two is changed alone, which is the
whole of the finding. That rule is inside `@layer components` and StyleX outranks it, so here the
visual layer's copy is the one that wins -- the opposite holds for the unlayered half of the same
file, which the entry below on the extraction threshold measures. It wins with the identical value,
so the redundancy is invisible from the browser and from every gate this repository has. A
component carrying a vocabulary class and restating one of its declarations has no way to say which
of the two it meant, and neither layer knows the other wrote it.

**One instance, verified by reading the markup and the style object together. No sweep was run**,
and the sweep is the part worth doing: the same shape is available anywhere a component carries
`focus-ring` or `focus-link` and writes a radius, a colour or a transition of its own. What the
count would be is not known here. `quiet-control` was the third name in that list and is a recipe
now, where the same shape is not a redundancy but a merge: a component restating one of the
recipe's properties replaces its whole value for that property, which is a thing to get right
rather than to remove.

## The border strengthens when a control is engaged, and the site spells that two ways

[utilities.css](../apps/site/src/styles/utilities.css) writes
`.focus-input-shell:has(.focus-input:focus) { border-color: var(--color-border-strong) }`, which
reaches a wrapper from a focused descendant. Three components write the same idea as a conditional
value on the element itself -- `borderColor` from `var(--color-border)` to
`var(--color-border-strong)` on `:hover` and on `:focus-visible` -- in
[github.svelte](../apps/site/src/lib/blocks/github.svelte)'s card,
[twitter.svelte](../apps/site/src/lib/blocks/twitter.svelte)'s card and
[support.svelte](../apps/site/src/lib/support/support.svelte)'s action.

Neither is wrong and the two are not interchangeable. The `:has()` form is the only one available
to it, because the focused element and the bordered element are different elements and a StyleX
condition reaches neither from the other. It also answers `:focus` rather than `:focus-visible` on
purpose -- [styling/focus.md](styling/focus.md) argues that a pointer focus should match the shell
while only a keyboard adds the ring -- so the two differ in what they answer as well as in how.

What is unrecorded is that one idea has two spellings and nothing says which applies when. Deciding
it is either a rule that an element bordering itself writes the conditional value while an element
bordered by a descendant's state needs a selector, or the recognition that the second was never a
choice and only the writing down is missing.

## The swallowed transition returns the moment the transition is given a name

The entry above on `.spring-underline` records that it sits outside every `@layer`, that its
`transition` shorthand takes all four longhands, and that the ten-property `transition-colors` list
therefore never reaches an element carrying the class. That is a fact about today, where the list
is written out at each site.

It becomes a trap the moment the list is written once. Six components carry the whole of one soft
control -- a colour going from `var(--color-text-soft)` to `var(--color-text-strong)` under `@media
(hover: hover) :hover` and under `:focus-visible`, beside `transition.colors`, `duration.base` and
`easing.inOut` -- and twelve carry the transition pair alone, which is the group most likely to be
named first. A composed style holding those three, applied to an element that also carries
`spring-underline`, is the same swallow as today with one difference that matters: the name says
the element has a transition, and a reader has no reason to check.

So this is not a second instance of the entry above. It is that entry's consequence for the naming
decision the first entry in this file is holding, and the cost of getting it wrong rises rather
than staying flat -- a name is read as a decision, while a repeated literal is read as something
nobody has looked at yet.

## The extraction threshold counts one layer and the vocabulary lives in three

[architecture/css/extraction.md](architecture/css/extraction.md) admits a value to the vocabulary at three components,
and the count is taken over the thirty-five `stylex.create` blocks. The named surfaces are not all
in those blocks. [utilities.css](../apps/site/src/styles/utilities.css) holds fifteen classes,
[`libs/primitives`](../libs/primitives/src/style.css) holds eight across eleven selectors, and
`app.css` holds four more -- `.pill-metrics`, `.pill`, `.value` and `.value-cell` -- so a surface
can have two instances in the visual layer, sit below the bar, and already be written a third time
in a stylesheet.

Two of those three files sit above the visual layer, which makes the miscount worse than an
accounting error. Measured on `app.css`: it opens with four imports,
[`libs/primitives`](../libs/primitives/src/style.css)'s stylesheet third and
[utilities.css](../apps/site/src/styles/utilities.css) fourth, and neither is inside an `@layer`.
`utilities.css` layers part of itself and `libs/primitives` layers none of itself, so every rule in
the second is unlayered and, by [architecture/css/layers.md](architecture/css/layers.md)'s count, nineteen of the
twenty-seven selectors in the first are too -- and an unlayered rule outranks every layered one.
That is the fourth participant that file already records for `utilities.css`, now confirmed by
measurement for `libs/primitives` rather than inferred from the import form. So a surface named
in the visual layer and also written in one of those two is not merely counted twice: on an
element carrying both, the copy that renders is the one the count did not see.

Three cases, measured. **The dashed leader** is `border-top: 1px dashed var(--color-border-strong)`
in `.article-preview-leader::before` and the same three declarations in `leader` on two licence
pages: two in the counted layer, three in the site. **The bordered paper surface** --
`background-color: var(--color-paper)` with `border-style: solid` and `border-color:
var(--color-border)` -- is ten style keys in ten components, plus `.value-cell` in `app.css` and
`.article-preview-thumbnail` in `libs/primitives`, each at its own radius: four radii for one
surface across three layers. And **`color: var(--color-text-strong)` with `font-weight: 500`** is
thirteen style keys in twelve components, and the first two declarations of
`.article-preview-title`.

The threshold is not wrong; it is measured over the wrong set. Deciding it costs either a count
that reads all three layers, which means a script parsing CSS as well as TypeScript, or the
admission that the bar is about the visual layer's own repetition and that agreement with a
stylesheet is a separate observation. The two answers differ for the leader, which clears three
across the site and does not clear it inside one layer.

## The visual layer has two filename conventions and only one of them is the compiler's

[vocabulary.stylex.ts](../apps/site/src/lib/vocabulary.stylex.ts) carries a vendor's name in its
filename because `defineConsts` refuses to hash a module spelled any other way, and its own doc
comment says exactly that: the filename is the compiler's, not this repository's. The module
holding composed styles has no such requirement -- `stylex.create` hashes from the declaration and
never reads the filename, which is why a create block declared in one module and imported into a
component works at all -- so it is `surfaces.ts`, and the visual layer now has two filename
conventions with nothing saying which applies to the next file.

The rule that settles it is already written and is not about StyleX. The workspace's `naming.md`
lets a framework own a filename where a renamed file simply stops working, which is exactly
`vocabulary.stylex.ts` and exactly not `surfaces.ts`; where that exception does not apply, the
vendor rule does, and a vendor name belongs only in the thin layer that binds to the vendor. Its
test is the reusable part: **if the vendor were replaced tomorrow, how many names would have to
change? One. If the answer is more, the vendor has leaked past the boundary.** Applied here the
answer is zero names for a suffix-free module and one for a suffixed one, which is why the suffix
was refused.

What is unrecorded is the rule rather than the outcome. Nothing in `spec/` says that a `.stylex`
filename is a compiler requirement being obeyed rather than a house convention being followed, so
the next module in this layer is a coin toss -- and the next person to meet the question will be
meeting it about some other vendor, where the same test gives the answer and no file points them at
it.

## Two named surfaces disagree about what a hairline is, and each is internally consistent

The entry on one border and two spellings counts `borderWidth` as `1px` ten times and `0.0625rem`
seven, and reads the split as a scale nobody named. Naming the surfaces says something the count
could not: the split is not scattered. Every one of the eight sites of
[`surfaces.paper`](../apps/site/src/lib/surfaces.ts) writes `1px` -- the three block frames, the
menu, the popover, the modal, the search panel and the newsletter's pill -- and every one of the
three sites of `surfaces.interactive` writes `0.0625rem` -- the repository card, the tweet card and
the support pill. Neither group has an exception.

So one disagreement now sits between two names rather than across seventeen declarations, which is
better and worse at once. Better because it is one decision in one file affecting two lines. Worse
because a name is read as a decision, and `surfaces.interactive` asserts that a border which
answers a pointer is a rem hairline -- which nobody chose. It is what the two cards and the pill
happened to carry, and the recipe is a description of the site rather than a ruling about it.

**The consequence for anyone reading the two together is the part worth recording.** Side by side
in one file they look like one surface and its hover states, and they cannot be: composing
`interactive` onto `paper` would set the border twice from two spellings and the second would win
silently. That is not a defect in either group, it is the reason they are two groups, and the
module comment says so -- but it says so in a comment rather than in anything that would stop the
composition being written.

Two whole-box borders belong to neither group and are named here so a later count does not read
them as members. The cargo and tokei tooltips draw a `var(--color-paper)` ground with the
`0.0625rem` hairline, so they are the one combination that crosses the two answers; they are also
the verbatim copy the entry on the shared vocabulary already holds. `mermaid.node` and
`quadrant.box` take the rem hairline over a different ground.

Deciding it is choosing one spelling and moving between three and eight declarations onto it, which
changes what a reader who has enlarged text sees on every surface that moves, so it wants the gate
rather than an argument. What it cannot stay as is two names that each answer the question
confidently and differently.

## A declaration can nest two ways, and a sweep that reads one level finds neither

Three declarations kept their literals through the value-naming step, all in `chainMarker` on the
package route: `borderRadius: 'calc(infinity * 1px)'` and `borderWidth: '1px'` under `'::before'`,
and `borderLeftWidth: '1px'` under `'::after'`. Each has a name -- `radius.full` and
`border.hairlinePx` -- and they are exactly the three declarations in that key which do. The other
five are two `solid` keywords and three token colours, which the vocabulary never held.

The cause is a property of the source rather than of whoever swept it. A style key's value is
either a declaration or an object, and it is an object in two unrelated cases: a **conditional
value**, whose keys are `default`, a pseudo-class or an at-rule, and a **pseudo-element block**,
whose key is `'::before'` and under which everything is a declaration again. The two mean nothing
alike and nest identically, so a reader that takes a key's value to be a declaration misses both,
and misses them silently -- a literal that was never visited looks exactly like one that was
visited and left.

The counts say how narrow this instance was and how wide the shape is. Ten declarations across the
site sit under a pseudo-element block, in three keys: `chainMarker`, and the `::placeholder`
colours in [newsletter.svelte](../apps/site/src/lib/newsletter/newsletter.svelte)'s field and
[dialog.svelte](../apps/site/src/lib/search/dialog.svelte)'s query. The other two hold token
colours only, so three was the whole of the miss. Conditional values are much the larger half and
were not missed, which is luck rather than design -- the value-naming step happened to read them.

**Nothing in the tree makes the next sweep walk to the leaves.** The entry on the extraction
threshold wants a count taken across three layers; the entry on whether a declaration moved wants a
committed list of what the stylesheet declares. Both are sweeps, both meet this, and a sweep that
under-reports is the one kind that reports success. What it would cost to fix is one shared reader
that walks a style object to its leaves and yields paths rather than keys. What it costs to leave
is invisible every time, which is the argument for writing it down rather than remembering it.

## The page ground is now one name, and the repair it is standing in for is one line on `body`

Seven components wrote `background-color: var(--color-page)` with `color: var(--color-text)`, and
in five of them those two were the whole style object. They read
[`surfaces.page`](../apps/site/src/lib/surfaces.ts) now, which removes the duplication and leaves
the question underneath it untouched.

The question is why a route declares the ground at all. Every one of the thirteen addresses puts
the pair on its own `<main>`, so the colour is stated once per route rather than once for the
document, and a route that forgot it would render on whatever `body` happens to be. One declaration
on `body` would say it once for the site, and the routes would say nothing.

**It was not taken here because it is a different kind of change.** Naming seven identical copies
moves no declaration between elements and renders identically, which is what the gates can prove.
Moving the pair to `body` changes which element carries it: the ground would paint the whole
viewport rather than a `min-h-screen` box, `color` would inherit from one level further up, and
anything that reads a computed colour off `<main>` would read an inherited value instead of a
declared one. None of that is visible in a stylesheet diff and all of it wants the capture.

What deciding it costs is that capture plus a reading of what still needs the pair locally. The
homepage is the one that would not simply lose its key -- it carries `user-select` in the same
object for a reason spec/architecture/css/layers.md records -- so the answer is not uniform even if the
colour moves.

## The vocabulary counts components and a recipe is not one

[architecture/css/extraction.md](architecture/css/extraction.md) admits a value to the vocabulary at three components.
`0.125rem` as a `border-radius` is written in two of them --
[cargo.svelte](../apps/site/src/lib/blocks/cargo/cargo.svelte) and
[tokei.svelte](../apps/site/src/lib/blocks/tokei/tokei.svelte), the second twice -- and now in
[`surfaces.quietControl`](../apps/site/src/lib/surfaces.ts) as well, which is a third file and not
a third component. It is Tailwind's `--radius-xs`, the one step of that scale
[`vocabulary.stylex.ts`](../apps/site/src/lib/vocabulary.stylex.ts) does not name, and the reason
it does not is that it was below the bar on the day the scale was written.

Whether a recipe counts toward the bar is the question, and it is not the same question as whether
this particular value should be named. A recipe is where a value goes to be written once, so
counting it as a site lets one extraction push a value over a threshold whose whole purpose is to
count how many places arrived at it independently. Counting it as nothing leaves a value sitting
in the vocabulary's own neighbourhood as a literal. The answer applies to every recipe written
after this one, which is why it is here rather than settled in passing by whoever writes the next.

## A recipe's other half is a convention and nothing checks that a call site kept it

`surfaces.quietControl` is the visual half of what was one CSS rule. The other half -- `-mx-1
inline-flex items-center px-1 py-0.5` -- is Tailwind utilities that each of the seven call sites
carries in its own markup, because that half is layout and the markup is where layout lives. The
split is what [architecture/css/layers.md](architecture/css/layers.md) requires and the halves are in the right
places.

What went with it is that the rule could not be half-applied and the recipe can. Composing
`surfaces.quietControl` and forgetting the utilities gives a control the right colours in the
wrong box, and nothing says so: the recipe is a valid style object on its own, so the compiler is
content, and the stylesheet is unchanged either way because those utilities were already emitted
for some other element on the page. Every gate this repository has is blind to it.

This is the first surface whose two halves live in two layers, so it is the first time the
question arises. It arises again for every mixed rule still in `utilities.css`, and the answers
available
are not obviously equal: a comment on the recipe, a second export holding the class string, or the
recognition that a surface wanting both halves is one a component should be rather than one a
markup string composes.

## Whether a clip and a picture should draw one frame is a question about `blockFrame`'s users

[architecture/css/extraction.md](architecture/css/extraction.md) records why a video clip takes `picture.svelte`'s 2px
edge and 1rem corner rather than [`surfaces.blockFrame`](../apps/site/src/lib/surfaces.ts)'s
hairline and `radius.xl`: its neighbour in a column of prose is almost always a picture, and two
different corners side by side would read as a mistake. Left open is whether the site should have
one answer for both media boxes instead of two, which is a question about who else draws
`blockFrame` rather than about the clip alone.

## A total function answers for input it does not know, and is wrong instead of failing

[`extension::for_variant`](../apps/cms/src/extension.rs) maps a mime type to the extension a
stored file is named by. It returns `&'static str` rather than an option, and its own doc says
why: "Total rather than optional: the encoder only ever produces these, and anything unrecognised
is AVIF because that is what the ladder stores." That was true of a repository storing one kind of
asset. It stopped being true when video landed, and the function did not change, because nothing
about its signature could tell it had.

**What it does with a mime it does not know is answer `avif`.** So `for_variant("video/mp4")` is
`"avif"`, and a caller that hands it a clip's variant gets back a path under `image/` with an
extension nothing ever wrote. The failure has no error to surface and no branch to test: the
function cannot fail, so the caller cannot check, so the wrong path flows to `is_file()`, which
answers false, which reads as "this asset is not published yet".

It has already produced one bug of exactly that shape. `published()` in
[`image/run.rs`](../apps/cms/src/image/run.rs) was written as
`variant_path(public, cid, extension::for_variant(&record.mime)).is_file()`, which is correct for
every picture. Copied into the video command unchanged -- the natural thing to do, because it
reads as a general question about a record -- it asks whether `{ab}/{cd}/{cid}.avif` exists for a
rung that lives at `{ab}/{cd}/{cid}.mp4`, one tree and one id apart only by extension. It answers
false on every run, and the
command re-encodes a clip that is already on disk. Nothing raises, nothing logs, and the only
symptom is that a run which should be a no-op takes minutes.

The shape is what invites this rather than any one call site. A function that takes a mime and
cannot fail reads as a function that knows every mime, so it gets called on mimes it does not
know, and the answer it gives is indistinguishable from an answer it does know. The separate
`for_icon` beside it is `Option`-returning for a reason its own doc gives -- a `Content-Type` from
a server nobody controls -- and the two sit in one file disagreeing about whether an unknown type
is a value or a question.

**What deciding it would cost.** The narrow reading is that `for_variant` is named for an image
variant and video should never have reached it, so the fix is at the call sites and the function
is fine. The wider reading is that a total function over an open input set is the defect, and
`for_variant` should return `Option<&'static str>` with the AVIF default moved to the one caller
that wants it -- which is every image path, so the change is small in edits and large in what it
asserts. Both readings leave a picture, a rung and a track needing a mime-to-extension answer
each, and there is no longer a tree in the key to tell them apart -- the extension is the whole of
it. Neither is worth doing while the video commands are still landing, because the call sites are
what would move.

## The homepage lists every article, and will not be able to for long

`+page.svelte` renders one card per article the API answers with, and the API answers with all of
them. Six today. The intent is a fold -- five, or thereabouts -- and a route carrying the rest,
and none of that is decided: whether the fold is a count or a date, whether the full list is
paginated or one page, whether it has its own card and its own place in the sitemap, and what a
reader on a phone sees instead of a hover.

It is written down here because two things already built assume the list is short and will quietly
stop being right. The homepage warms every article it lists on a device with no pointer, which is
sound for six and wasteful for sixty; and the read-count batcher carries up to 24 keys, which is a
number chosen against today's list rather than against anything. Both follow whatever the fold
turns out to be, so neither is worth changing before it is decided.

## The licence surface is eight addresses and one baked record

`/licenses`, `/licenses/{spdx}`, `/licenses/pkgs`, `/licenses/pkgs/{registry}`,
`/licenses/pkgs/{registry}/{package}`, `/licenses/{registry}/{name}@{version}.txt`,
`/licenses/full.txt` and `/licenses.txt` are eight public addresses across thirteen route files.
Nothing else this site serves spends that much of its URL space on one subject, and the subject is
a dependency list.

Behind them, the `virtual-licenses` plugin in [vite.config.ts](../apps/site/vite.config.ts) bakes
`data/build/licenses.json` into the server bundle. Measured on a production build: 482KB raw and
71.7KB gzipped, the largest chunk the Worker carries after the corpus itself -- ahead of
`index-server.js` at 40.6KB and `surfaces.js` at 36.5KB. Only the metadata travels; the licence
texts are already published objects the CDN serves.

What makes it a finding rather than a preference is that the record sits on the wrong side of a
line this repository is in the middle of drawing. It is derived from the lockfile by a pure
function, so nothing is lost by regenerating it, which is the test that sends a generated record
out of git and into R2. It is also the only such record with a consumer at request time. So the
classification reaches it, and the answer it gives -- publish it as an artifact and fetch it like
any other -- is an answer about a surface nobody has decided to keep.

**One piece has already been taken, and it was the expensive one.** The surface had an OpenGraph
card per licence, per registry and per package, in each of the nine views: 6804 files and 518 MiB,
87% of everything the bucket held. Those are gone and the routes are not -- see
[architecture/media.md](architecture/media.md), "The licence routes have no card". It narrows
nothing about the addresses; it stops an undecided surface from being the largest thing published.

**What deciding it would cost.** The intent is two or three addresses rather than eight, and which
ones is open: a single page carrying the directory inline, or a page plus the text endpoints that
exist for machines rather than readers. Whatever survives decides what the record has to be, which
is why it is held out of the move rather than carried through it and rebuilt afterwards. The cost
of waiting is that `data/build/licenses.json` stays in git while every other pure derivation
leaves; the cost of not waiting is migrating a payload onto a surface that is about to lose most
of it.

## The site's non-page routes are SvelteKit's, and every other worker's are hono's

`apps/api` and `apps/cdn` are hono. `apps/site` is not, and it serves eight `+server.ts` routes
plus a handle that answers `<url>.md` before the router sees it:

| Route                                                           | Answers                                     |
| --------------------------------------------------------------- | ------------------------------------------- |
| `/atom.xml`                                                     | the assembled feed                          |
| `/sitemap.xml`                                                  | the assembled sitemap                       |
| `/llms.txt`                                                     | the assembled index                         |
| `/robots.txt`                                                   | a constant                                  |
| `/{key}.txt`                                                    | the IndexNow key                            |
| `/licenses.txt`, `/licenses/full.txt`, `/licenses/{...package}` | licence text                                |
| `<url>.md`                                                      | an article's source, from `hooks.server.ts` |

The intent is that a page stays SvelteKit's and everything else becomes one hono app mounted
inside it, so that every non-HTML response this project serves is written the same way: one
router, one `failure` helper, one place a cache header is decided. Today the site answers those
questions in eight files and a handle, none of which share the helpers `apps/api` and `apps/cdn`
already have.

**What has to be decided before it can be done.** Where the hono app is mounted -- a catch-all
`+server.ts` forwarding `event.request`, or `handle` in `hooks.server.ts` ahead of the router --
and the two differ in what they can reach. Hono would not have `event.fetch`, which is what makes
a same-origin subrequest work in SSR and what `$lib/published` takes as an argument, so that has
to be passed in rather than imported. `<url>.md` is the awkward one: it is a suffix on every
page's path rather than a route, so it is the case that decides whether the mount point can be a
route at all. And whether the licence text routes survive the surface decision above is open, so
there is no reason to move them first.

## The compiler still lives in the application that stopped using it

`apps/site/src/lib/content/build/` is 2,900 lines that turn markdown into blocks: `compile.ts`
alone is 1,210, with `articles.ts`, `assets.ts`, `assemble.ts`, `width.ts` and `highlight.ts`
beside it. After the move to published objects, nothing in the site's Worker or its browser
bundle imports any of it. Its only caller is `apps/site/scripts/publish.ts`.

So it sits in an application that does not use it, under a path that says it is part of one.
Nothing misbehaves: `scripts/` is not bundled, the code is unchanged, and `tsconfig.scripts.json`
checks it where it stands. It is a name that has stopped describing its contents.

Where it should go is the open part, and the candidates are not equivalent.
[architecture/cms.md](architecture/cms.md) says content operations belong below both of the CMS's
shells, which would make this the CMS's -- but the CMS is Rust, and
[i18n/segments.md](i18n/segments.md) refuses to reimplement remark's canonical form in a second
language, so the CMS would be reaching it by subprocess. A package of its own under `libs/` is the
other candidate and is cheap, and it would make the publish step a consumer like any other rather
than the owner by accident.

**What deciding it would cost.** The move itself is mechanical -- one directory, one caller, and
the type surface already left for `libs/artifacts`. What it settles is whether the CMS owns
compilation, which is a question about the CMS's boundary rather than about this directory, and
answering it in passing while moving files is exactly how a boundary gets decided by whoever was
holding the mouse. Not worth doing during the migration that created the situation, because the
publish step is what would move.

## Publishing is a mise task and cannot become a CMS button

[architecture/cms.md](architecture/cms.md) draws the line plainly: a view that has found
outstanding work shows the command that closes it, and that command becomes a button only once
the operation has moved below both shells and the task substrate can report its progress and
refuse a second copy. `publish` is `mise run publish lattice` and lives below neither shell, so the
CMS may name it and may not run it.

It is exactly the class that rule was written for. It runs for as long as the corpus takes to
compile, it writes into `data/` and then across the network, and two copies racing over one tree
is the failure the substrate exists to refuse. It differs from the paid sweeps in only one way:
it spends time rather than money, which makes an accidental second run cheaper, not safe.

**What deciding it would cost.** Moving it means an in-process application operation in Rust with
a TypeScript compile behind it, which is the subprocess boundary
[i18n/segments.md](i18n/segments.md) already accepts in the other direction and cms.md has not
ruled on in this one. The entry above, on where the compiler lives, is the same question arriving
from the other side -- and answering either one first mostly decides the other. Neither is worth
taking while the publish path is still new enough that its shape may move.

## A clip is the one resource reference the compiler still resolves into bytes

[architecture/resource.md](architecture/resource.md), "A rid is resolved three times", says a
compile may bake the article's own shape and nothing derived from a resource's current content.
Two of the three references that name a resource now obey it: `::linkcard`'s mark and `::image`'s
picture compile to a rid under `resources` and are resolved per render. `::video` does not. Its
block carries `src` as a rid and then, beside it, `rungs` with absolute CDN URLs, `poster` as
another, `preview`, `width`, `height`, `gain` and `captions` -- every one of them a fact about what
the clip currently holds. Measured on `hindsight/except-me`: 15 image blocks contribute 15 rids to
`namedResources` and its 3 video blocks contribute none, because a `video` block has no `resources`
key for the collector to read.

The consequence is the one that paragraph exists to name: re-encoding a clip rewrites the `rungs`
inside every content object that plays it, so the object's id moves and the article is republished
for a change the article did not make. It is also the reason an editor that runs online cannot yet
write a clip reference -- the write would need a recompile to take effect.

**What deciding it would cost.** The record side is ready: `media.video.clip` is in the catalogue
with its rungs and caption tracks, and `media.image.frame` already points at its clip through
`source`. What is not settled is which of a clip's several references are roles on one block --
the clip and its poster frame are two resources, and `namedResources` reads a map, so
`{ clip, poster }` is the shape it is waiting for -- and whether the player's fallback for a
reference nothing has imported survives the move, since today that fallback is "the resolved
fields are absent" and after it would be "the record is absent". Both are decisions about the
player rather than about the resolution path, which is why the two loops that built that path
stopped at the edge of them.

## The resolution path on the site has no tests, because the site's modules do not resolve under vitest

`apps/site/src/lib/published/` is where a rid becomes a record: the batch question, the split at
what one request carries, the memo, and the two cache windows that decide what is stored after a
miss and after an outage. Nothing in it is covered. Every test under `apps/site` imports by
relative path and none touches `$lib` or `$app`, and that is not a convention -- the root
`vitest.config.ts` declares no alias for either, so a test that imported `$lib/published` would
fail to resolve before an assertion ran.

The behaviour was verified by execution rather than by assertion while this was written: driving
`publishedResources` against a recording fetch under a throwaway config shows one question for a
page, a rid the corpus does not publish stored and not asked for again, nothing stored at all when
the API cannot be reached, and a 65-rid page split into 64 and 1 rather than refused. Each of those
was confirmed to fail when the behaviour behind it was removed. None of it is committed.

**What deciding it would cost.** Three aliases -- `$app/environment`, `$lib`, and a stub for
`@tanstack/svelte-query`, which publishes `.svelte` source that Node cannot load. The first two are
a line each. The third is the decision: either a stub module that every test in the workspace would
then resolve to, or `@sveltejs/vite-plugin-svelte` in the root config, which pulls the site's whole
Svelte pipeline into `apps/cdn`'s test run as well. Neither is a change to make as a side effect of
a task about batching.

## The dissolution section's argument stopped following from its premise

[architecture/css/layers.md](architecture/css/layers.md), "`utilities.css` is dissolved, not given
a position", settles the question this way: **every rule in it belongs to a layer that already
exists, so the file has nothing left to be.** That inference held while "a layer that already
exists" meant a layer somewhere other than this file. "The frame is a stack, and a declaration
written to lose goes low in it", added later to the same file, makes `base` and `components` two
positions this file itself opens, and records that it already writes into both. The premise stops
entailing the conclusion, and the section's own children confirm it: the `.focus-ring` family
belongs to an existing layer and stays in it.

**What gives is the word "so", not necessarily the conclusion.** Three grounds the axis never
supplied are still open, and dissolving the file would need one of them: the file is a grab-bag of
four unrelated things, which is a filing objection rather than a layering one; `base` and
`components` can be opened from any stylesheet, so nothing about those positions requires this
one; and the same file's test for a fourth layer -- "A layer is a position in the cascade.
Something that does not need a new position is asking for a new file, and a file is not a layer"
-- says the number of files is not a layering question in either direction.

Measured while the wrapper landed: 26 rule blocks, of which 18 cannot move at all on the current
rules and 2 need a decision the file has not taken. **On the rules as they stand the file cannot
be emptied**, which is the second half of the same finding. Moving the declarations to `app.css`
under the same `@layer` wrappers is a rename rather than a dissolution, and `app.css` already
carries unlayered `.pill` and `.value`.

## `libs/tokens` is where a `:root` block goes, and only one kind has been tested there

The same file sends a `:root` block declaring nothing but custom properties to
[libs/tokens](../libs/tokens), "which is where a value gets a name". The load-bearing half is
"not a layering question at all" -- that is what stops the block being weighed against the three
questions. The destination half is an example that generalised.

It holds for the rail block, on a reason the sentence does not give: `--rail-width` and
`--rail-column` are a cross-language contract that `apps/cms/src/i18n/width.rs` derives two
constants from by hand, and `libs/urls` is this repository's established answer for a value two
languages need. It is untested for a block that is genuinely one site's and crosses no boundary,
where `apps/site/src/styles/` would be the better home.

**`width.rs` cites `apps/site/src/styles/utilities.css` by path, and nothing checks it.** The
reference check validates markdown links, `spec/**/*.md` cited from code, and quoted section
names; a non-spec path in a Rust doc comment is in its not-flagged set. Whoever moves the block
updates that citation in the same commit, because nothing will say they forgot.

## The three-component threshold is a memory, and nothing counts the components

[architecture/css/extraction.md](architecture/css/extraction.md) admits a value to the vocabulary at
three components, and a declaration group on the same bar plus one more. Nothing counts them. Every
admission and every refusal so far is a number somebody held in their head at the moment they wrote
the value, and whoever reads the result inherits the conclusion without the count.

"The extraction threshold counts one layer and the vocabulary lives in three" above is a different
finding about the same number: that one is about which layers a count should read, and this one is
that no count exists to point at a layer. A `check-layers` reporting application sites per value
would make the threshold a measurement rather than a memory, and the two questions only separate
once something is doing the counting.

Measured 2026-09-21 by reading `mise.toml` and `apps/site/scripts/`: `check-css` builds the site and
runs `css-layers.ts`, which reads the built stylesheets and holds the order of the three layers. No
task in this repository reads a declaration's value and counts where else it is written. Deciding
this costs a parser over the site's TypeScript, and a threshold that can fail a build is a number
that has to be right on the days nobody is thinking about it.

## The enumeration is normative and the code has drifted from it

[architecture/css/layers.md](architecture/css/layers.md), "The enumeration is the rule, and the test
is only how the enumeration grows", makes the property list the thing that decides, on the argument
that a lookup can be checked by somebody who was not in the argument. The list is prose inside
paragraphs, so nothing reads it, and nobody has checked it.

Measured 2026-09-21 over `apps/site/src`, taking every `stylex.create` block and every `class`
attribute in a `.svelte` file: 20 frame-owned declarations are written in the visual layer -- 11
`textWrap`, 6 `overflowWrap`, 3 `whiteSpace` -- and 14 vocabulary-owned ones are written as
utilities in the markup, 7 appearance and 7 colour. The three `whiteSpace` are the sites that file
already accounts for as a different value at each; the other 31 are drift nobody recorded.

A table that is data rather than prose could be compared against what the tree declares. What it
costs is that the enumeration stops being readable where it is argued: why `cursor` splits by site,
why `will-change` belongs to no ramp, and the pair of mirror-image errors that placed the typography
line all sit beside entries a machine would rather have alone.

## The `// unnamed:` ledger has no entries and no counter

[architecture/css/authoring.md](architecture/css/authoring.md), "An unnamed ramp value is marked, so
it can be counted", asks for a mark beside every ramp property written with a literal and a gate
that prints the total. Measured 2026-09-21: the tree carries zero marks, and no task counts
anything. The convention is written and unused, which is worse than either half alone -- a reader
meeting an unmarked literal cannot tell whether it was judged and passed or never looked at.

**The 125 that section names is not reproducible and should not be read as current.** Scanning the
same properties today finds 48 written with a literal across the site's own `.svelte` and `.ts`
sources against 145 taking a named value, plus 27 in stylesheets outside the visual layer;
`libs/fonts` is excluded, where the same property names are `@font-face` descriptors and not a ramp
at all. Which of those sets the gate should count is part of what deciding this costs, and the
number moves by a factor of two depending on the answer.
