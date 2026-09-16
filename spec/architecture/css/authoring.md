# What a component may not write, and what it has to write by hand

The constraints the three layers put on a component's own source: what a value may never be
retyped as, what a comment may not contain, what a selector cannot express, and where a merge has
to be done by hand. Which layer owns which declaration is [layers.md](layers.md).

## Colour is never retyped

A StyleX declaration names a colour by reading the custom property `libs/tokens` already declares
-- `var(--color-text-soft)`, not the OKLCH value behind it. Measured: a StyleX style resolving a
Tailwind `@theme` variable renders that variable's value, so the two systems read one table.

This is the single cheapest guarantee available here and it is structural rather than tested.
`libs/tokens` stays the one home for a colour, as
[workspace.md](../workspace.md) requires; a migrated declaration therefore cannot change a colour,
because it is the same variable it was before. What a migration can get wrong is a number it
retyped, which is geometry, and geometry is what the migration's diff polices.

The Cargo and Mermaid palettes stay where they are. Both are component-local mirrors that exist for
a reason written down in [styling/controls.md](../../styling/controls.md) and
[styling/blocks.md](../../styling/blocks.md), and neither is part of the interface
vocabulary this layer owns.

## A comment in the module script cannot write a tag in angle brackets

Not a JSX-like tag, not one quoted inside a code span, not one in a URL -- anywhere in the module
script's own comments. oxfmt reads that as the start of markup, mis-parses the rest of the block,
and deletes the whole instance script below it: silently, with no error, and a zero exit status.
The visual half of a component sits in the module script precisely because it holds no markup, so
this rule costs it nothing to keep and is the one thing the module script's comments must not do.

## StyleX cannot be reached from a stylesheet

A Svelte `<style>` block cannot compose a StyleX style. CSS has no mixin, Svelte implements no
`composes`, and writing one emits it verbatim as a declaration the browser discards:

```css
.card-composed.svelte-16dnk2j{composes:visual;padding:3px}
```

No build error, no console warning, no styles. The structural reason is the build order in
[layers.md](layers.md): StyleX runs on the JavaScript the Svelte compiler produced, while the CSS
from a `<style>` block left that compiler at the same moment and is never handed to StyleX at
all. The two never meet, and no configuration makes them.

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
recorded in [todo.md](../../todo.md) and no migration has relied on it.

What stands regardless is the narrower fact. `stylex.when.*` takes an attribute selector only to
describe an *ancestor* or a *sibling*, so a component varying on **its own** data attribute has no
supported spelling, and every migration that met one left the rule in the selector layer.

**The general lesson is not about attributes.** This section first said such a rule had no spelling
at all, which was a true observation about the type generalised one step past what had been tested,
by the same hand that had written "measure the machine before blaming the program" an hour earlier.
A rule inferred from a type definition is a reading, and this directory's own protocol is that
a reading is confirmed by measurement before it becomes a rule.

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
