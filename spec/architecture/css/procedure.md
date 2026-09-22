# What to do, in order, when you are about to write style

The order the work happens in: where a declaration goes, how it is spelled once you know, what has
already bitten somebody spelling it that way, what you owe the enumeration when it does not name
your property, and what proves you changed nothing. Every rule below belongs to one of the four
files beside it -- [layers.md](layers.md) decides the layer, [authoring.md](authoring.md)
constrains the spelling, [extraction.md](extraction.md) governs giving a repetition a name,
[migration.md](migration.md) says what a gate establishes -- and is cited rather than restated.

## Look the property up; the three questions are what to do when the lookup fails

Open the enumeration in [layers.md](layers.md), "What each layer owns, by name", and find the
property you are about to write. If it is named there, that is the answer and you are done with
this step. Do not re-derive it: a lookup can be checked by somebody who was not in the argument,
and re-deriving means having the argument again, which is exactly how one property ended up with
two homes in this tree -- [layers.md](layers.md), "The enumeration is the rule, and the test is only
how the enumeration grows".

Trusting the lookup is not the same as trusting it against evidence. **Where the enumeration and
the three questions disagree, the questions win and the enumeration is corrected in the same
change**, by the same section. So do not re-derive an answer the table gives, and do report one the
table gets wrong -- the underline family was found that way, listed by property under two layers at
once.

The three questions the enumeration was built from, asked in order, the first one that answers
answering: **can a class reach the element at all**, and if not the declaration is the escape hatch;
**is the declaration a member of a named, reused recipe**, and if so it is the vocabulary;
otherwise it is the frame. They are stated here and the enumeration is not, and the asymmetry is
the point. Three questions are an axis and do not move. An enumeration grows every time somebody
applies them, so a second copy of it is a list that goes stale silently -- the failure
[migration.md](migration.md) records happening to the gate's own property list, which was written
from expected properties and drifted from the test the first time somebody applied the test
honestly.

There is also a heuristic in [layers.md](layers.md), "The axis this replaces, and why this file is
the argument against it", for guessing an answer before looking it up. It is a good guess and it
decides nothing. Guess with it, then look it up anyway.

## Each layer has its own spelling, and each spelling drags something in

Knowing the layer is half the work. The other half is that the three layers are not three syntaxes
for one act: each reaches an element by a different mechanism, and each mechanism has a failure
that is silent at the moment you write it.

### The frame is a utility on the element, and the scanner reads more than the markup

Write it in the `class` attribute, where somebody reading the structure is already looking. A class
toggled with Svelte's directive is a class like any other and belongs here by the same question --
`class:border-border={shaped}` in
[picture.svelte](../../../apps/site/src/lib/components/picture.svelte) is a frame declaration
written as a condition, not a fourth mechanism.

Two things about that attribute are not obvious. Tailwind reads the raw bytes of every file under
`apps/site` rather than parsing markup, so the utility is compiled from wherever its name is
written, a comment included -- [authoring.md](authoring.md), "A comment that names a utility
compiles that utility". And **a variant is not the at-rule it resembles**: `max-[45rem]:` compiles
to an exclusive condition where the inclusive spelling is `[@media(max-width:45rem)]:`, which is
one instance of the rule in [migration.md](migration.md), "A name that promises a translation is
where the value changes". Where two utilities in this layer set one property, their order is
decided by something the author does not control, so write the pair exclusively rather than
ranking them; the same file anticipates that case.

### The vocabulary is a key in `stylex.create`, and the class it emits is merged by hand

Write a key whose declarations name a colour by reading the custom property `libs/tokens` already
declares rather than retyping it -- [authoring.md](authoring.md), "Colour is never retyped" -- and
whose lengths are lengths rather than the arithmetic that produced one, because the compiler
evaluates and rounds where CSS would not: [authoring.md](authoring.md), "A ratio that does not
terminate cannot be written as a ratio". A condition key is a pseudo-class or an at-rule and
nothing else, which means a component varying on its own data attribute has no supported spelling
here and the rule stays in the escape hatch -- [authoring.md](authoring.md), "An attribute selector
is not a condition, even on the element itself". Two conditions on one property that can hold at
once are made exclusive rather than ranked, in the same file.

Reaching the element is where the layer costs something. `stylex.attrs()` returns an object
carrying `class`, and spreading that onto an element that already has one discards the attribute
silently -- [authoring.md](authoring.md), "`attrs` replaces `class`, so `class` is merged by hand".
The tree's answer is uniform and worth copying rather than rediscovering: measured across
`apps/site/src`, 350 call sites in 38 files, every one of them interpolating
`{stylex.attrs(...).class}` into the class string and not one of them a spread. A component that
takes a `class` prop merges three strings, which
[icons.svelte](../../../apps/site/src/lib/home/icons.svelte) does in the attribute itself.

**A key whose last declaration leaves goes with it, in the same change.** An emptied key emits no
rule and still stamps its readable name on the element, and that name is the only thing in the
output that says which recipe reached which element -- [extraction.md](extraction.md), "The second
gate cannot be an empty diff, and the reason is the readable name". A name standing for nothing
costs the next reader the one signal they had.

