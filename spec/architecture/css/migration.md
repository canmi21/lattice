# One stylesheet per route, and what moving a component proves

How the site's CSS is emitted per route, and what the migration gate does and does not establish
about a component that has been moved into the three layers. What those layers are is
[layers.md](layers.md).

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
entry in [todo.md](../../todo.md), for the site rather than per component.

The two are worth separating because mixing them destroys the only signal available. If a migration
is allowed to improve as it goes, a visual regression and an intended improvement arrive in the same
diff and look alike, and the reviewer's question stops being "did this change anything" and becomes
"is every change here one somebody meant". The first question a machine can answer.

So the gate on a migrated component is a **per-element diff of computed style and geometry**, taken
before and after, with the `class` attribute excluded because class names are exactly what is
supposed to change. An empty diff is the pass. A non-empty diff is not a failure but an obligation:
every entry is explained or reverted.

Findings about layering that the migration is not allowed to fix go to
[todo.md](../../todo.md), with the evidence, one entry each.

### What the gate answered

It was run once, at the end, over the whole migration rather than per component: the pre-migration
tree captured whole, the migrated tree captured whole, and the two compared element by element.
The baseline is the dependency-raise commit, deliberately, because `node_modules` already matches
it and nothing but the CSS differs between the two trees.

Both captures are 390 page snapshots -- thirteen addresses, five widths, two themes, three locales
-- and 1010 interaction states. Each snapshot holds every element under `<body>` keyed by a
structural path of tag names and sibling indices, which is what lets the two trees line up when the
only thing that changed is the class attribute. Around 152 thousand elements per capture, ninety-
eight computed properties each, plus geometry to half a pixel.

**The whole migration moved one value, on three elements, by eight thousandths of a pixel.** The
support section's three action controls read `border-radius: 9999px` before and `9999.01px` after.
Nothing else on the site differs: not a colour, not a length, not a font, not a geometry, in any
theme, at any width, in any locale, at rest or hovered or focused or with a menu open.

The cause is precision, not the migration. The declared value is `624.9375rem`, which is seven
significant digits, and the visual layer's stylesheet prints six: it emits `624.938rem`, which is
9999.008 pixels. A neighbouring `3.0625rem` in the same sheet keeps all of its digits, so this is a
limit on significant figures rather than on decimals, and only one value on the site has seven.

**It has no rendered consequence, and that is a fact about CSS rather than an opinion about
smallness.** A border radius larger than half its box is scaled down until it fits, so both 9999px
and 9999.01px land on the same stadium. The gate reports it because the gate reads computed style,
which is the right place to read: a difference invisible today on a small control would not stay
invisible if the control grew.

**What it costs to have this answer is worth stating.** Two full captures at roughly seventy
minutes each, one dev server restart between them with every route warmed, and a working copy moved
to the old commit and back. Nothing about it is per-component and nothing about it is cheap enough
to run on every edit, which is why the only permanent test this arrangement leaves behind is the
one holding the layer order.

### Coverage is counted in components, not in URLs

The corpus renders every block component somewhere, and the smallest set of addresses that reaches
all of them is ten: four articles, the homepage and the four licence route shapes, plus one article
that carries almost no blocks as a control on the article shell itself. `observation-to-lowering`
alone carries the quadrant, the Mermaid fences, the author's notes, the spoilers, the in-corpus card
and the blockquotes; `rust-cargo-cranelift-tuning` carries the images, the link card, the repository
card, the Cargo widget and Tokei; `friends-come-in-phases` is the only article with a tweet.

Two dimensions are not optional. **A translated view renders components the source view has none
of** -- the translation notice, and a translator's note, which appears in no `.md` file because it
lives in a sidecar. And the widths that matter are the ones [styling/rail.md](../../styling/rail.md)
already identifies as behaviour boundaries rather than a round number picked here.

### What the gate cannot see

**It runs Chrome.** The floors in [compat.md](../../compat.md) are Firefox 115 and Safari 16, and this
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
in [layers.md](layers.md) -- which already says of its own lists that the lists are examples
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
