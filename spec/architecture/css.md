# The three layers of a style

Three systems write CSS for the site, and each owns one kind of declaration. Which declaration
belongs where is the subject of this file. What the declarations themselves say -- why a rail is
8.5rem, why Korean takes `word-break: keep-all` -- is [styling.md](../styling.md)'s, and nothing
here overrides a decision recorded there.

## Each layer owns one kind of declaration

| Layer               | Owns                                                 | Written in            |
| ------------------- | ---------------------------------------------------- | --------------------- |
| Tailwind            | layout: flow, box, spacing, alignment, size, position | the markup            |
| StyleX              | visual: colour, type, border, radius, shadow, motion  | TypeScript            |
| Svelte `<style>`    | the selector: whatever the other two cannot address   | the component's block |

**Tailwind stays in the markup because layout is what the markup is.** A row that is a flex row
with a gap says so on the element, where somebody reading the structure is already looking, and
they read it without leaving the file. That is the whole argument for utilities and it is an
argument about structure only; it stops being true of colour, where a class name is a lookup into
a palette the markup cannot show.

**StyleX owns the visual vocabulary because a vocabulary wants to be composed and typed.** A
surface is a set of declarations with a name, used in several places, and it should be possible to
say so in one expression that a compiler checks and a bundler deduplicates. Utilities cannot name
a surface; they can only spell one out again at each site, and 504 visual class tokens spread over
43 components is what spelling it out again looks like. The named layer in
[utilities.css](../../apps/site/src/styles/utilities.css) is the part of this the site already had,
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

That ordering is the one this layering wants -- the escape hatch outranks the vocabulary, which
outranks the frame -- and it is worth being clear that this is luck rather than design. **It falls
out of which plugin appends its CSS last.** Neither vendor promises it and neither would notice
breaking it: an inverted order raises no error, it just starts answering some properties from the
other layer. So it is held by a test rather than by a reading, and the test asserts the relative
order of the three rather than the layer names, which are upstream's to rename.

**A conflict resolves per property, never per block.** A scoped rule naming only `background` takes
`background` and leaves a StyleX `border-radius` on the same element standing; measured, including
through a scoped descendant selector reaching a StyleX-classed child. Two layers on one element are
not two candidates for the element's whole appearance. This is what makes the selector layer usable
as an override of one declaration rather than a decision to hand-write everything about a node.

## The build order is the opposite of what StyleX documents

```ts
plugins: [tailwindcss(), sveltekit(), { ...stylex.vite({ useCSSLayers: true }), enforce: undefined }]
```

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

**Nothing tests this.** Getting it wrong fails the build, by name, with a line number. A loud
failure needs no test; it needs the comment that is beside the line.

## Colour is never retyped

A StyleX declaration names a colour by reading the custom property `libs/tokens` already declares
-- `var(--color-text-soft)`, not the OKLCH value behind it. Measured: a StyleX style resolving a
Tailwind `@theme` variable renders that variable's value, so the two systems read one table.

This is the single cheapest guarantee available here and it is structural rather than tested.
`libs/tokens` stays the one home for a colour, as
[workspace.md](workspace.md) requires; a migrated declaration therefore cannot change a colour,
because it is the same variable it was before. What a migration can get wrong is a number it
retyped, which is geometry, and geometry is what the migration's diff polices.

The Cargo and Mermaid palettes stay where they are. Both are component-local mirrors that exist for
a reason written down in [styling.md](../styling.md), and neither is part of the interface
vocabulary this layer owns.

## StyleX cannot be reached from a stylesheet

A Svelte `<style>` block cannot compose a StyleX style. CSS has no mixin, Svelte implements no
`composes`, and writing one emits it verbatim as a declaration the browser discards:

```css
.card-composed.svelte-16dnk2j{composes:visual;padding:3px}
```

No build error, no console warning, no styles. The structural reason is the build order above:
StyleX runs on the JavaScript the Svelte compiler produced, while the CSS from a `<style>` block
left that compiler at the same moment and is never handed to StyleX at all. The two never meet, and
no configuration makes them.