Do not open a new name in `vocabulary.stylex.ts` or `surfaces.ts` on the way past. The bar is three
components, and for a group three _unrelated_ ones; [extraction.md](extraction.md) holds both bars
and the gates a name has to pass.

### The escape hatch is a rule in the block, and a selector is the only reason to be there

The one thing that puts a declaration in a `<style>` block is that no class reaches the element.
Anything at all may be written there, and if a class _can_ reach the element this layer is the
wrong answer regardless of what the declaration says.

It outranks both other layers, and a conflict resolves per property rather than per block, so a
rule here overrides one declaration without taking responsibility for the element's whole
appearance -- [layers.md](layers.md), "The precedence is measured, and it is not promised". What it
cannot do is reach the other direction: a block cannot compose a StyleX style, and writing
`composes` emits it verbatim as a declaration the browser discards, with no build error and no
warning. That is [authoring.md](authoring.md), "StyleX cannot be reached from a stylesheet", and it
is structural rather than a configuration anybody can change.

Svelte stamps its scope class only on an element some scoped rule matches, so a `svelte-` class on
an element now means that element genuinely needed a selector -- [layers.md](layers.md), "An
element's class attribute says which layer wrote what, and one of those names is a lie". If you
have written a block and no element gained one, the block matched nothing.

## What bites new code, and why nothing is going to catch it

Every defect named above and below was found by a diff against a previous tree. A declaration
written for the first time has no previous tree, so none of them would have been found. That is the
whole argument for reading this section before writing rather than after, and it is why the two
sharpest hazards here are the two that are silent at every stage: no build error, no lint, no
warning in the browser.

**A comment is compiled.** A class name written in a comment produces a rule exactly as if an
element carried it, and backticks are bytes like any other. Name the theme variable behind the
utility, or the constant, or describe it -- what may not happen is deleting the reasoning to
silence a scanner, which [authoring.md](authoring.md) settles under the heading above.

**A comment can delete the file below it.** No comment anywhere in a component writes a tag in
angle brackets: in the module script oxfmt deletes the instance script beneath it silently and
exits zero, and in the instance script `svelte-check` stops parsing and type-checks nothing below
while still reporting success. Taking one tag out of one doc comment turned `66 FILES 0 ERRORS`
into `67 FILES 10 ERRORS`. [authoring.md](authoring.md), "A comment in the module script cannot
write a tag in angle brackets", and its subsection on the instance script.

**A name that promises a translation may not deliver one**, and this applies to code written today
exactly as it applied to code being moved. `transition` sets five longhand lists and the obvious
spelling writes four; no utility translates a `transform` declaration, because Tailwind 4 writes
`scale`, `rotate` and `translate` as their own properties; and the variant above compiles to a
condition the original did not have. [migration.md](migration.md) names the artefact to inspect for
each, which is what makes the rule followable.

**A vocabulary class may silently outrank your vocabulary key.** Named recipes written before there
was a layer to write them in still sit unlayered in `utilities.css`, and an unlayered rule outranks
every layered one, so an element carrying one of those names can lose the same property out of
StyleX with nothing reporting it -- [layers.md](layers.md), "There is a fourth participant, and it
sits above the visual layer".

## A property the enumeration does not name is written into it in the same change

The three questions decide it, and **the answer goes into the enumeration in the change that
decided it**. That is a rule rather than a courtesy: [layers.md](layers.md), "The enumeration is the
rule, and the test is only how the enumeration grows".

It is also the step most likely to be skipped, and skipping it is not a missing nicety. It puts the
repository back in the state those files spent their length getting out of: a test two honest
readers resolve differently, ruling one property two ways in two components with a careful comment
beside each. Nothing catches that, because a test that disagrees with itself is not wrong anywhere
in particular. A list can be wrong, and being wrong is a thing a list can be caught at.

A finding about the layering that your change is not allowed to fix goes to
[todo.md](../../todo/todo.md) with the evidence, one entry each -- the discipline
[migration.md](migration.md) states for a migration, and the same file is where the site's
outstanding layering questions already live.

## A rule that rests on a global count is computed, never remembered

Whether a declaration is vocabulary depends on how many components apply the recipe it belongs
to. That is a fact about the whole repository, invisible from the file being edited, and it
moves on its own: a third consumer promotes a declaration, deleting one demotes it. Nothing
watching it means the axis is correct on the day it is applied and drifting from the next.

`mise run check-css-extraction` computes it, over a scan of `apps/site/src` that needs no build.
It fails on a name in the vocabulary that fewer than three components apply, and it reports the
declaration groups three or more components write identically with no name. The second is worth
more than the first -- it says a recipe has grown where nobody has named one yet, rather than
waiting for somebody to notice -- and it is the half no count can finish: the bar also asks that
the three components be unrelated, and a copy and a recipe look the same from here. So its number
is recorded rather than judged, in `apps/site/scripts/css-extraction.json`, and moving it either
way is somebody deciding on purpose.

