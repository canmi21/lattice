# The three layers of a style

Three systems write CSS for the site, and each owns one kind of declaration. Which declaration
belongs where is the subject of this file. What the declarations themselves say -- why a rail is
8.5rem, why Korean takes `word-break: keep-all` -- is [styling.md](../styling.md)'s, and nothing
here overrides a decision recorded there.

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
  reader learns it by looking. `quiet-control` in `utilities.css` already writes `cursor` beside
  colour and weight, which is the same answer arrived at before there was a rule.
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

### There is a fourth participant, and it sits above the visual layer

The table above is the three layers this arrangement names. It is not the whole of what writes CSS
here. **Nineteen of the thirty selectors in `utilities.css` sit outside every `@layer`**, including
`.spring-underline`, `.article-link`, `.jump-target` and `.article-rail`, while eleven sit inside
`base` or `components`. Nothing says which a given rule should be, and an unlayered rule outranks
every layered one -- so most of the named vocabulary beats StyleX.

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
[todo.md](../todo.md) beside the question of where the vocabulary should live -- the two are one
decision, because giving `utilities.css` a layer is also choosing what it is a layer of.

That ordering is the one this layering wants -- the escape hatch outranks the vocabulary, which
outranks the frame -- and it is worth being clear that this is luck rather than design. **It falls
out of which plugin appends its CSS last.** Neither vendor promises it and neither would notice
breaking it: an inverted order raises no error, it just starts answering some properties from the
other layer. So it is held by a check rather than by a reading:
[css-layers.ts](../../apps/site/scripts/css-layers.ts), run over the built stylesheets by
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

### An attribute selector is not a condition, even on the element itself

A StyleX condition key is a pseudo-class or an at-rule and nothing else:

```ts
type PseudoClassStr = `:${string}`;
type AtRuleStr = `@${string}`;
type CondStr = PseudoClassStr | AtRuleStr;
```

**But that type admits its own counterexample, and measuring is what found it.** StyleX validates a
key by the character it opens with rather than by what it contains, so wrapping the attribute makes
it a pseudo-class and it passes. Run through the build's own Babel plugin at the pinned version:

```
.x12yfjdu:is([data-highlighted]){background-color:rebeccapurple}
```

So `[data-liked='true']` cannot be a key and `:is([data-liked='true'])` can. Whether that is a
deliberate affordance or a validator that only inspects the first character is not something this
repository can know, which is the argument for treating it as neither settled nor forbidden: it is
recorded in [todo.md](../todo.md) and no migration has relied on it.

What stands regardless is the narrower fact. `stylex.when.*` takes an attribute selector only to
describe an *ancestor* or a *sibling*, so a component varying on **its own** data attribute has no
supported spelling, and every migration that met one left the rule in the selector layer.

**The general lesson is not about attributes.** This section first said such a rule had no spelling
at all, which was a true observation about the type generalised one step past what had been tested,
by the same hand that had written "measure the machine before blaming the program" an hour earlier.
A rule inferred from a type definition is a reading, and this file's own protocol is that a reading
is confirmed by measurement before it becomes a rule.

So **the selector layer overrides StyleX and never carries it.** A style reaches an element only
through a class on that element. This is a property of the arrangement rather than a limitation to
work around, and it is what keeps the escape hatch from quietly becoming a fourth way to write the
visual layer.

## Two conditions that can both be true are made exclusive, never ranked

Where one property carries two conditions that can hold at once, the layers disagree about which
wins, and neither disagreement is ours to inherit. Chrome matches `:hover` on a disabled button,
and the pointer is usually still on the button that just disabled itself, so the newsletter's
submit carries both `:hover` and `:disabled` on `opacity`. Tailwind emits its hover block before
its disabled rule and the dimmer value wins; StyleX sorts `:hover` after `:disabled` regardless of
the order they are written in, and regardless of being nested inside the hover media query.
Measured on both: 0.6 before, 0.85 after.

**So the migrated form spells out the condition the old ordering left implicit** --
`:hover:not(:disabled)` beside `:disabled` -- and the two stop being ranked because they can no
longer both match. That is correct by construction rather than by measurement, which matters:
a value that depends on one layer's sort order is a value that changes the next time either
layer changes its mind.

The general form: **if two conditions on one property can be true together, say which one you
mean.** Relying on an ordering is relying on something no vendor documents.