So **the selector layer overrides StyleX and never carries it.** A style reaches an element only
through a class on that element. This is a property of the arrangement rather than a limitation to
work around, and it is what keeps the escape hatch from quietly becoming a fourth way to write the
visual layer.

## `attrs` replaces `class`, so `class` is merged by hand

`stylex.attrs()` returns an object carrying `class`, so spreading it onto an element that already
has a `class` attribute silently discards the attribute. Measured in the server output: an element
written with `class="bg-red-500"` and a spread after it renders `class="x1o0ba8q svelte-1uha8ag"`,
with no warning from the compiler, the linter or the browser.

Every element carrying both layers therefore merges the two strings itself, and a component taking
a `class` prop merges three. The repair is a helper that makes the wrong form hard to write rather
than a rule asking people to remember, because a rule cannot be checked here: the workspace's
`lint-format.md` gives semantics to oxlint, and oxlint has no equivalent of
`@stylexjs/eslint-plugin`.

## One stylesheet for every route

StyleX aggregates every route's styles into the entry stylesheet. Measured with a second route: a
style used only by that route ships in the sheet the layout loads. Svelte's scoped CSS still splits
per route, so the two behave differently and the difference is not configurable.

Accepted rather than worked around. Atomic CSS deduplicates across the whole site, so the total is
smaller than per-route sheets holding the same declarations repeatedly, and one stylesheet that
every page shares is one cache entry. What it costs is that a style only the licence pages use is
bytes an article reader also fetches.

## Migrating proves sameness, not correctness

**A migrated component renders exactly what it rendered before.** Where the old arrangement put a
declaration in the wrong layer, moving it to the right one is a second change and does not travel
with the first.

The two are worth separating because mixing them destroys the only signal available. If a migration
is allowed to improve as it goes, a visual regression and an intended improvement arrive in the same
diff and look alike, and the reviewer's question stops being "did this change anything" and becomes
"is every change here one somebody meant". The first question a machine can answer.

So the gate on a migrated component is a **per-element diff of computed style and geometry**, taken
before and after, with the `class` attribute excluded because class names are exactly what is
supposed to change. An empty diff is the pass. A non-empty diff is not a failure but an obligation:
every entry is explained or reverted.

Findings about layering that the migration is not allowed to fix go to
[todo.md](../todo.md), with the evidence, one entry each.

### Coverage is counted in components, not in URLs

The corpus renders every block component somewhere, and the smallest set of addresses that reaches
all of them is ten: four articles, the homepage and the four licence route shapes, plus one article
that carries almost no blocks as a control on the article shell itself. `observation-to-lowering`
alone carries the quadrant, the Mermaid fences, the author's notes, the spoilers, the in-corpus card
and the blockquotes; `rust-cargo-cranelift-tuning` carries the images, the link card, the repository
card, the Cargo widget and Tokei; `friends-come-in-phases` is the only article with a tweet.

Two dimensions are not optional. **A translated view renders components the source view has none
of** -- the translation notice, and a translator's note, which appears in no `.md` file because it
lives in a sidecar. And the widths that matter are the ones [styling.md](../styling.md) already
identifies as behaviour boundaries rather than a round number picked here.

### What the gate cannot see

**It runs Chrome.** The floors in [compat.md](../compat.md) are Firefox 115 and Safari 16, and this
repository has already been caught once by a property measured in one engine: `text-wrap: pretty`
was free in Chrome and expensive in WebKit, visible only on a narrow column. Those two browsers stay
a person's job.

**A static snapshot has no hover and no focus**, and a good deal of what this site decides visually
lives in those states. They are driven explicitly, from the list the styling rules name, rather than
assumed to follow.

**It proves sameness against today, not correctness.** Two errors that cancel at the width being
measured read as clean.

The harness that takes those snapshots is migration scaffolding and is not kept. The only permanent
test this arrangement adds is the one holding the layer order.