Two more rules rest on a count of the same kind, and each has its own task and its own record.
`mise run check-css-enumeration` gives every declaration in the visual layer to the layer the
enumeration names for its property, and `mise run check-css-ramp` finds the type ramp values
written as a literal instead of read from the ladder -- [authoring.md](authoring.md), "An unnamed
ramp value is marked, so it can be counted". Both hold a number that may only fall, and both say
in the failure that the number is a debt and not a target. **A count they cannot take fails
them.** A file, a block or a value the scan cannot read is named and the gate stops, because a
scan that quietly measures less returns a smaller number and reports nothing about the gap --
the defect [the workspace code.md](../../../../../spec/code.md), "A rule is maintainable only
when breaking it fails loudly", records `check-css-budget` having had.

## The enumeration is data, and this file is not where it lives

The property lists in [layers.md](layers.md) argue where each boundary sits. The lists
themselves are not an argument, and by the workspace's own test -- a sentence that would need
editing because somebody changed the code is describing implementation -- they do not belong in
`spec/` at all.

They live as a typed constant the lint rule, the gate and the documentation all read. One
representation, no parser between them, and no way for the table and the check to disagree.
Generating the document from the data and parsing the document from the check were both
considered: the first puts a machine-written region inside a hand-written argument, the second
can pass by matching nothing at all. Neither failure is available when there is one source and
nobody is transcribing it.

The constant is
[css-owners.ts](../../../apps/site/scripts/css-owners.ts), and it is an object keyed by property
rather than the JSON that sits beside `css-budget.ts`: the failure a hand-kept table has is one
property listed under two layers, and a duplicate key is a type error where a duplicate entry in
JSON is a surprise at runtime. `node apps/site/scripts/css-enumeration.ts --list` prints it.
**The lists in [layers.md](layers.md) are still prose, and until they become a citation this is
two copies rather than one.** The gate reads the constant and nothing reads the prose, so the two
can part company with nothing reporting it -- which is the state this section was written to end.

## First-load CSS has a budget per route category

The layering pushes bytes into two global sheets and leaves only the escape hatch splitting per
route -- [layers.md](layers.md), "The distribution cost is known, and accepted". A gate measures
first-load CSS after a build, by route category, and fails against a recorded budget.

Budgets start at the current figures with headroom: a light page such as the licenses routes and
an article page are the two categories the measurement separates. Raising one is an edit
somebody makes on purpose, which is the only reason to record a number rather than compute it.

## Proving you changed nothing, and the states the proof never entered

Where a change is supposed to change nothing -- a move, a rename, a group lifted into a recipe --
the standard is a per-element diff of computed style and geometry, taken before and after, with the
`class` attribute excluded because class names are exactly what is supposed to change. An empty
diff is the pass; a non-empty diff is an obligation rather than a failure, and every entry is
explained or reverted. [migration.md](migration.md), "Migrating proves sameness, not correctness".

Four things that diff never sees, and they are the four a person has to answer by hand. **A static
snapshot has no hover and no focus**, and much of what this site decides visually lives there.
**Motion is unreadable by construction**: the harness freezes every duration to zero so that two
runs agree, which is the same act that makes a duration unreadable, leaving only the transition
property and the timing function comparable. **A surface that does not exist until it is opened is
absent** -- the dialog, the modal, the menu, the popover, the enlarged picture. And **a
pseudo-element's computed style is not readable at all**, which is a class of rule the method
cannot see rather than a name missing from a list. [migration.md](migration.md), "What the gate
cannot see", holds these and several more.

**The instrument is gone, and the standard is not.** The snapshot harness was migration
scaffolding and was not kept. What `apps/site/scripts/` holds is five CSS gates and not one of
them reads an element: [css-layers.ts](../../../apps/site/scripts/css-layers.ts) asserts the
relative order of the three layers, [css-budget.ts](../../../apps/site/scripts/css-budget.ts)
holds first-load bytes per route category, and the three above count what the rules rest on --
application sites, the layer each declaration was written in, and the ramp values with no name.
Each is a fact about the whole repository, which is the class of thing a person cannot hold; none
is a fact about how one element came out. So `verify` passing is not evidence that a declaration
landed where it was before. The rest is read in a browser, on the states named above, by somebody
who knows what they moved.

### The gap this file will not fill

Everything in the section above is a procedure for a change with a before. **Nothing in these five
files says what stands in for that diff when a declaration is written for the first time**, which is
the case an agent pointed at this file is most often in. The gates recorded here all compare two
trees; a new component has one. Until somebody decides what the answer is, treat it as unanswered
rather than as "the gate passed".

The second gap is smaller and concrete. [authoring.md](authoring.md) gives the repair for the
`class` merge as a helper that makes the wrong form hard to write, on the grounds that a rule here
cannot be checked -- oxlint has no equivalent of StyleX's ESLint plugin. No such helper is in the
tree: all 350 call sites merge by interpolation. Which of the two a new element should follow is
written down nowhere, and the count above is the only reason this file says interpolation.
