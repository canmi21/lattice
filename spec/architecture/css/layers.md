# The three layers, and which of them may say a thing

Three systems write CSS for the site. Which declaration belongs where, what happens where two of
them say the same thing, and the order the three are built in are here. What the declarations
themselves say is the `styling/` directory's -- why a rail is 8.5rem is
[styling/rail.md](../../styling/rail.md), why Korean takes `word-break: keep-all` is
[styling/prose.md](../../styling/prose.md) -- and nothing here overrides a decision recorded there.

## The three layers, and the order their question is asked in

| Layer            | Called here      | Written in            |
| ---------------- | ---------------- | --------------------- |
| Svelte `<style>` | the escape hatch | the component's block |
| StyleX           | the vocabulary   | TypeScript            |
| Tailwind         | the frame        | the markup            |

Those names are this file's own. Two sections down, arguing about precedence, it already writes
that **the escape hatch outranks the vocabulary, which outranks the frame** -- the prose was using
a better taxonomy than the table above it, and the table now uses the prose's.

**A declaration's layer is decided by membership, not by what kind of declaration it is.** Three
questions, asked in this order; the first one that answers, answers.

1. **Can a class reach the element at all?** If not, it is the escape hatch. A `<strong>` the
   markdown compiler produced, a floating surface Bits UI portalled out of the tree, a child whose
   styling depends on its parent, a keyframe, a pseudo-element: none of those can be reached by
   putting a class on something, which is the only thing the other two layers can do. This is the
   one hard mechanical boundary in the arrangement, and it is the part the old axis already had
   right.
2. **Is the declaration a member of a named, reused recipe?** Then it is the vocabulary. A surface
   is a set of declarations with a name, used in several places, and every declaration inside one
   belongs to it whether it draws a colour or sets a cursor. What puts a declaration there is the
   name it arrived under, not the subject it addresses.
3. **Otherwise it is the frame.** A one-off on one element, taking its value from a CSS keyword or
   from Tailwind's own scale, said on the element where somebody reading the structure is already
   looking.

### The axis this replaces, and why this file is the argument against it

Until this rewrite the three layers were divided by what kind of declaration each owned: layout in
the markup, visual in TypeScript, the selector in the block. Layout and visual are adjectives, and
an adjective cannot be looked up. Every property nobody had thought of needed a fresh ruling, and
the rulings piled up here -- `cursor`, `pointer-events`, `user-select`, `visibility` and
`transform`, five properties settled one at a time in a file that was supposed to have settled
them all with one sentence. The rest of the arguing moved to [todo.md](../../todo.md), which is now
the largest file in `spec/` and is largely made of it.

The clearest evidence that the adjective does not decide is in the tree, where one property has
already been ruled both ways by two people applying the same test in good faith. `white-space:
nowrap` is StyleX in [cargo.svelte](../../../apps/site/src/lib/blocks/cargo/cargo.svelte), where
the comment beside it reads the property as typography rather than geometry; it is a scoped rule in
[github.svelte](../../../apps/site/src/lib/blocks/github.svelte), where the comment beside it reads
the same property as the width being reserved rather than how the text looks. Neither comment is
careless. The test produced two answers because the test was an adjective.

**The old lists survive as a heuristic, and they are a good one.** Colour, type, border, radius,
shadow and motion are the declarations that in practice turn out to be recipe members; flow, box,
spacing, alignment, size and position are nearly always one-off. If you want to guess an answer
before looking it up, guess with those. They no longer decide anything.

### The enumeration is the rule, and the test is only how the enumeration grows

This file used to say the reverse. "The lists are examples; the test is the rule" is the sentence
being inverted here, and the inversion is the point of the rewrite: the enumeration below is
normative, and the three questions above are the procedure for extending it when the enumeration
does not name a property. **Whatever the test decides gets written into the enumeration, in the
same change that decided it.** A property is meant to be answerable by lookup.

