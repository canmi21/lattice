# Giving a repeated style one name, and proving the name changed nothing

When a value or a group of declarations has been written often enough to earn a name, where that
name lives, and the gates a change of name has to pass. The layers it is lifted out of are
[layers.md](layers.md).

## A repeated value gets one name, and the name is a constant rather than a variable

[`vocabulary.stylex.ts`](../../../apps/site/src/lib/vocabulary.stylex.ts) holds the values the visual
layer repeats: the radius scale, the type ladder, the two hairlines, the weights, the easing curve,
the one duration that recurs. A value earns a name at **three components**, not two; a name used
twice is a name two people have to learn for nothing.

**It is `defineConsts`, and that is a decision about checkability rather than taste.** A var group
emits a custom property and rewrites every declaration reading it into a `var()`, which changes the
stylesheet and destroys the only cheap way to prove that naming something changed nothing. A const
is substituted at compile time and the declaration comes out as the literal it always was. So the
gate on this kind of change is exact: build, and compare the multiset of emitted declarations per
layer. Naming 24 values across 33 components left all 187 rules and every declaration in them
identical.

**What does move is the class name, and expecting otherwise wasted an afternoon.** StyleX hashes an
atomic class from the declaration _as written_, and under `commonJS` module resolution an imported
constant arrives at `stylex.create` as `var(--<consthash>)`, with the value substituted later when
the stylesheet is assembled. So `.x6i6fhv{border-radius:.375rem}` becomes
`.x13k99{border-radius:.375rem}`: same declaration, different name. 32 of 187 rules were renamed
that way. This is the one thing the migration's own gate already excludes on purpose, class names
being exactly what is supposed to change.

### The option that would have preserved the hash has never worked

`unstable_moduleResolution: { type: 'experimental_crossFileParsing' }` reads the imported module and
inlines the literal, which would keep the hash. It cannot be used. `evaluateImportedFile` guards its
own parse with

```js
if (!ast || ast.errors || !t.isNode(ast)) {
	deopt(bindingPath, state, IMPORT_FILE_PARSING_ERROR);
}
```

and `@babel/core`'s `parseSync` returns `errors: []` on a clean parse, which is truthy. The guard
therefore fires on every file that parsed perfectly, and `stylex.create` fails the build with
`nonStaticValue`.

