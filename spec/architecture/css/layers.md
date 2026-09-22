# The three layers, and which of them may say a thing

Three systems write CSS for the site. Which declaration belongs where, what happens where two of
them say the same thing, and the order the three are built in are here. What the declarations
themselves say is the `styling/` directory's -- why a rail is 8.5rem is
[styling/rail.md](../../styling/rail.md), why Korean takes `word-break: keep-all` is
[styling/prose.md](../../styling/prose.md) -- and nothing here overrides a decision recorded there.

## The three layers, and the order their question is asked in

| Layer            | Called here      | Written in                              |
| ---------------- | ---------------- | --------------------------------------- |
| Svelte `<style>` | the escape hatch | the component's block                   |
| StyleX           | the vocabulary   | TypeScript                              |
| Tailwind         | the frame        | the markup, and Tailwind's lower layers |

Those names are this file's own. Two sections down, arguing about precedence, it already writes
that **the escape hatch outranks the vocabulary, which outranks the frame** -- the prose was using
a better taxonomy than the table above it, and the table now uses the prose's.

**The frame's row names two places, because the frame is four cascade layers rather than one
position.** See "The frame is a stack, and a declaration written to lose goes low in it" below.

**A declaration's layer is decided by membership, not by what kind of declaration it is.** Three
questions, asked in this order; the first one that answers, answers.

1. **Does this element carry a class in the build output?** If it does not, the declaration is the
   escape hatch. A `<strong>` the markdown compiler produced, a `<p>` inside a blockquote, a
   keyframe, a pseudo-element: none of them has a class to hang a rule on, and a class is the only
   thing the other two layers can put on an element. The answer is read off the emitted markup
   rather than argued, which is the whole of the change from the wording before it -- that one
   asked whether an author _could_ write a class, and what an author could do is decided by
   whoever felt like it. This is the one hard mechanical boundary in the arrangement, and it is
   the part the old axis already had right.
2. **Is the declaration a member of a named, reused recipe, or one of the type ramp's six
   properties?** Then it is the vocabulary. A surface is a set of declarations with a name, used
   in several places, and every declaration inside one belongs to it whether it draws a colour or
   sets a cursor. What puts a declaration there is the name it arrived under, not the subject it
   addresses. The ramp is the one exception to that sentence and it is stated as one below.
3. **Otherwise it is the frame.** A one-off on one element, taking its value from a CSS keyword or
   from Tailwind's own scale, said on the element where somebody reading the structure is already
   looking. That is the top of the frame rather than the whole of it: the frame has lower layers,
   and a declaration written to lose goes into one of those rather than into the markup.

**Question one was "can a class reach the element", and a capability is not a thing a reader can
check.** The wording let the wrong element answer -- a class reaches markdown-compiled prose on
the wrapper a component owns, and a wrapper is not the `<p>` the rule is about -- and it let the
wrong answer stand as well, because what could be written is settled by whoever felt like writing
it. Reading the class off the element settles both: the wrapper carries one, the `<p>` does not,
and neither fact is arguable.

Question one is checkable only while the compiler is disciplined about what it classes, and that
rule is [authoring.md](authoring.md)'s, "The compiler writes a class only where the element's
styling is a recipe" -- what source may emit belongs to that file.

### A new layer has to buy a new position in the cascade

A fourth layer was proposed for exactly the case above, for declarations aimed at elements this
repository does not author. The proposal was coherent and it is refused, on a test worth keeping
for the next one:

**A layer is a position in the cascade. Something that does not need a new position is asking for
a new file, and a file is not a layer.** Content styling loses to a component's own escape hatch
and beats nothing the escape hatch does not already beat, so it would have sat at the escape
hatch's position under a second name -- and two names for one position is how a reader comes to
believe there is a distinction to learn.

What the proposal was right about is that such declarations were homeless. They have a home: the
escape hatch, in the component rendering the root of the content they style. That is the answer
question one now gives.

### A layer is not a mechanism

The vocabulary is StyleX, and that is an implementation rather than a definition. **A layer may
have more than one implementation mechanism; the mechanism is chosen by the consumer, and
membership does not change with it.** A named, reused recipe past the three-component threshold is
the vocabulary whether it is written as a `stylex.create` key or by hand in a shared stylesheet.