The reason is reviewability. A lookup can be checked by somebody who was not in the argument: they
open the list, find the property, and either the code agrees with the list or it does not. A test
cannot be checked that way, because checking it means running it again, which means having the
argument again, which is how `white-space` ended up with two homes. A list can be wrong, and being
wrong is a thing a list can be *caught* at; a test that two honest readers resolve differently is
not wrong anywhere in particular.

### What each layer owns, by name

**The escape hatch** is not a property list, because it is not a property question. Anything at all
may be written in a `<style>` block, and the only thing that puts it there is that no class reaches
the element: markdown-compiled content, a portalled surface, a descendant selected through its
parent, `@keyframes`, `::selection`, vendor pseudo-elements. If a class *can* reach the element,
this layer is the wrong answer regardless of what the declaration says.

**The vocabulary** owns every declaration that is a member of a named surface in
[surfaces.ts](../../../apps/site/src/lib/surfaces.ts) or takes its value from
[vocabulary.stylex.ts](../../../apps/site/src/lib/vocabulary.stylex.ts):

- colour, in all its spellings: `color`, `background-color`, `border-color`, `outline-color`,
  `text-decoration-color`, `fill`, `stroke`
- `border-radius`, `border-width`, `border-style`, `box-shadow`, `opacity`
- the four `transition-*` longhands, `animation-*` where a class can reach the element
- the type ramp: `font-size`, `line-height`, `font-weight`, `letter-spacing`, `font-family`,
  `font-variant-numeric`
- `cursor`, and the rest of the settled rulings below

**The frame** owns the one-offs: `display` and the flex and grid properties, `gap`, `margin`,
`padding`, `width`, `height` and their `min-`/`max-` forms, `position` and `inset`, `z-index`,
`align-*`, `justify-*`, `overflow`, `visibility`, and text behaviour -- `white-space`,
`text-wrap`, `overflow-wrap`, `word-break`, `hyphens`, `text-overflow`.

### Typography splits, and the line runs through it rather than around it

Typography was the largest thing the old axis left open, because "visual" swallows all of it and
"layout" claims some of it back. Under membership it divides cleanly, and it divides in the middle.

**The type ramp is the vocabulary.** `font-size`, `line-height`, `font-weight`, `letter-spacing`,
`font-family` and `font-variant-numeric` take their values from a scale this repository maintains
and names -- the type ladder, the two line ratios, the two weights and the two monospace stacks in
[vocabulary.stylex.ts](../../../apps/site/src/lib/vocabulary.stylex.ts). Writing one of those
values is a lookup into that scale whether or not the spelling admits it, and a second spelling of
the ramp is exactly how a ramp drifts. The site's repeated `1.4` line height is the case that
proves the rule rather than the exception to it: the ladder does not name it and nothing records
why it is 1.4, which makes it vocabulary that has not been given its name yet, not a frame value.

**Text behaviour is the frame.** `white-space`, `text-wrap`, `overflow-wrap`, `word-break`,
`hyphens` and `text-overflow` have no house scale, and there is no plausible one: `nowrap` is a
local fact about one element's content, and it describes itself where it is written. Nothing is
looked up, nothing drifts, and nobody needs a name to read it.

Two things already in the tree point at this line from opposite sides, and both are errors of the
same kind:

- `font-variant-numeric: tabular-nums` is written as a Tailwind class in the markup at three places
  in [github.svelte](../../../apps/site/src/lib/blocks/github.svelte) -- a ramp member in the frame.
- `white-space: nowrap` is written in StyleX in
  [cargo.svelte](../../../apps/site/src/lib/blocks/cargo/cargo.svelte),
  [tokei.svelte](../../../apps/site/src/lib/blocks/tokei/tokei.svelte),
  [quadrant.svelte](../../../apps/site/src/lib/blocks/quadrant.svelte) and
  [support.svelte](../../../apps/site/src/lib/support/support.svelte) -- text behaviour in the
  vocabulary.