**It is not a regression and there is no version to go back to.** That line is byte-identical in
every published release from 0.15.0 through 0.19.0, and `@babel/core` has returned an empty array
there since at least 7.12.0. Upstream, [facebook/stylex#1825](https://github.com/facebook/stylex/issues/1825),
opened independently two weeks before this migration reached the question, reports the same defect
with two more stacked behind it and says the cross-file path appears never to have executed
successfully.

**Two of those three defects do not reach this site, and it is worth knowing why rather than
assuming.** The issue reports the `commonJS` fallback leaving hashed variables undeclared in the
output, and substituting one into an at-rule prelude. Both need a constant whose value is itself a
`var()` or a media query string. Every value here is a plain literal, and the built stylesheets
carry zero StyleX-hashed variables and zero at-rule preludes containing `var(`. The boundary is the
kind of value, not the feature.

## A repeated group gets one name too, and that one is free

[`surfaces.ts`](../../../apps/site/src/lib/surfaces.ts) holds the declaration groups several
components draw. It exported seven at the time, where this list named four: `page`, the ground
every route stands on and the ink that inherits from it; `paper`, the bordered ground;
`blockFrame`, which is `paper` at `radius.xl` and is written that way; `interactive`, the eight
declarations a card answers a pointer with; `quietControl`, the compact icon-and-label control a
metadata row is made of; `uiText`, the interface's own type step and the line that step computes
to; and `heading`, the ink and weight a title takes. The list grows as the migration finds the
next repeated group, so it is dated too -- what it establishes is the bar, not the inventory. A
group earns a name on the same bar a value does,
three components, and on one more: the components have to be unrelated. Two files sharing a block
because one was copied from the other is a copy, and naming it turns an accident into an
institution.

**A video clip does not draw `blockFrame`.** Its neighbour in a column of prose is almost always
a picture, so it takes `picture.svelte`'s 2px edge and 1rem corner instead -- two media boxes with
different corners next to each other would read as a mistake in a way a figure and a code block
never do.

**Extraction is free in a way the vocabulary step was not.** A class is hashed from the declaration
as written, and the hash does not depend on which module wrote it, so moving a group into
`surfaces.ts` emits the same class it emitted from inside the component. Measured across the four
extractions there were then, against the seven the list above names: 187 rules before and after,
byte-identical including selectors. The vocabulary step
renamed 32 of those 187 because a constant reaches `create` as `var(--<consthash>)` and the hash is
taken over that; a recipe carries the literal itself, so nothing moves.

That makes the gate strict rather than statistical, and it is worth saying what it then does not
see. **A recipe applied to the wrong element emits exactly the same stylesheet.** So a second gate
reads the class attribute out of the server-rendered HTML for the same thirteen addresses the
coverage section names -- no browser, no build, thirteen fetches -- and compares each element's
classes as a set, because emission order inside a merged object is free to move.

### The second gate cannot be an empty diff, and the reason is the readable name

StyleX's development-only class is composed as `<basename>__<varName>.<key>`, so it names the file
and the constant that declared a style. An extraction changes both, by definition -- that is what
an extraction is. So every call site's readable name changes while its atomic classes do not, and a
gate demanding an empty diff would fail on every extraction commit for the one reason that proves
the extraction happened.

The response is not to look away. **It is the only thing in the output that says which recipe
reached which element**, and that is precisely the question the second gate exists to answer: two
elements both wearing `xqfnruw x1uellxl` look identical whether a recipe or a leftover local key put
them there. So the pass condition is three clauses rather than one.

1. **No atomic class moves.** Any `x`-class appearing or disappearing on any element is a failure.
2. **The recipe's readable name lands on exactly the intended elements**, count reconciled against
   the call sites, with every element that lost a local readable name inside that set.
3. **The classed-element total does not change.** An element that stops carrying a class attribute
   at all is neither of the above.

Measured over the whole step against the tree before it: 70 elements differ only by a readable name
-- 18, 45, 1 and 6, reconciling to the four recipes' call sites -- no atomic class moved anywhere,
nothing else moved, and the total held at 10655.

This is the migration gate's own move made one level down. That gate excluded the class attribute
because class names were exactly what was supposed to change; here the atomic class is the part
that must not change and the readable name is the part that must. Safe both times for the same
reason: the excluded thing is named and measured rather than waved past.

### What the two gates could not see, and what it cost to look

Six elements the server never renders were outside the class-attribute gate by construction: the
modal's surface and title, the search panel and its group title, the menu surface and the popover
surface. They were covered by capturing the two addresses that carry them, at every width, theme and
locale, with each floating surface driven open. Sixty page snapshots and 290 states, against the
tree before the extraction: **no difference anywhere**, on the pages and on all six surfaces.

Scoping it to two addresses rather than thirteen is the part worth defending. Once the stylesheet is
byte-identical and no atomic class has moved on any of 10655 server-rendered elements, a capture of
a server-rendered element cannot find anything: same rules, same classes, same computed style. The
capture's whole remaining job was the elements the second gate is blind to, and those live on two
pages. The first two attempts at this were sized by habit rather than by that argument, and cost
twenty-five minutes of machine time for nothing.

**One thing nearly read as a regression and was the instrument.** The popover surface -- the
translator's note -- was defined in the harness but listed on no page, so it had never once been
opened; it was added before the baseline was taken. The first comparison then reported 3508
differences in the interaction states, concentrated on the table of contents. A control settled it:
two captures of _the same, unchanged tree_, differing only in whether the popover was in the page's
surface list, produce those same 3508 differences. So **a state capture is only comparable to
another taken with an identical surface list.** Each state is a delta from a rest that is
re-measured before every surface, so adding one surface moves what the states around it record. The
number is not noise -- both captures are internally deterministic -- it is the instrument having
been changed between them.

### The merge unit is the property, not the property and its condition

A conditional value is indivisible. A recipe cannot supply the condition while the component
supplies the default, because a second object carrying the same property replaces the whole value,
conditions included:

```
written out              -> xts7igz x4wkmsb
props(recipe, component) -> xts7igz
props(component, recipe) -> x4wkmsb
```

Both orders lose one and which one depends only on the order. **And all three forms emit both rules
into the stylesheet**, so the first gate passes every one of them, including the two that are wrong.
That is the case that argues for the second gate more strongly than any reasoning did.

What it rules out is a real candidate rather than a hypothetical. The reduced-motion answer --
`transition-property: none`, `duration: 0s`, `timing-function: ease` under one query -- recurs
across seven components and is a set rather than a value, which is exactly the shape this file
says to name. It cannot be named. The three declarations only travel with a default, and the nine
sites have nine different defaults.

### An omitted longhand is not its initial value when a shorthand registered it

`surfaces.ts`'s `paper` states `borderStyle: 'solid'` rather than leaving it out. The markup it
replaced wrote Tailwind's `border`, which sets the style through `--tw-border-style`, a custom
property registered with `solid` as its initial value -- so the edge computed to solid only because
that registration supplied it, not because `solid` is CSS's own default for the longhand. Leaving
`borderStyle` out here would drop the property that was doing the work and would not keep the edge
solid.