## A ratio that does not terminate cannot be written as a ratio

StyleX evaluates arithmetic at compile time and emits the result to five decimal places. A Tailwind
`leading-5` on a 14px body is `calc(1.25 / 0.875)`, which is `1.428571...`, and what reaches the
stylesheet is `1.42857`. Against 14px that is 19.99998px, Chrome floors it to the 1/64th of a pixel
below, and the element is 0.0156px shorter than it was.

Nothing about that is visible and everything below it moves. Found by the gate on a titled code
fence, where it displaced every element beneath the fence on the page.

**So a length is written as a length.** `1.25rem` is exact and `calc(1.25 / 0.875)` is not, and the
same holds for any ratio whose decimal expansion does not stop. The general form: the visual layer
takes a value, not the arithmetic that produced one, because the arithmetic is done by a compiler
that has to round and CSS would not have.

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

### A class handed to a child is the same hazard one level up

A caller may pass a StyleX class to a component through its `class` prop, and that is a legitimate
place for one. The condition is on the receiver: **a component that takes a `class` prop merges it
with its own rather than replacing either.** Replacing fails exactly the way spreading `attrs` over
an existing attribute fails, silently and with no complaint from the compiler, only now the two
halves are written in different files.

Checking that the receiver happens to carry no visual layer of its own is the weaker test and was
the one used the first time this came up. A component that merges is safe whether or not it has
one, and a component that does not merge is a trap waiting for the day it gains one.

## One stylesheet for every route

StyleX aggregates every route's styles into the entry stylesheet. Measured with a second route: a
style used only by that route ships in the sheet the layout loads. Svelte's scoped CSS still splits
per route, so the two behave differently and the difference is not configurable.

Accepted rather than worked around. Atomic CSS deduplicates across the whole site, so the total is
smaller than per-route sheets holding the same declarations repeatedly, and one stylesheet that
every page shares is one cache entry. What it costs is that a style only the licence pages use is
bytes an article reader also fetches.

## Migrating proves sameness, not correctness

**A migrated component renders exactly what it rendered before.** What the migration changes is
where a declaration is written, never what it says and never how its value is arrived at. A length
derived through a cascade of custom properties keeps being derived that way; a colour keeps being
the same variable.

**The test applies to a declaration, and stops applying to a member of a set.** A group of
declarations that only means anything together moves whole or stays whole, and it stays wherever
the members that cannot move are. The code block's reveal is the case: four values make up its
resting frame, two of them are placement and one has its counterpart in a descendant rule, so the
fourth -- an `opacity` that is visual and single-element and would otherwise move -- stays with
them. Splitting it would leave half a mirror in another layer.

The bound, so this does not become a licence to leave anything where it is: **the set has to be one
that something else already writes as a unit.** There, `renderCopyReveal(0)` writes all four inline,
which is checkable. Declarations that merely feel related do not qualify.

**And it moves the visual layer only.** A component's `<style>` block usually holds layout beside
visual -- `.code-copy` opens with `position`, `top` and `z-index` and closes with `border-radius`,
`letter-spacing` and `color` -- and neither half needs a selector, so strictly neither belongs
there. The visual half moves and the layout half stays, which leaves the block smaller and still
mixed. That is the intended stopping point rather than a job half done: relocating layout out of
scoped CSS and into the markup is a second pass with its own volume and its own risk, and running
it inside a migration whose whole value is an empty diff would make the diff unreadable. It is one
entry in [todo.md](../todo.md), for the site rather than per component.

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

**It cannot police motion, and it is worth knowing why rather than assuming it does.** The harness
freezes every duration and delay to zero so that two runs agree, which is the same act that makes a
duration unreadable: everything measures 0s whether the migration kept it or dropped it. What is
left comparable is `transition-property` and the timing function, and those are compared. A moved
transition is otherwise checked by reading it against the utility it replaced -- Tailwind's
`transition-colors` is seven properties plus three gradient variables the page never sets, and
`duration-200` with the default easing is `200ms` and `cubic-bezier(0.4, 0, 0.2, 1)`.

**A surface that does not exist until it is opened is invisible to it.** The search dialog renders
nothing until its shortcut is pressed, and the modal, the menu, the popover and the enlarged picture
are the same shape. Measured, the homepage snapshot holds 247 elements and none of them is the
search panel. Those components are not ungateable, but gating them means the harness driving the
interaction first, and until it does they are migrated last and checked by hand.