They are mirror images across one line, which is the strongest evidence available that the line is
in the right place: it is the line both mistakes are mistakes about. Moving either is work for a
migration and not for this file.

### The rulings already settled, re-argued under the axis that now decides them

None of these changes answer. What changes is the reason, and the reasons were carrying the old
adjective.

- **`cursor` is the vocabulary because it is a member.** It travels inside
  `surfaces.quietControl`, beside that surface's colour, radius and transitions, and it is there
  for the same reason they are: the quiet control is one named thing used in several places, and
  you get all of it or none of it. The old reason -- that a cursor is appearance because the reader
  learns it by looking -- was an adjective doing the work, and it happened to arrive at the right
  answer. The `.quiet-control` class in `utilities.css` had already written `cursor` beside colour
  and a transition before there was any rule, which is the membership answer reached by instinct.
- **`visibility` is the frame, and it is no longer the awkward one.** The newsletter's ghost label
  takes `visibility: hidden` rather than `display: none` because a removed box measures nothing and
  this one exists to reserve a width. Under the old axis that needed a paragraph explaining why a
  property that sounds visual was layout. Under this one it needs no paragraph: it is one keyword,
  on one element, belonging to no recipe.
- **`transform` splits by site rather than by property, and now says which sites.** A translate that
  centres something is a one-off on one element and is the frame. A transform inside `@keyframes`
  cannot be reached by a class at all and is the escape hatch. A transform that is a member of a
  named surface goes with that surface. The old question -- whether deleting it moves anything
  while the page is at rest -- still predicts the answer in most cases and is no longer the test.
- **`pointer-events` and `user-select` stay in the vocabulary, and this axis does not yet explain
  why.** Both were settled as visual on the old reasoning: neither moves anything, each says what
  the element is to a pointer. Membership does not obviously reproduce that. Most of their sites
  are single-key StyleX objects holding one CSS keyword and nothing else, used once in the
  component that declares them -- `pointerEvents: 'none'` alone in `home-link.svelte`'s `slot`,
  `pointerEvents: 'auto'` alone in `toc.svelte`'s `nav`, `userSelect: 'none'` alone in
  `article.svelte`'s `apparatus` -- which is the shape of a frame declaration, not of a recipe
  member. The ruling stands as it is, unchanged, and whether the axis should move it is a decision
  that belongs to whoever owns the two properties rather than to this rewrite. It is open.

## The layers, and the argument for each of them

**The frame stays in the markup because structure is what the markup is.** A row that is a flex row
with a gap says so on the element, where somebody reading the structure is already looking, and
they read it without leaving the file. That is the whole argument for utilities and it is an
argument about one-offs read in place; it stops being true the moment a value is a lookup into
something the markup cannot show, which is what a colour, a type step or a radius is.

**The vocabulary is StyleX because a vocabulary wants to be composed and typed.** A surface is a
set of declarations with a name, used in several places, and it should be possible to say so in one
expression that a compiler checks and a bundler deduplicates. Utilities cannot name a surface; they
can only spell one out again at each site, and the 504 visual class tokens spread over 43
components counted at the time are what spelling it out again looks like. The named layer in
[utilities.css](../../../apps/site/src/styles/utilities.css) is the part of this the site already
had, arrived at by necessity rather than by design.

**The escape hatch is the selector layer, and it is not a leftover.** Some declarations need to
reach an element no component holds, and none of those can be reached by putting a class on
something. Measured over the 24 blocks that exist today, 99 of 351 rules are in this class -- not a
corner, a third of the file.

So the layering is not three ways of doing one thing with a preference order. It is three
capabilities, and a declaration usually has exactly one place it can go.

## The precedence is measured, and it is not promised

Measured in Chrome against a build and a dev server, both giving the same answer:

