# The shape of the workspace

## What this repository is

web is one project of several and its own repository, cloned into the workspace's `repos/` as a
sibling of the others. It holds the site, its status page, the local service that edits it, the
corpus they serve, and the libraries those share. Nothing else, and the absences are as
much of the description as the contents: there is no `.editorconfig`, no `rustfmt.toml`, no
`.oxlintrc.json`, no agent hook and no `AGENTS.md` anywhere below this root -- nor a `CLAUDE.md`,
which would stop Claude Code reading the workspace's `AGENTS.md`. Every one of those
exists once, one directory up, and is found by walking up from wherever a tool starts -- so a file
here is formatted, linted and checked by configuration it carries no copy of. The toolchain works
the same way: node, rust, pnpm, jj and oxlint are declared in the workspace's `[tools]`, and this
repository's `mise.toml` adds only `rclone`, the one tool nothing above it needs.

Which questions that arrangement settles -- where a rule lives, why nothing is a submodule, why a
project cloned on its own has no formatter, why work begins above rather than here -- belongs to
the workspace's `AGENTS.md` and its `architecture/repos.md`. Cited by name rather than linked: a
relative path across the repository boundary resolves only while this project happens to be
nested, and a name reads correctly either way.

**This section is a correction.** It used to open "one folder holding most of what its owner
writes, across every language", which described the arrangement that was abandoned -- one project
at the root with the rest nested inside it -- and stopped being true when this project was demoted
to a sibling. The layout block below was corrected first; this rested on the same premise and was
left standing.

What was true in it, and stays, is the half that never needed the folder to hold everything.
**Source-level reuse is the point inside this repository.** A library under `libs/` is consumed by
this repository's own applications without being built or published first, which is what
"Libraries export source" below is arguing; publishing is something a library earns after it
stabilizes, not a precondition for a second consumer here. What it is not is an argument for
keeping unrelated projects in one tree, and it never was.

The word "workspace" in this file's title is the pnpm and Cargo one -- `pnpm-workspace.yaml` and
the `[workspace]` in `Cargo.toml` at this root, which is what makes `libs/` and `apps/` resolve to
each other. The directory above is a different thing wearing the same word.

## What this repository marks as machine output

The rule is the workspace's `spec/architecture/repos.md`, "Machine output is marked, so the
language statistics describe the repository".

`libs/fonts/src/*.css` was, measured on 2026-10-05, 8782 lines of `@font-face` rules and unicode-ranges against a few
hundred lines of stylesheet anybody wrote. `data/record/metadata.json` is written by `local
image`, and `diagram.json` beside it by the model calls that describe each diagram; `data/build/`
holds what a build derives; Drizzle writes its own snapshots. Each is tracked because a build
reads it with nothing else present -- a record, not source. See [data.md](data.md), "What stays in
git, and until when".

The fonts are a glob rather than a list of families: adding a font is three steps and coming back
to `.gitattributes` is not one anybody would remember.

**Every other file stays counted.** `apps/site/src/styles/`, `libs/prose/src/prose.css` and the
rest are decisions somebody made and should weigh what they weigh. The mark is for output, not for
files that are merely long; a file that is long and owed a split is marked `lines=deferred`
instead, which the line check reports and passes.

A generator writing code also opens it with `@generated` in its first five lines -- `fonts`
here, and the platform's `urls` and `scopes`, do -- which rustfmt and the comment check read, and a reader opening the file
sees before editing it.

A generated file over the hard limit that nobody marked fails the line check, which is how this
list found one of its own entries pointing at a path the file had left. One under the limit goes
on being counted and nothing fails; see [../issues/tooling.md](../issues/tooling.md).

## Layout

```
spec/       Rules, this project's own. Entered from the workspace's AGENTS.md one directory
            up; this repository deliberately carries none of its own.
libs/       Libraries, any language.
apps/       Deployable things, any language.
contents/   Articles. Tracked, because prose is revised and wants diffs.
data/       Assets and the records describing them. Bytes stay out of git; records go in.
```

Two lines of that block are a correction. They used to say `spec/` was indexed by a `CLAUDE.md`
here and to name a `repos/` directory below it, which described the earlier arrangement -- one
project at the root with the rest nested inside it. That was abandoned: this project is one
cloned into the workspace's own `repos/`, a sibling of the others, and `repos/` and the entry
point both belong one directory up.

The repositories the system is split into, and which way each leans, are the workspace's `spec/architecture/layers.md`.