**It compares a list of properties, and the list is not the rule.** This is the one worth reading
twice, because the gate's green line is otherwise read as "nothing changed" when what it means is
"none of the properties on a list somebody wrote by hand changed".

Measured: migrating the article shell applied `user-select: none` to the rail and not to the
metadata row beside it, so the row silently became selectable again, and the diff over 120
snapshots was empty. `user-select` was not on the list. It was found by reading computed style in a
browser afterwards.

The list has since gone from seventy-three properties to ninety-eight, and the additions say what
kind of hole it had. `translate`, `rotate` and `scale` are separate properties from `transform` in
modern CSS and were not covered by it -- the code block's chevron turn migrated unwatched for that
reason, and was checked by hand afterwards rather than by the gate. `border-*-style` was compared
on two edges while width and colour were compared on four, so a single longhand where a shorthand
belonged would have passed. The spring underline is drawn as a background, and
`background-size`, `-position` and `-repeat` were absent.

**The shape of the mistake generalises past the names.** The list was written from the properties a
migration was expected to move, while what a migration is *allowed* to move is decided by the test
at the top of this file -- and the file already says of its own lists that the lists are examples
and the test is the rule. A list and a test drift the first time somebody applies the test
honestly. So the list is maintained against what the site declares rather than against what anyone
expects to touch, and a migration that moves a property nobody has compared before says so.

**No custom property is compared, so a utility's private variables leave with it unnoticed.**
Dropping `text-sm` or `border-l-2` from the markup also stops the element declaring `--tw-leading`
and `--tw-border-style`. Both are registered with initial values that happen to match, so nothing
has broken yet; the general case is a descendant reading a variable a migration silently stopped
setting. Tailwind's three gradient variables are the live example, named by every migrated
`transition-colors` and set by nothing on this site.

**Ten durations have moved into the visual layer and none of them is gateable.** They were audited
by reading rather than measured: every one is a literal that matches what it replaced, `duration-150`
to `150ms`, `duration-200` to `200ms`, `transition: color 150ms` to `150ms`, and `transition: none`
to a reduced-motion branch of `0s`. The newsletter's three keyframe durations were not moved, and
should not be: they read the variables `sequence.ts` supplies. An audit like that is a person's job
each time, which is the cost of freezing durations so that two runs agree.

**What the gate cannot see, a text comparison mostly can, and it costs seconds.** Three of the holes
above are holes in a *rendered* comparison and not in the source, so they were closed by comparing
the two trees as text instead. Every property name declared in a component's old scoped block was
required to have a home in its new one, counting a longhand as covering the shorthand it came from;
every at-rule condition present before was required to still be present; and every component that
gained a `@media (hover: hover)` was required to have had a hover answer before. Across all
thirty-five migrated components and both stylesheets the three came back with nothing: no property
without a home, no condition dropped, no hover invented. The two the first check named were both
itself being wrong -- `pre:focus-visible` is a selector that looks like a declaration, and
`-webkit-user-select` is written by StyleX rather than by the author, which the built stylesheet
confirms as `.x87ps6o`.

This is worth doing before the browser runs rather than after. It is the only check that sees a
reduced-motion branch at all, since the harness freezes durations; it reads every route including
the ones a snapshot never visits; and it fails loudly on the mistake a rendered diff reports most
confusingly, which is a declaration that simply stopped being written. It cannot tell whether a
value is right. It can tell whether one went missing.

**A caution that cost an hour: `jj file show` reads its path as a fileset, and this site's routes
are full of brackets.** `apps/site/src/routes/licenses/[license]/+page.svelte` returns empty and
exits non-zero, which a script reads as "the file did not exist before" and skips. Four route files
-- the densest Tailwind on the site among them -- were silently absent from the first run of all
three checks, and the second run appeared to find five hover behaviours invented out of nothing.
Both were the quoting. The literal form is `file:"<path>"`, and a check that walks a tree should
count what it could not read and say the number rather than treat it as zero.

**It proves sameness against today, not correctness.** Two errors that cancel at the width being
measured read as clean.

The harness that takes those snapshots is migration scaffolding and is not kept. The only permanent
test this arrangement adds is the one holding the layer order.