| On one element                 | Wins          |
| ------------------------------ | ------------- |
| Svelte scoped against StyleX   | Svelte scoped |
| Svelte scoped against Tailwind | Svelte scoped |
| StyleX against Tailwind        | StyleX        |

The mechanism is cascade layers and the order they are declared in. Tailwind emits `theme`, `base`,
`components` and `utilities`; StyleX appends `priority1`, `priority2` and `priority3` after them in
the same stylesheet; Svelte's scoped rules are unlayered, and an unlayered rule outranks every
layered one. The order in a `class` attribute decides nothing.

### There is a fourth participant, and it sits above the visual layer

The table above is the three layers this arrangement names. It is not the whole of what writes CSS
here. **`utilities.css` held twenty-eight selectors at the time, nineteen of them outside every
`@layer`** -- including `.spring-underline`, `.article-link`, `.jump-target` and `.article-rail`
-- and nine inside `base` or `components`. The totals were counted again and were one out on each
side of the layer boundary; the nineteen and the four names are as they were. It is dated because
the file is edited by whatever the migration reaches next and nothing brings the count back here,
and because the argument does not turn on the split: what matters is that nothing says which a
given rule should be, and an unlayered rule outranks every layered one -- so most of the named
vocabulary beats StyleX.

**Under the membership axis this is not a fourth layer, and calling it one flatters it.**
`.spring-underline`, `.article-link`, `.jump-target` and `.article-rail` are named, reused recipes,
which is the definition of the vocabulary. They are the vocabulary, written down before there was a
layer to write it in -- and they sit unlayered, where they outrank the vocabulary layer that exists
now. The arrangement does not have four participants with four jobs. It has one job being done in
two places, one of which wins by an accident of layering. Nothing here moves any CSS: recording
what the axis implies is this file's work and the execution is somebody else's.

Measured on the newsletter's unsubscribe control, which carries `focus-link spring-underline` and
carried `transition-colors duration-200` beside them: the element reports
`transition-property: --underline-progress` at 315ms. `.spring-underline`'s `transition` shorthand
takes all four longhands and wins, so the ten-property list never reached it and the hover colour
snaps rather than fades. That was true before the migration and is true after it, which is why the
declaration was carried across unchanged: a migration moves what the markup said, not what it
achieved.

The consequence to expect while migrating: **a component carrying a vocabulary class may find its
visual layer silently outranked for the same property.** The gate does not catch it, because
nothing changed. What is wrong is upstream of the migration, and it is in
[todo.md](../../todo.md) beside the question of where the vocabulary should live -- the two are one
decision, because giving `utilities.css` a layer is also choosing what it is a layer of.

That ordering is the one this layering wants -- the escape hatch outranks the vocabulary, which
outranks the frame -- and it is worth being clear that this is luck rather than design. **It falls
out of which plugin appends its CSS last.** Neither vendor promises it and neither would notice
breaking it: an inverted order raises no error, it just starts answering some properties from the
other layer. So it is held by a check rather than by a reading:
[css-layers.ts](../../../apps/site/scripts/css-layers.ts), run over the built stylesheets by
`mise run check-css` and part of `verify`.

**It asserts the relative order of the three, never the layer names.** `utilities` is Tailwind's
and `priority2` is StyleX's, and both belong to their owner to rename; a StyleX layer is found by
the atomic classes inside it. Only `utilities` is named, because a rename there should stop
somebody rather than pass quietly. The check also refuses a build where the site imports StyleX and
no stylesheet carries its classes, which is what a plugin ordered wrongly looks like from the
outside.

**A conflict resolves per property, never per block.** A scoped rule naming only `background` takes
`background` and leaves a StyleX `border-radius` on the same element standing; measured, including
through a scoped descendant selector reaching a StyleX-classed child. Two layers on one element are
not two candidates for the element's whole appearance. This is what makes the escape hatch usable
as an override of one declaration rather than a decision to hand-write everything about a node.