What forces the distinction is a consumer that cannot reach StyleX. The corpus is compiled by
[compile.ts](../../../apps/site/src/lib/content/build/compile.ts), which runs from
`node apps/site/scripts/publish.ts` outside the Vite graph, so the plugin never transforms it and
it writes literal class names only. And a StyleX class name is a content hash of the property and
its value, so changing a value moves the name. The CSS ships with the site build and the HTML
carrying the names ships with the corpus publish, on its own schedule, with no moment at which
both are released together -- so those names are an interface between two artifacts rather than an
implementation detail, and an interface cannot be a hash. It has to be stable and hand-written.

**A hand-written recipe is admitted to the vocabulary on the named-and-reused test plus one of two
conditions**: either (a) at least one consumer cannot reach StyleX -- today that is the corpus
compiler and nothing else -- or (b) the recipe is relational and neither `stylex.when.*` nor the
custom-property route can express it.

**(b) is narrower than it looks.** `when.ancestor` and `when.descendant` do exist in StyleX 0.19
and compile to real selectors, at the cost of a marker class on the other end. So "StyleX cannot
express a cross-element selector" is false, and it is not a route into (b).

### The frame is a stack, and a declaration written to lose goes low in it

The built stylesheet orders its layers `properties, theme, base, components, utilities, priority1
... priority7` -- read off `apps/site/.svelte-kit/output/client/_/immutable/assets/0.*.css`. Four
of those are Tailwind's, all four sit below every StyleX layer, and `utilities` is the top of the
four rather than the whole of them. The frame is the four.

**This is not a new layer, and it buys no new position.** Those positions exist, they are already
Tailwind's, and [utilities.css](../../../apps/site/src/styles/utilities.css) already writes into
two of them -- `@layer base` for the focus backstop at the top of the file, `@layer components`
for the focus utilities below it, each under a comment arguing the position it sits in. The code
has been doing this all along and only this file had stopped naming it, which is why the section
above does not refuse this the way it refuses a fourth layer.

What the lower layers are for is the one position the vocabulary cannot express. **StyleX has no
layers between atomic classes on one element**: the winner is whichever `stylex.attrs(...)`
argument came last at that call site. So a declaration whose whole job is to be overridden has
nowhere in the vocabulary to be overridden from, and in `utilities` it would beat the thing it
exists to yield to. `base` and `components` are that position, and a declaration written to lose
goes into one of them.

### A frame declaration the markup cannot show stays in a frame stylesheet

The lower layers hold a second kind of declaration, and this one is not about the cascade at all.
**A value the markup cannot show is one the markup should not carry.** The frame's argument is that
a one-off says itself on the element a reader is already looking at -- true of a `flex` and a `gap`,
false of a `clamp()` over two custom properties or of four `:lang()` variants, which written as
arbitrary variants become a string the reader has to decompile before it says anything. Sent to the
markup such a declaration loses the one thing the move was for, so it stays in a frame stylesheet.

**It is in the frame either way.** `@layer components` is a frame position rather than an interim
one, so moving a declaration out of it and into the markup changes which frame layer it sits in and
does not move it into the frame. What decides is the value's own shape, not how many places the
class is applied: `.article-column`'s `padding-top` is a three-term `clamp()`, `.article-rail` reads
`--rail-*` values computed from each other and takes its `display` from a `@media`, and the
`:lang()` prose rules on `:is(.article-content, .article-summary)` are four language variants plus a
width query. All three stay. `.meta-language` is a single declaration that would show itself, and it
stays because the `@media` that draws the rail is the same query that moves it -- one number, one
block.

### An escape hatch lives with the element it starts from

A declaration in the escape hatch belongs to **the component that renders the root of the subtree
it styles**, not to whichever component is nearest or most convenient. A rule about markdown
prose lives with the component that renders the article body; a rule about a portalled surface
lives with the component that opens it.

A `:root` block declaring nothing but custom properties is not a layering question at all. It
belongs to [libs/tokens](../../../libs/tokens), which is where a value gets a name, and it should
not be weighed against the three questions above.

### Lowering a declaration is only safe where no surface already sets it

An element carrying a surface that sets property P cannot take its P from the frame. The surface
outranks the frame, so the frame's value is written and never rendered -- the class is on the
element, the declaration is in the stylesheet, and the effect is absent.

This was first written down about one call site, `summaryTrigger` and its `cursor`. It is not a
property of that call site. It holds for every property of every surface, and lowering anything
out of the vocabulary means first checking that no surface on the same element still claims it.