Which of `data/` git keeps, and what happens to an asset once it is stored, are their own
subjects: [data.md](data.md), [media.md](media.md), [video/](video/),
[fonts.md](fonts.md) and platform's `spec/architecture/delivery.md`.

## One name, one thing

A directory under `libs/` is a namespace, not a language choice. `libs/collection` is the collection
-- whether that is a Cargo crate, a TypeScript package, or a Rust core with a TypeScript
wrapper around it is an implementation detail living inside.

This is what makes the cross-language plan work: a library whose core is Rust compiled to
wasm and whose surface is TypeScript is still one directory with one name. Splitting
libraries by language at the top level would tear that library in half.

The same applies to `apps/`. A Rust binary and a SvelteKit site sit side by side, named for
what they do. What a member may be called is the workspace's `naming.md`'s.

How the command line and the HTTP surface divide one application between them is its own
subject: [local.md](local.md).

## The editor is configured by reading the site, not by working it out again

**When `apps/cms` will not render something the way the site does, the answer is in
`apps/site`.** Both are SvelteKit over the same components, and every time the editor has been
wrong so far the site already held the fix: the StyleX sheet arrives in development through a
link and a runtime module rather than an import, `@canmi/prose` has to be aliased to its source
or a workspace package is compiled as a legacy component, and a Tailwind utility written beside
StyleX needs the consumer to run Tailwind. None of those is discoverable from the failure --
each one renders something that is merely wrong rather than something that errors.

Copying is the right instinct here and not a shortcut, because the two are converging. The
account system is what lets the editor stop being a second origin; after it, these become one
router rather than two, and configuration that already agrees is configuration that does not
have to be reconciled. See [../todo/milestones.md](../todo/milestones.md), D3 and D4.

So: read the site's `vite.config.ts`, `app.html` and `styles/app.css`
before deciding the editor needs something of its own. What genuinely differs is worth a
comment saying which of the two this one is and why.

## Libraries export source

A TypeScript library's `exports` point at `./src/*.ts`, not at a built `dist/`. There is no
build step, no `dist/`, and no `prepare` script to run before the repo works.

This is the whole point of the repo. A library that must be built before it can be used is a
library with a publishing ritual attached, and that ritual is exactly what stops code from
accumulating. Consumers here are bundlers -- Vite, the Workers runtime, esbuild -- and they
compile TypeScript directly.

The constraint: this holds only while every consumer bundles. A consumer that runs raw
Node against the package would need a build. If that day comes, add the build to that one
library rather than reinstating it everywhere.

## A package here has no version

Nothing in this repository is published as a package, so nothing here has a version to state: a
`package.json` carries no `version` field, and a crate says `0.0.0` because Cargo wants the key. A
number that moved would claim releases that never happen, and one that sat at `0.1.0` would claim
one that did.

## Web interface primitives

Bits UI is the site's headless behavior layer. It owns the difficult, reusable interaction
contracts -- focus management, keyboard navigation, dismissal and floating placement -- while
the site's tokens and local classes continue to own site-only visible decisions. Which system
writes which of those is [css/](css/).
Importing a styled component kit on top would create a second design system, so project primitives
under `apps/site/src/lib/components/` expose the small set of surfaces the site alone repeats.

A visible primitive repeated by both the public site and CMS belongs to
`@canmi/ui/primitives`. Both applications consume it directly;
neither becomes the other's template, and extracting it must leave the established consumer
visually unchanged. Two real consumers justify that boundary. A single speculative component does
not, because opening a package per primitive turns reuse into directory ceremony rather than a
coherent shared vocabulary.

**Where a shared piece is filed is part of what it says.** The framed picture -- format
fallbacks, `srcset`, the placeholder, the crop, the border -- was already shared by the article's
`::image` block and the link card's cover, and it sat in `blocks/` beside both of them. Nothing
was duplicated and the graph still read wrong: a reader opening `link-card.svelte` found it
importing `image.svelte`, one block reaching sideways for another, and could not tell from the
tree which of the two was the layer. It is `components/picture.svelte` now, and both blocks import
downward.

Nothing was extracted to do it, because there was nothing left to extract. The layer existed; it
was the filing that hid it. The counterpart is the rule above: had it _not_ already been shared,
moving it first would have been the guess this threshold exists to prevent.

