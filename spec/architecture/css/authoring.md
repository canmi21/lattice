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

### The instance script's comments cannot either, and there the symptom is silence

The same tag in the _instance_ script's comments breaks a different tool in a worse way.
`svelte-check` stops parsing the script where it meets one and reads the remainder of the file as
markup, so everything below is never type-checked. Nothing is deleted and nothing is reported: the
file still appears in the run and still says zero errors.

Measured on this repository's largest component. Taking `<style>` out of the opening doc comment of
[video-controls.svelte](../../../apps/site/src/lib/components/video-controls.svelte), changing
nothing else, turned `66 FILES 0 ERRORS` into `67 FILES 10 ERRORS`. **The file count is the tell**:
the swallowed script imported nothing, so its imports never entered the program either. The ten
errors it was hiding had been there long enough that nobody could say when they arrived.

**Backticks do not stop it**, which is the half a reader will assume otherwise -- the comment that
hid those ten wrote the tag inside a code span in a JSDoc block. Only the compiler and the dev
server were ever unaffected; the page rendered correctly throughout.

So the rule is the whole file's, not the module script's: **no comment anywhere in a component
writes a tag in angle brackets.** Name it in prose. Whether the closing tag matters, whether other
tag names do it, and whether an entity escapes it are all untested, and there is no reason to find
out rather than simply not writing one.

## A comment that names a utility compiles that utility

Tailwind reads the raw bytes of every file under `apps/site`, so a class name written in a comment
produces a rule exactly as if an element carried it. Backticks are bytes like any other and stop
nothing. Measured at the time: twenty-four utilities in the built stylesheet that no element on the
site carries, 2,336 bytes of them, every one from prose explaining what the vocabulary replaced.

So the rule is about spelling, never about saying less. Name the theme variable behind the utility
-- `--leading-relaxed` rather than the class that reads it -- or name the constant that replaced it,
or describe it. What may not happen is a comment being deleted to silence the scanner: the reasoning
is why these comments exist and the scanner is a build detail. A name that is genuinely load-bearing
stays, and it is cheaper to keep a handful of those than to damage the prose around them.

Nothing tests this. A dead rule costs bytes rather than correctness, and it is found the way it was
found the first time: build, list what the `utilities` layer emitted, and subtract what the markup
carries.

### Most of it is not a comment at all, and that part is not worth fighting

The twenty-four above were class names cited as class names, so rewriting them cost nothing. They
are the smaller half. Measured at the same time: twenty-eight more utilities, thirty-two rules and
4,590 bytes, emitted from text that is not a class name in any sense. `.table` from a `<table>` and
from `view === 'table'`. `.filter` from a `.filter()` call. `.ring` from seventeen comments about
focus rings. `.transform` from a Vite hook of that name. Every Tailwind utility whose name is also
an ordinary English word, a CSS property, a CSS keyword or a common identifier is reachable this
way, and this repository writes all four constantly.

**Two of them are the cost of a good name.** `transition` and `border` are emitted because the
design vocabulary is named after the CSS properties it holds, which is the right name for it and
costs 538 bytes.

**Whole-text scanning is how Tailwind 4 works and cannot be narrowed.** Read in 4.3.3: the scanner
takes a base path, a glob and a negation flag, and returns a candidate string with a byte offset
and nothing about the syntax around it, because it is a byte-level extractor rather than a parser.
Neither `extract` nor `safelist` exists any more.

So the only instrument left is `@source not inline(…)`, a deny-list, and it is refused here. It
would have to hold `table`, `border`, `ring`, `shadow`, `filter`, `transition`, `outline`,
`visible`, `static` and `inline` -- the ten most plausible things somebody types into a class
attribute by hand -- and a denied name compiles to nothing with no error and no warning. A check
could be written to make that loud, and then the check is one more thing to keep current.

The arithmetic is what settles it rather than the taste. Of the 4,590, **2,134 comes from code
nobody would rewrite** and is unreachable by any means but the deny-list; 701 would fall to
rewriting prose, which is the whole of the cost refused above for fifteen per cent of the waste.
Rewriting English was never going to buy most of the bytes.

What the migration out of the escape hatch takes with it is a third thing again, and it is real:
`backdrop-filter` alone is 569 bytes and four declarations. It is a side effect of moving
declarations to the layer that owns them, not a reason to move them.

## A class name is a literal, or a lookup in a table of literals

A compiler that builds a class name by joining strings produces a name the scanner never reads,
and Tailwind generates nothing for it. The declaration is absent from the stylesheet and the
markup carrying it is silently unstyled.

`compile.ts` did this for the colour and family classes an article directive can ask for, and
`text-blue`, `text-accent`, `font-mono` and `font-serif` were not in the built CSS at all.
`text-text-strong` worked, because that exact string happened to be written as a literal
elsewhere in the repository -- which is the failure mode's whole character: it looks fine until
the one lucky name is the one you check.