### The type ramp is vocabulary by property, and takes its value from a token

`font-size`, `line-height`, `font-weight`, `letter-spacing`, `font-family` and
`font-variant-numeric` are vocabulary wherever they appear, whether or not the declaration around
them is a named recipe, and each takes its value from [vocabulary.stylex.ts](../../../apps/site/src/lib/vocabulary.stylex.ts) rather than a
literal.

**This is an exception to the membership axis and is written as one.** The alternative was worse:
the axis's second definition said a declaration is vocabulary when its value comes from the
vocabulary file, which decides membership by how the value was spelled -- and a value is in that
file because the declaration was judged vocabulary. The circle was live, and it was what left a
repeated 1.4 line height described as vocabulary that had not been named yet. An exception stated
by property is checkable; an exception hiding inside a definition is not.

A ramp property written with a literal is unnamed vocabulary, and
[authoring.md](authoring.md), "An unnamed ramp value is marked, so it can be counted", says how the
tree's are counted rather than argued about one site at a time.

### The axis this replaces, and why this file is the argument against it

Until this rewrite the three layers were divided by what kind of declaration each owned: layout in
the markup, visual in TypeScript, the selector in the block. Layout and visual are adjectives, and
an adjective cannot be looked up. Every property nobody had thought of needed a fresh ruling, and
the rulings piled up here -- `cursor`, `pointer-events`, `user-select`, `visibility` and
`transform`, five properties settled one at a time in a file that was supposed to have settled
them all with one sentence. The rest of the arguing moved to [todo.md](../../todo/todo.md), which is now
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
wrong is a thing a list can be _caught_ at; a test that two honest readers resolve differently is
not wrong anywhere in particular.

**When the enumeration and the three questions disagree, the three questions win, and the
enumeration is corrected in the same change.** The sentence above covers a property the table never
named; this one covers a property it named wrongly, which the `white-space` miscount below shows is
a thing that happens here. It takes nothing from the table: the lookup is still the everyday answer
and still the thing a reviewer can check without having been in the argument. What is now written
down is that the table can be caught wrong, and who settles it when it is.

### What each layer owns, by name

**The escape hatch** is not a property list, because it is not a property question. Anything at all
may be written in a `<style>` block, and the only thing that puts it there is that the element
carries no class: markdown-compiled content, a `<p>` inside a blockquote, `@keyframes`,
`::selection`, vendor pseudo-elements. If the element carries a class, this layer is the wrong
answer regardless of what the declaration says.

**A selector no class can stand in for lands here too, and question one does not catch it.** The
surface Bits UI portals out of the tree carries the class
[modal.svelte](../../../apps/site/src/lib/components/modal.svelte) gave it and is styled from a
`<style>` block anyway, because the rules key off `[data-starting-style]`, a state attribute the
library sets; a child reached through its parent's `:focus-visible` is the same shape. Both are
the escape hatch by the same mechanism read from the other side.

**The vocabulary** owns every declaration that is a member of a named surface in
[surfaces.ts](../../../apps/site/src/lib/surfaces.ts) or takes its value from
[vocabulary.stylex.ts](../../../apps/site/src/lib/vocabulary.stylex.ts):

- colour, in all its spellings: `color`, `background-color`, `border-color`, `outline-color`,
  `fill`, `stroke`
- `border-radius`, `border-width`, `border-style`, `box-shadow`, `opacity`
- the four `transition-*` longhands, `animation-*` where a class can reach the element
- the type ramp: `font-size`, `line-height`, `font-weight`, `letter-spacing`, `font-family`,
  `font-variant-numeric`
- `cursor`, but only where it arrives inside a reused surface. Like `transform` below, it splits
  by site rather than by property: `surfaces.quietControl` carries one and seven files apply that
  surface, so that declaration is a member and belongs here. A `cursor` written as a
  per-component key, used once in the component that declares it, is not a member of anything and
  is the frame. **Meeting one in StyleX that is not in a surface, move it to the markup** --
  `cursor-pointer`, `cursor-zoom-in`, `cursor-not-allowed`, `cursor-default` -- and delete the
  comment beside it, which will be citing this list for the wrong half of the split. The one
  exception is not an exception to the axis but to the move: a key that _overrides_ a surface's
  own `cursor` on an element that also carries that surface cannot go down a layer, because the
  surface would then outrank it. `summaryTrigger` in
  [article.svelte](../../../apps/site/src/lib/article/article.svelte) is the only such site.