Feature directories compose those primitives and keep their own state, copy and specialized
styling. A locale picker, for example, imports the shared menu surface but owns language order,
selection and navigation itself. A primitive is added for a real repeated interaction, not to
predict a future component catalog; unused Button or Input wrappers are not architecture.

Use a primitive where the interaction is conventional and accessibility-heavy, such as a
menu or popover. Do not force data visualization through it: Cargo and Tokei deliberately keep
one specialized tooltip for hundreds of SVG regions rather than instantiating a general
component per region. Headless is a boundary for shared behavior, not a requirement that
every interactive pixel come from the same package.

The visual language stays independent of that boundary. Interface chrome is neutral paper,
a quiet one-pixel border, compact type and a small shadow only on floating surfaces; color is
reserved for focus, state and data. A categorical chart may be colorful, but its controls,
tooltips and surrounding statistics use the same surfaces as the rest of the site.

## `app.html` carries no comments

Comment freely everywhere else. This one file is a template rather than source: nothing compiles
it, and everything in it that is not a placeholder is copied verbatim into the page template
string and emitted on every response. A comment written there is not a note to the next reader of
the code, it is two lines of markup served to every visitor for the life of the site, tabs
included.

Verified rather than assumed. A comment removed from it was found intact in the built server
bundle, `.svelte-kit/output/server/chunks/internal.js`, with its indentation and newlines
preserved -- inside the template string, not beside it.

So an explanation that wants to be near the shell goes where the behavior it explains lives: the
component whose head emits the tag, the library the value comes from, or this file. What cannot
happen is the explanation shipping to readers who did not ask for it.

## Where volatile facts live

Directory structure is the skeleton: expensive to change, so it may only carry stable facts.
Which domain an app answers on is not stable. That mapping belongs in a typed map in a
library, where changing it is a one-line edit instead of a rename plus every import plus the
workspace globs.

### Colors are declared once, in the kit

The rule for URLs is the workspace's `spec/addresses.md`, "Every URL is declared once".
Colors follow the same shape at a smaller scale: OKLCH values are declared in
`@canmi/kit/tokens` and consumed by name. The rule covers the design system that the site's own UI
and theme are built from; a palette mirrored from an external convention keeps whatever
format that convention ships.

Names there are roles the page fills or hues it holds, never the component that first wanted
one. `--color-note-paper` is the shape to avoid: it makes the palette an inventory of features,
so the second component needing that blue either inherits a name describing something it is not
or copies the value. A hue named as a hue -- `--color-blue`, `--color-blue-ink` -- is a pigment
any surface can pick up, and what a blue box _means_ stays a decision the component makes.

The qualifier on a hue names how it is laid down, borrowing the vocabulary the neutrals already
use: `paper` is a surface, `ink` is a mark. Not how dark it is. A name like `-deep` reads as a
promise about lightness that the dark block then breaks, since a page that inverts needs its
marks to move the other way; `ink` stays true in both because a mark is a mark under either
light.

### A card pointing inside the corpus carries no copy of its own

`::article{path=...}` draws the card the homepage lists, for an article in this repository. It
takes only the path: title, subtitle and date are read off the article it names, never written
into the directive. `::linkcard` is the opposite and stays that way, because what it points at
is outside the corpus and there is nothing to read.

The rule is the URL rule one level up. A title is a volatile fact with one home, and a card that
repeated it would be a second copy that only disagrees -- silently, since a stale title still
renders and still links to the right page. It also gets each locale its own translated title for
free, which a written-in one could never have: the directive is one line and a view is one of
nine.

The cost is that the site's content build runs
[two passes](../../libs/compile/src/articles.ts): every view's frontmatter is
read before anything compiles, because the compiler sees one article at a time while a card
names another. A path no article answers to fails the build rather than degrading to a
placeholder -- unlike an embed, nothing has to be fetched first, so an unresolved path is a typo
and there is no working state it could be mistaken for.

Resolving instead at request time, out of the article index, was the cheaper change and is
rejected on what it cannot reach: the feed and `/llms.txt` are strings baked at compile time, so
a card there would have been a bare path where every other link is a name.

`robots.txt` follows the same shared-base shape, from `@canmi/me/robots`: a common definition every
host shares, and each repository's own hosts declared on top of it -- disallowed paths, sitemaps,
each one's note -- so each owns its additions while a change to the shared policy reaches all of
them at once. It is a subpath of its own beside the addresses, because generating a file is not the
same job as mapping URLs, even though it consumes them. See [robots.md](robots.md).