**So a compiler emits a literal, or reads one out of a table whose values are literals**, and an
input the table does not name fails where the article is compiled rather than producing a class
that does nothing.

### The compiler writes a class only where the element's styling is a recipe

The rule above says what a class name may be; this one says when one may be written at all. The
compiler can class anything: [compile.ts](../../../apps/site/src/lib/content/build/compile.ts)
puts `focus-link`, `spring-underline` and `article-link` on every prose link, and two frozen
tables turn a `:t` token into a colour or a font class. So the discipline is written as a rule
rather than left as a habit -- **the compiler writes a class on an element where that element's
styling belongs to a named recipe, and nowhere else.** Without it, question one of
[layers.md](layers.md) is back to asking whether somebody felt like classing something, because
the boundary moves the first time it is convenient.

**A class the content author asked for is allowed.** The `:t` directive path -- `styleClasses`,
`COLOR_CLASSES`, `FONT_CLASSES` -- resolves a token the author wrote in the article into a
utility, which is the compiler standing in for the markup author rather than inventing anything.
The separator is observable and is not intent: **did the class come from something the author
wrote in the article, or did the compiler invent it?** A `:t` attribute is in the source file;
`spoiler` and `note-marker` are not.

**A class the compiler writes on its output is a style**: either a literal Tailwind utility, or a
named recipe from the vocabulary's hand-written implementation. Both are governed by the
enumeration -- [layers.md](layers.md), "What each layer owns, by name".

**A `data-*` attribute the compiler writes is an address**: it carries no declaration, and it
exists only so an escape hatch's selector can reach that node. `note-marker`, `note-words` and
`spoiler` are addresses, and each is reached today by a `:global()` rule or a
`classList.contains`.

That replaces a category rather than adding an exception. What used to stand here was an
exemption -- a class carrying no styling is not a styling class, observable by grepping the built
sheets for the name -- and an exemption is a second kind of class to remember. The form is better
than the exemption on four counts:

- Question one of [layers.md](layers.md) keeps its plain wording, with no qualifier attached to
  it. Compiled prose carrying no class is the escape hatch, and there is no class that is not a
  class.
- **Tailwind's scanner cannot generate a rule for an attribute**, so an address can never collide
  with a utility name. The section above records `.table`, `.filter` and `.ring` being generated by
  accident; that risk disappears rather than being patrolled.
- **StyleX cannot hash an attribute into an atomic class**, so an address can never be mistaken for
  a recipe.
- Specificity is unchanged. `[data-note-marker]` and `.note-marker` are both (0,1,0), so no cascade
  outcome moves.

**The objection is a good one and it is the wrong question.** `note-marker` is referenced by five
components, so as an address each writes its own `:global([data-note-marker])` and the styling can
drift, where one shared class at least hints they are one thing. But "they look alike" is a recipe
question and not an address one: if those five should share declarations, that is one of the
repeated groups `mise run check-css-extraction` counts, and the answer is to name it. One class
name saying both where a node is and what it looks like hides the sharing inside the address, and
the day one of the five has to differ, nothing reports that the sharing broke.

**The migration is not written here.** It is the two-step the four hand-written recipes need, for
the same reason: the corpus publishes on its own schedule, so the compiler emits both, the corpus
is published, and the old spelling goes after that.

## An unnamed ramp value is marked, so it can be counted

A type ramp property written with a literal is vocabulary that has not been named --
[layers.md](layers.md), "The type ramp is vocabulary by property, and takes its value from a
token". Judging each one again at each site is how they accumulated without anybody knowing the
number: 125 on the hand count that first went looking, and 46 on the gate's, which reads the
vocabulary alone. Neither number is the point and the absence of one was.

**The ledger counts values, not marks.** The design asked for a mark beside each one --
`// unnamed: line height 1.4, not yet named` -- and a gate counting the marks; the mechanism turned
out to be something else. Measured when the gate was built: no mark anywhere in the tree and 46
values wanting one, so a gate counting marks would have reported zero and passed.
`mise run check-css-ramp` finds the values itself and holds the total to a record that may only
fall, which is the half that does not wait on anybody remembering.

An author **may** still write the mark, and it says the one thing the scan cannot: that somebody
looked at this value and decided not to name it. It is reported beside the total rather than
subtracted from it.

## StyleX cannot be reached from a stylesheet

A Svelte `<style>` block cannot compose a StyleX style. CSS has no mixin, Svelte implements no
`composes`, and writing one emits it verbatim as a declaration the browser discards:

```css
.card-composed.svelte-16dnk2j {
	composes: visual;
	padding: 3px;
}
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
describe an _ancestor_ or a _sibling_, so a component varying on **its own** data attribute has no
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