**The frame** owns the one-offs: `display` and the flex and grid properties, `gap`, `margin`,
`padding`, `width`, `height` and their `min-`/`max-` forms, `aspect-ratio`, `position` and
`inset`, `z-index`, `align-*`, `justify-*`, `overflow`, `visibility`, `pointer-events`,
`user-select`, `will-change`, `border-collapse`, and text behaviour -- `white-space`,
`text-wrap`, `overflow-wrap`, `word-break`, `line-break`, `hyphens`, `text-overflow`,
`text-align`, and the `text-decoration-*` family with `text-underline-offset`.

**These were added after the lists were checked against what the code actually uses**, which is
the only way a list like this stays a list rather than becoming a sample. The vocabulary gains
`filter`, `backdrop-filter`, `background-image` and `text-shadow`, all appearance and all of them
already inside the player's reused surfaces; `outline-style` and `outline-width`, because
splitting them from the `outline-color` already listed would run one outline across two layers;
`stroke-width` and `stroke-linecap` beside `stroke`; and `transition-behavior`, the fifth
`transition-*` longhand. `text-transform`, `scale`, `rotate` and `translate` split by site the
way `cursor` and `transform` do -- inside a surface they are members, written once they are the
frame. `will-change` is a hint about one element with no scale to consult, and
`border-collapse` is table layout belonging to no ramp.

**A shorthand is written as longhands, always.** `transition`, `animation`, `border` and
`background` each bundle properties this file assigns to different layers, so one shorthand is a
declaration in two places at once and the axis cannot answer for it. StyleX accepts only the
longhands in any case, which makes the rule free to follow and its violation a compile error on
one side and silent on the other.

**The enumeration grows by family, not by longhand.** `border-*`, `outline-*` and `transition-*`
each paid for this sentence before it was written. Splitting one longhand from its family runs one
visual thing across two layers, and which layer a reader lands in then depends on which half of the
same border or the same underline they happened to be looking at. A ruling on one longhand is a
ruling on the family, and it is written into the list that way.

**The `text-decoration-*` family is the frame, and it is where that rule was paid for a fourth
time.** The colour row above listed `text-decoration-color` while the row below rules
`text-decoration-line` the frame: one underline across two layers, which is the `white-space`
mistake inside a single property family. The three questions settle it against the list, by "The
enumeration is the rule, and the test is only how the enumeration grows" above, and the list is
corrected here -- `text-decoration-line`, `-color`, `-style` and `-thickness`, and
`text-underline-offset` with them, are the frame together. The sites agree: the one key that draws
an underline rather than suppressing one -- `label` in the support page's
[body.svelte](../../../apps/site/src/lib/home/body.svelte) -- is a per-component key used once, and
the underline rules on compiled prose are a selector's.

**A UA default suppressed is the frame, unless it is a recipe's member.** `text-decoration: none`
on a link, `list-style: none` on a list, `appearance: none` on a control, `border: 0`,
`outline: none` -- each written as its longhands, by the paragraph above. The declaration says only
"not the browser's": it takes its value from no scale, it names nothing, and there is nothing for a
recipe to hold. The exception is real and is the focus ring's own suppression, where the
`outline: none` is a member of that recipe and travels with it -- question two, reached before this
row. The two sites writing it as the shorthand are the frame by it: `textDecoration: 'none'` in
[github.svelte](../../../apps/site/src/lib/blocks/github.svelte) and
[footnotes.svelte](../../../apps/site/src/lib/article/footnotes.svelte), each a component turning
off a link's underline and belonging to no named recipe, and both are `no-underline` in the markup.
The `textDecorationLine: 'none'` keys in the blocks answer to the same row. It earns its place by
pre-deciding a class of argument rather than leaving the questions to re-decide it one suppression
at a time.

`aspect-ratio` and `text-align` are the quadrant's two additions, and each is the third question
answering rather than the first two: a class reaches the element, no recipe names the
declaration, and the value is one keyword or one ratio on one element.

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

Two things pointed at this line from opposite sides, and both were errors of the same kind:

- `font-variant-numeric: tabular-nums` was written as a Tailwind class in the markup at three
  places in [github.svelte](../../../apps/site/src/lib/blocks/github.svelte) -- a ramp member in the
  frame. Corrected: it is one `fontVariantNumeric` in that component's vocabulary now.
