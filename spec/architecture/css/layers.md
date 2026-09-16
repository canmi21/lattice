# The three layers, and which of them may say a thing

Three systems write CSS for the site, and each owns one kind of declaration. Which declaration
belongs where, what happens where two of them say the same thing, and the order the three are
built in are here. What the declarations themselves say is the `styling/` directory's -- why a
rail is 8.5rem is [styling/rail.md](../../styling/rail.md), why Korean takes `word-break:
keep-all` is [styling/prose.md](../../styling/prose.md) -- and nothing here overrides a decision
recorded there.

## Each layer owns one kind of declaration

| Layer            | Owns                                                  | Written in            |
| ---------------- | ----------------------------------------------------- | --------------------- |
| Tailwind         | layout: flow, box, spacing, alignment, size, position  | the markup            |
| StyleX           | visual: colour, type, border, radius, shadow, motion   | TypeScript            |
| Svelte `<style>` | the selector: whatever the other two cannot address    | the component's block |

**The lists are examples; the test is the rule.** Ask what the declaration decides. If it decides
where the element is or how large, it is layout and stays in the markup. If it decides how the
element looks or how it answers a pointer, it is visual and moves. A list can only ever be as long
as the properties somebody thought of, and the first migrated component reached for four the list
did not name.

Those four, settled here so nobody has to settle them again:

- **`cursor`, `pointer-events` and `user-select` are visual.** None of them moves anything; each
  says what the element is to a pointer, which is appearance in the sense that matters -- the
  reader learns it by looking. The quiet control's class in `utilities.css` already wrote `cursor`
  beside colour and a transition, which is the same answer arrived at before there was a rule; it
  is `surfaces.quietControl` now and still writes it there.
- **`visibility` is layout**, and it is the one that looks like the exception. It is chosen against
  `display` precisely for what it does to the box: the newsletter's ghost label is
  `visibility: hidden` rather than `display: none` because a removed box measures nothing and this
  one exists to reserve a width. A property picked for its effect on layout belongs with layout.
- **`transform` follows the test rather than the property.** A translate that centres something is
  placing it and stays in the markup; a transform that only runs during an animation is motion and
  moves. The question to ask is whether deleting it moves anything while the page is at rest.

**Tailwind stays in the markup because layout is what the markup is.** A row that is a flex row
with a gap says so on the element, where somebody reading the structure is already looking, and
they read it without leaving the file. That is the whole argument for utilities and it is an
argument about structure only; it stops being true of colour, where a class name is a lookup into
a palette the markup cannot show.

**StyleX owns the visual vocabulary because a vocabulary wants to be composed and typed.** A
surface is a set of declarations with a name, used in several places, and it should be possible to
say so in one expression that a compiler checks and a bundler deduplicates. Utilities cannot name
a surface; they can only spell one out again at each site, and the 504 visual class tokens spread
over 43 components counted at the time are what spelling it out again looks like. The named layer in
[utilities.css](../../../apps/site/src/styles/utilities.css) is the part of this the site already had,
arrived at by necessity rather than by design.

**The Svelte block is the selector layer, and it is not a leftover.** Some declarations need to
reach an element no component holds: a `<strong>` the markdown compiler produced, a floating
surface Bits UI portalled out of the tree, a child whose styling depends on its parent, a keyframe.
None of those can be reached by putting a class on something, which is the only thing the other two
layers can do. Measured over the 24 blocks that exist today, 99 of 351 rules are in this class --
not a corner, a third of the file.

So the layering is not three ways of doing one thing with a preference order. It is three
capabilities, and a declaration usually has exactly one place it can go.

## The precedence is measured, and it is not promised

Measured in Chrome against a build and a dev server, both giving the same answer:

| On one element                | Wins             |
| ----------------------------- | ---------------- |
| Svelte scoped against StyleX  | Svelte scoped    |
| Svelte scoped against Tailwind | Svelte scoped   |
| StyleX against Tailwind       | StyleX           |

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
not two candidates for the element's whole appearance. This is what makes the selector layer usable
as an override of one declaration rather than a decision to hand-write everything about a node.

### An element's class attribute says which layer wrote what, and one of those names is a lie

In a browser the three layers are readable off a single element, which is the fastest way to answer
"where does this come from" without opening a file. On the homepage's `<main>`:

```html
<main class="min-h-screen page__styles.page x1jkd24u xiuzu7u x1winvzj x87ps6o">
```

`min-h-screen` is Tailwind and says where the element is and how large. The `x`-prefixed names are
StyleX, one class per declaration, and say how it looks. `page__styles.page` is **also StyleX**, and
it is the one worth knowing about, because it looks exactly like a Svelte scope class and is not
one.

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
`<style>` block was a single `main { }` rule whose contents were visual and moved. No rule, no
stamp.

This did not happen everywhere and the number says why: 24 of the 39 components under `src/lib`
still carried a `<style>` block when they were last counted, and 25 of the 48 counting
`src/routes` as well. The figure here read 22 of 43, down from 24, and named no denominator --
recounted, neither half of it held, and which tree is being counted is now said. It is a progress
figure for a migration in flight rather than a fact about the tree, so it is dated: the count
moves with every component the migration reaches, and nothing carries the new one back to this
sentence. The migration moved the visual half and left layout and everything needing a selector
where it was, so the blocks shrank rather than vanished.

The useful consequence is a signal that did not exist before. **A `svelte-` class on an element now
means that element genuinely needed a selector**, because that is the only thing left in the third
layer. Before, the class was on almost everything and said nothing. Anyone who notices it
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
]
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
<style>@layer properties, theme, base, components, utilities;</style>
<link rel="stylesheet" href="/virtual:stylex.css">
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