### An element's class attribute says which layer wrote what, and one of those names is a lie

In a browser the three layers are readable off a single element, which is the fastest way to answer
"where does this come from" without opening a file. On the homepage's `<main>`:

```html
<main class="min-h-screen page__styles.page x1jkd24u xiuzu7u x1winvzj x87ps6o"></main>
```

`min-h-screen` is the frame, a one-off saying how large this element is. The `x`-prefixed names are
StyleX, one class per declaration. `page__styles.page` is **also StyleX**, and it is the one worth
knowing about, because it looks exactly like a Svelte scope class and is not one.

It is StyleX's development-only readable name, composed as `<basename>__<varName>.<key>`: the file
`+page.svelte`, the `const styles = stylex.create(...)` that declared it, and the key inside. It
does not exist in a production build -- measured, zero occurrences in both the client bundle and
the server one -- so what ships is Tailwind's utilities plus atomic classes and nothing else. The
dot in it is not selectable either: `.page__styles.page` parses as two classes, so the name cannot
be used as a hook by accident. Several plugin options move or rename it (`enableDevClassNames`,
`enableDebugClassNames`, `enableDebugDataProp`, `debugFilePath`, `classNamePrefix`); none is set
here and the default follows `dev`.

**What is missing from that element is the more interesting half.** Before the migration it read
`class="min-h-screen bg-page text-text svelte-1uha8ag"`, and the scope class is now gone. Svelte
stamps one only on an element some scoped rule in that component matches, and this file's entire
`<style>` block was a single `main { }` rule whose contents were recipe members and moved. No rule,
no stamp.

This did not happen everywhere and the number says why: 24 of the 39 components under `src/lib`
still carried a `<style>` block when they were last counted, and 25 of the 48 counting
`src/routes` as well. The figure here read 22 of 43, down from 24, and named no denominator --
recounted, neither half of it held, and which tree is being counted is now said. It is a progress
figure for a migration in flight rather than a fact about the tree, so it is dated: the count
moves with every component the migration reaches, and nothing carries the new one back to this
sentence. The migration moved what belonged to a recipe and left the one-offs and everything
needing a selector where they were, so the blocks shrank rather than vanished.

The useful consequence is a signal that did not exist before. **A `svelte-` class on an element now
means that element genuinely needed a selector**, because that is the only thing left in the escape
hatch. Before, the class was on almost everything and said nothing. Anyone who notices it
disappearing from most of the site is looking at the layering working, not at something broken.

## The build order is the opposite of what StyleX documents

```ts
import stylex from '@stylexjs/unplugin/vite';

plugins: [
	tailwindcss(),
	sveltekit(),
	{
		...stylex({
			useCSSLayers: true,
			aliases: { '$lib/*': ['/ROOT/src/lib/*'] },
			unstable_moduleResolution: { type: 'commonJS', rootDir: SITE },
		}),
		enforce: undefined,
	},
];
```

This snippet used to spell the call `stylex.vite(...)`, and that is a correction: there is no such
member. The plugin is the default export of `@stylexjs/unplugin/vite` and is called directly. The
order the snippet has always illustrated is the order the file has.

`enforce: undefined` is load-bearing. `@stylexjs/unplugin` declares `enforce: 'pre'`, which hoists
it above the Svelte compiler wherever it sits in the array, and its Babel pass then receives an
uncompiled `.svelte` file and parses it as JSX:

```
[plugin @stylexjs/unplugin] src/routes/+page.svelte:6:6
SyntaxError: Unexpected token, expected "}" (6:6)
```

Three arrangements were measured and all three fail this way: the plugin before `sveltekit()`,
which is what StyleX's own documentation recommends; the plugin last in the array without the
`enforce` override; and the plugin first of all. Deleting the `enforce` is the only thing that
works, because the transform has to run on the JavaScript the Svelte compiler produces.