- `white-space: nowrap` was written in StyleX in
  [cargo.svelte](../../../apps/site/src/lib/blocks/cargo/cargo.svelte),
  [tokei.svelte](../../../apps/site/src/lib/blocks/tokei/tokei.svelte),
  [quadrant.svelte](../../../apps/site/src/lib/blocks/quadrant.svelte),
  [support.svelte](../../../apps/site/src/lib/support/support.svelte) and
  [switcher.svelte](../../../apps/site/src/lib/locale/switcher.svelte) -- text behaviour in the
  vocabulary. **This list said four and there were five**, which is the enumeration being caught
  at being wrong, exactly the way the section above says a list can be. All five have since moved
  to the markup and the `white-space` still in StyleX is a different value at every site.

They are mirror images across one line, which is the strongest evidence available that the line is
in the right place: it is the line both mistakes are mistakes about. Moving either is work for a
migration and not for this file.

### The rulings already settled, re-argued under the axis that now decides them

None of these changes answer. What changes is the reason, and the reasons were carrying the old
adjective.

- **`cursor` splits by site, and only one of its sites was the vocabulary.** The declaration
  inside `surfaces.quietControl` is a member: it travels beside that surface's colour, radius and
  transitions, the quiet control is one named thing seven files apply, and you get all of it or
  none of it. The `.quiet-control` class in `utilities.css` had already written `cursor` beside
  colour and a transition before there was any rule, which is the membership answer reached by
  instinct. Twelve other declarations were in StyleX on the same reasoning and did not earn it --
  `titleControl` and `copy` in `code-block.svelte`, `option` in `switcher.svelte`, `frame` in
  `preview.svelte`, `action` in `support.svelte`, `toggle` in `footnotes.svelte`, `anchor` in
  `section.svelte`, `entry` in `toc.svelte`, `noteClose` in `body.svelte`, `pill` and `chip` in
  `newsletter.svelte`, and `summaryTrigger` in `article.svelte` -- each a per-component key used
  once in the component that declares it. Eleven moved to the markup. The old reason -- that a
  cursor is appearance because the reader learns it by looking -- was an adjective doing the work,
  and it arrived at the right answer for one site in thirteen.
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
- **`pointer-events` and `user-select` are the frame, and this one is a reversal.** Both were
  settled as the visual layer's on the old reasoning: neither moves anything, each says what the
  element is to a pointer. Membership does not reproduce that, and the sites are what decide it.
  Sixteen StyleX sites across nine components hold one of the two, and not one of them is in a
  surface used more than once -- `pointerEvents: 'none'` alone in `home-link.svelte`'s `slot`,
  `pointerEvents: 'auto'` alone in `toc.svelte`'s `nav`, `userSelect: 'none'` alone in
  `article.svelte`'s `apparatus`. The sites that do sit beside other declarations are the ones
  worth being careful about: `tileName` in `cargo.svelte` and `indicator` in `toc.svelte` are
  named, and each is used once in the component that declares it. **A name alone is not a recipe.**
  That is the distinction `cursor` passes -- `surfaces.quietControl` is applied in seven files --
  and these two fail, and it is the only thing that ever made the three one ruling.

## The layers, and the argument for each of them

**The frame stays in the markup because structure is what the markup is.** A row that is a flex row
with a gap says so on the element, where somebody reading the structure is already looking, and
they read it without leaving the file. That is the whole argument for utilities and it is an
argument about one-offs read in place; it stops being true the moment a value is a lookup into
something the markup cannot show, which is what a colour, a type step or a radius is.

**Reading a declaration in place is a benefit of the frame where it applies, and it is not the test
for belonging to it.** The three questions send things to the frame that no amount of reading in
place explains. `.article-content`'s per-language prose policy is a lookup into
[styling/prose.md](../../styling/prose.md) -- written in the markup as
`[&:lang(ko)]:[word-break:keep-all]` it would tell a reader nothing, and the comment above it is a
pointer to a document. `.article-column`'s
`padding-top: clamp(...)` is a lookup into [styling/rail.md](../../styling/rail.md) at a single
site, where no threshold is involved at all. Both are the frame and both answer correctly, because
neither of the other two layers can hold them. **The frame is the residual layer**: a declaration
is there when no reachability problem sends it to the escape hatch and no name sends it to the
vocabulary, and the paragraph above describes the common case rather than the criterion.

This makes the document honest about the two dispositions; it does not defend how either is
written. `.article-content` was one policy spelled twice in arbitrary variants at two sites, and is
now one `:is(.article-content, .article-summary)` group in the frame stylesheet, which is the
section above answering rather than this paragraph.
**Where a declaration goes and where it belongs are different questions**, and only the first is
this file's: the three questions answer it, and nothing here answers the second. Lowering the
three-component threshold to two was the alternative and it is refused, because it swaps one count
for another and the criterion survives the swap -- the line moves until the case that exposed it
falls on the other side, and `.article-column` at one site is reached by no count at all.

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
nothing changed.

### `utilities.css` is dissolved, not given a position

It was left open whether the file should be layered or taken apart, on the reasoning that giving
it a layer is also choosing what it is a layer of. The layering half is settled: **every rule in
it belongs to a layer that already exists, so the file is given no layer of its own.** Taking it
apart no longer follows from that. "The frame is a stack, and a declaration written to lose goes
low in it" above makes `base` and `components` two positions this file itself opens, so "a layer
that already exists" stopped meaning a layer somewhere else, and the dispositions below confirm
it: the `.focus-ring` family, the rail geometry and the per-language prose each belong to an
existing layer and stay in it. **Dissolving the file needs a ground the axis never supplied**, and
three are open: that it is a grab-bag of four unrelated things, which is a filing objection rather
than a layering one; that nothing about `base` and `components` requires this stylesheet to open
them, since any stylesheet can; and "A new layer has to buy a new position in the cascade" above,
which says the number of files is not a layering question in either direction. None is taken here.

The file holds four unrelated things. Named recipes past the three-component threshold -- the
`.focus-link` family, `.spring-underline`, `.article-link`, `.jump-target` -- are the vocabulary,
and go to [surfaces.ts](../../../apps/site/src/lib/surfaces.ts). **Four of those
names do not go, and the reason is the interface rather than convenience**: `focus-link`,
`spring-underline`, `article-link` and `jump-target` are written onto compiled prose by
[compile.ts](../../../apps/site/src/lib/content/build/compile.ts), which the corpus publish runs
outside the Vite graph and on its own schedule. They stay hand-written recipes in a shared
stylesheet and they are still the vocabulary -- "A layer is not a mechanism" above, condition (a).
That does not give the file back a position: a stylesheet carrying four vocabulary recipes is a
carrier, and a file is not a layer. Which stylesheet carries them is not settled here.
One-off classes
applied in a single place -- `.article-rail`, `.article-column`, `.meta-language` -- are the
frame, and stay in the `@layer components` they are already written in, by "A frame declaration the
markup cannot show stays in a frame stylesheet" above. The `.focus-ring` family, the `.focus-input` family and
`.article-content` each have a section below, because the first disposition of each was wrong. The two `:root` blocks, about 3.3KB, are tokens and never
were a layering question.

**`.selectable` goes to the markup as well, and it was never a layering question either.** It is a
hand-written copy of a utility: one declaration in two spellings, at five sites, where Tailwind's
`select-*` already emit both -- the built sheet carries
`.select-none{-webkit-user-select:none;user-select:none}`, and `select-text` emits exactly what
`.selectable` does. **A name alone is not a recipe** -- this file's own sentence, and the one that
ruled twelve of thirteen `cursor` sites the frame -- settles it: the enumeration was right to hold
`user-select` in the frame, and the paragraph above naming `.selectable` as the vocabulary's was
wrong. Deleting it raises the declaration rather than lowering it -- `.selectable` sits in
`components` and `select-text` in `utilities`. If the name carried anything past the utility it was
"this is a sentence a reader may quote" against `select-text`'s "do this", and that meaning is a
comment's rather than a class name's.

The counts this paragraph carried are gone rather than refreshed. They were doing the deciding,
which is the mistake the next two sections are about, and one of them was counting the wrong
thing: `.value` was listed at eighteen sites and the class is written once, on the span in
[counter.svelte](../../../apps/site/src/lib/components/counter.svelte). `.value`, `.value-cell`,
`.pill` and `.pill-metrics` are also [app.css](../../../apps/site/src/styles/app.css)'s, not
this file's, and they travel with it: `.value-cell`'s `font-family`, `font-size` and
`font-variant-numeric` are ramp members wherever they appear and go to the vocabulary, the rest
of it to the markup.