StyleX's advice to keep the plugin ahead of the framework exists to preserve React's Fast Refresh.
For Svelte it is exactly inverted, and the official SvelteKit example carries the same override with
no comment on it.

### In development the visual layer arrives with its runtime, and must not be linked

A build appends StyleX's CSS to the asset Vite already emits, after Tailwind's, which is where the
layer order above comes from. The dev server has no such asset: the plugin serves the sheet at
`/virtual:stylex.css` and its updates behind a runtime module.

**Linking that sheet from the head is the obvious way to reach it, and it inverts the cascade.** In
development Tailwind arrives through the module graph as injected styles rather than as a stylesheet
link, so a static link is the first thing in the document to declare a layer, and layer order is
fixed by first declaration. Measured on an article, at load and a second later:

```
priority1, theme, base, utilities, components, properties    h2 font-weight 400
theme, base, utilities, components, properties, priority1    h2 font-weight 600
```

For that second Tailwind's `h2 { font-weight: inherit }` reset beats a StyleX weight. Nobody reads a
page inside it, but anything that measures rendered text during hydration does: the table of
contents sizes its collapsed bars from each heading's width in that heading's own font, and two
headings a step apart landed on different steps depending on which side of the flip the measurement
fell.

**Dropping the link is the other wrong answer, and it fails in the opposite direction.** Importing
only the runtime module puts the sheet in the document after hydration rather than before it:
measured on an article, the sheet landed at 709ms while the rail had already sized its bars at
571ms, against a heading the reset had left at 400. The order was right and the layer was absent,
which for anything that measures is the same defect wearing better manners.

So the layout declares the layer order first, in a stylesheet carrying no rules, and links the sheet
after it:

```html
<style>
	@layer properties, theme, base, components, utilities;
</style>
<link rel="stylesheet" href="/virtual:stylex.css" />
```

Tailwind names those layers itself and re-declaring them changes nothing; what it buys is that
`priority1` can no longer be the first layer the document has seen. Measured again, the heading is
600 from the first frame and the order is the build's. Development only, and the whole of it is
inside a `dev` branch, which is a compile-time constant.

`check-css` sees none of this, because it reads a build, where the window never existed. What
catches it is the migration's own gate, which runs against this server -- and did, twice, before
this arrangement was arrived at.

**Nothing tests this.** Getting it wrong fails the build, by name, with a line number. A loud
failure needs no test; it needs the comment that is beside the line.

### The module resolution is stated rather than defaulted, because it is what makes `$lib` reachable

StyleX resolves an import itself, at compile time, and understands neither SvelteKit's aliases nor
a `rootDir` other than the working directory it happened to be started from. Left to the default it
silently declines to resolve `$lib/vocabulary.stylex.ts` and every component importing it fails the
build with `nonStaticValue`.

The plugin call in [vite.config.ts](../../../apps/site/vite.config.ts) states both, in two options
side by side: `unstable_moduleResolution: { type: 'commonJS', rootDir: SITE }` and
`aliases: { '$lib/*': ['/ROOT/src/lib/*'] }`. This read as though `aliases` were a field of
`unstable_moduleResolution`, which is a correction -- it is a sibling of it, a top-level option of
the plugin. `/ROOT/` is StyleX's own marker for a path under `rootDir`, which is set to this app
rather than the workspace. The other setting this option takes, and why it is not the one
configured here, is under "The option that would have preserved the hash has never worked".

## The older names, which have not been renamed anywhere else

"Layout", "visual" and "the selector layer" are the old axis's words for the frame, the vocabulary
and the escape hatch. Two headings in this file still carry "the visual layer" and are cited by
name from code, so they keep their exact wording; `mise run refs` checks that a quoted section name
still exists, and renaming one would break the citation rather than improve it. The same words are
quoted verbatim in source comments across `apps/site/src`, each one repeating the old test rather
than the new one. Those comments are wrong about the reason and mostly right about the answer, and
correcting them is work this file records rather than work it does.