**Layering the file first is an interim step, and it is not behaviour-preserving.** Twenty of
its rule blocks sit outside every layer and therefore outrank the vocabulary unconditionally,
which is a silent wrong answer and the one a partial port walks into -- a rule moved to StyleX
loses to whatever of its block is still unlayered here, and nothing reports it. Putting them in a
layer below the escape hatch makes the order predictable while the rules move one group at a time.
What the wrapper costs is three elements that render differently the moment those rules are inside
any layer StyleX's are declared after:
`.spring-underline`'s `transition` shorthand stops beating the StyleX `transition-*` on
[newsletter.svelte](../../../apps/site/src/lib/newsletter/newsletter.svelte):481 and
[offer.svelte](../../../apps/site/src/lib/error/offer.svelte):65, and the `.focus-input-shell`
border at newsletter.svelte:345 stops beating `surfaces.paper`. Expect those three rather than
find them. Nothing about the step justifies keeping the file.

### A `@property` registration stays outside every layer, and the migration has to leave it there

Nineteen of the twenty unlayered rule blocks in
[utilities.css](../../../apps/site/src/styles/utilities.css) went into `@layer components`. The
twentieth is a `@property` registration, and it is at the top level on purpose.

**Tailwind writes its pre-`@property` fallback only for the registrations it finds at the top
level** -- the `@layer properties` block, guarded by `@supports`, that hands each registered
custom property its initial value to a browser too old to register one. A registration nested in a
layer is dropped from that block, and nothing else about it changes: it compiles, it reaches the
emitted stylesheet, and the animation it feeds still runs.

**That is what makes the move dangerous rather than merely wrong.** A registration has no cascade
interaction with the rules around it, so folding it into a layer looks free, and tidying it in is
the obvious next edit. Three of the four things a reader would check say it is fine. The fourth is
one missing declaration inside an `@supports` block, on the browsers between this site's floor and
`@property`'s own -- see [compat.md](../../compat.md), "The syntax floor is set to the same line,
deliberately". Nothing mechanical catches it, so the comment at the registration and this rule are
the whole of what stands in the way.

### `.focus-input` stays in the escape hatch, because a surface already owns the border

The family went to the frame on its application count: three rules used in one place, which is
the shape of a one-off. The count is not the question.
`.focus-input-shell:has(.focus-input:focus)` sets `border-color` on the newsletter's pill, and
that pill carries `surfaces.paper`, which sets `border-color` unconditionally. Tailwind's
`utilities` layer sits below StyleX's `priority1` through `priority7` -- read off the built
stylesheet, and asserted by [css-layers.ts](../../../apps/site/scripts/css-layers.ts) -- so the
frame can express the `:has()` condition and still never render it. The escape hatch in
[newsletter.svelte](../../../apps/site/src/lib/newsletter/newsletter.svelte) is the only layer
that wins, and the family goes there whole rather than splitting over the one rule that fails.

**The wrong reason was "few enough application sites to be frame-shaped".** The right question is
the one this file already asks under "Lowering a declaration is only safe where no surface
already sets it": does anything above the target layer already declare that property on that
element. It is worth recording because a count is the answer a reader reaches for again -- it is
quick, it is visible in the markup, and it is about the class rather than about the cascade.

### The `.focus-ring` family does not split, and stays in the Tailwind layers it already sits in

The threshold sent the family to the vocabulary. Worked through rule by rule, none of it goes.

Two of its five rules can be reached by a class and both are written to lose.
`:where(.focus-ring, .focus-ring-inner, .focus-ring-within)` sets a `0.25rem` fallback corner, and
the rule below it states the ring's colour at rest; each zeroes its own specificity with `:where()`
and each sits in `components`, low in the frame's stack. The corner is live rather than dead --
across the thirty-eight elements wearing one of the three classes it draws at fourteen, the
section glyph, the rail's text ring, the card thumbnail and eleven player glyphs, none of which
declares a radius, and it yields wherever the element's own surface or utility declares one. In
the vocabulary it would have no position to yield from, and a call site passing `surfaces.*`
first would start drawing a 0.25rem corner on a pill. It stays where it is, by the rule above.

The other three rules are reached through a relationship no class can express: a child selected
through its parent's `:focus-visible`, a parent selected through `:has()` on a descendant, and
both again under an `html[data-focus-source]` ancestor. The one declaration among them a class
could reach, `.focus-ring:focus-visible`'s outline, shares its block with three selectors that
cannot, so lifting it would write the same outline twice and leave the rest standing. There is no
genuinely shared appearance left over to move, so nothing does.

**The colour rule names `.focus-link` and `.focus-link-inner` too**, and the question of which half
of it travels presupposed a split. There is none. The declaration is a member of the ring's recipe
and a recipe migrates whole -- every declaration belonging to a surface belongs to it, whether it
paints a colour or sets a cursor. Its reason for existing is to sit beside the ring: it states the
colour at rest so that Tailwind's `transition-colors`, which nearly every control here carries,
cannot fade the ring in from the element's own text colour. A declaration whose whole job is to
defend against a frame utility, filed anywhere but beside the ring, is one the next reader deletes
as redundant.

**The `:where()` is not the evidence it looks like**, and this is the part that will be got wrong
again. Zero specificity is how this implementation gives itself no weight; it is not a sign that a
declaration is a backstop belonging to `components`. Membership is decided first and form second --
the zero-specificity test places a declaration _within_ the frame, once the three questions have
already ruled it the frame.

### `.article-content` is the frame, and question one was answered by the wrong element

The disposition read escape hatch because the rules reach markdown-compiled prose. They do not
reach it by selector. Every one of the seven properties is inherited and all seven are declared
on the wrapper -- a `<div>` [body.svelte](../../../apps/site/src/lib/article/body.svelte)
authors and already classes with `space-y-4` -- while `.article-summary` is a `<p>`
[article.svelte](../../../apps/site/src/lib/article/article.svelte) authors outright. An author
of each of those elements can write a class on it, so question one does not answer; two call
sites is short of the three-component threshold, so question two does not either. Question three
answers, and nothing above declares any of the seven on either element. The shape is unpleasant
-- six languages across three `:lang()` blocks and a width query, over two class names -- and
unpleasant is not an answer the three questions take. That shape is also what keeps the group in
the frame stylesheet rather than sending it to the markup, by "A frame declaration the markup
cannot show stays in a frame stylesheet" above.

The opening no longer cites `.article-content` as question one's worked example. It does not
survive this section: both elements carry a class, so the observable test answers the way this
section does. The point the opening was making is carried by the compiled `<strong>` instead.

## The distribution cost is known, and accepted

Both of the global layers are global sheets. A one-off pushed to the frame joins Tailwind's, a
recipe pushed to the vocabulary joins StyleX's, and the escape hatch is the only layer a bundler
splits per route. So the axis trades total bytes against first-load bytes on the lightest pages,
and it is worth saying which way each moved.

Total CSS fell, 88,486 bytes raw against 92,033 before. The licenses page's first load rose from
9,855 to 13,411 bytes gzipped, about 36 per cent; an article page was roughly flat, because an
article carries enough of both sheets to have been paying already.

**This is accepted rather than unnoticed.** The alternative is extracting per-route subsets from
two sheets neither vendor splits, which means maintaining a bundler plugin -- far more than the
bytes are worth. The other direction, growing the escape hatch because it happens to split, is
the axis running backwards for a reason that has nothing to do with where a declaration belongs.

What it gets instead is a number somebody watches: `mise run check-css` fails when first-load CSS
for a route category passes a recorded budget, so a regression here is a failing check rather
than a page that feels slow. Raising a budget is a deliberate edit, which is the point of
recording it.

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
			lightningcssOptions: { minify: true },
		}),
		enforce: undefined,
	},
];
```

This snippet used to spell the call `stylex.vite(...)`, and that is a correction: there is no such
member. The plugin is the default export of `@stylexjs/unplugin/vite` and is called directly. The
order the snippet has always illustrated is the order the file has.

`lightningcssOptions` is the price of that order, paid back. Appending last also means appending
after Vite's minify pass, so this layer shipped its indentation and its newlines while everything
above it had none -- 10,610 bytes of the 52,310 the page carried. The plugin already runs Lightning
CSS over its own sheet on the way out, without asking it to compress; the option asks. Measured,
the sheet drops to 7,661 bytes and its rules are unchanged: minifying the old output again produces
the new output byte for byte. Nothing about the order moves, which is the whole reason it is done
here rather than in a pass of our own after the plugin.

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
