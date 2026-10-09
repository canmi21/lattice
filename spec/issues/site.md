# Deferred: the site

What the site does that it should not, or does not do that it should. Routing, rendering, the article page, and the tests that cannot reach them.

The rules over an entry are the index's; see [issues.md](issues.md).

## A total function answers for input it does not know, and is wrong instead of failing

[`extension::for_variant`](../../apps/local/src/extension.rs) maps a mime type to the extension a
stored file is named by. It returns `&'static str` rather than an option, and its own doc says
why: "Total rather than optional: the encoder only ever produces these, and anything unrecognised
is AVIF because that is what the ladder stores." That was true of a repository storing one kind of
asset. It stopped being true when video landed, and the function did not change, because nothing
about its signature could tell it had.

**What it does with a mime it does not know is answer `avif`.** So `for_variant("video/mp4")` is
`"avif"`, and a caller that hands it a clip's variant gets back a path under `image/` with an
extension nothing ever wrote. The failure has no error to surface and no branch to test: the
function cannot fail, so the caller cannot check, so the wrong path flows to `is_file()`, which
answers false, which reads as "this asset is not published yet".

It has already produced one bug of exactly that shape. `published()` in
[`image/run.rs`](../../apps/local/src/image/run.rs) was written as
`variant_path(public, cid, extension::for_variant(&record.mime)).is_file()`, which is correct for
every picture. Copied into the video command unchanged -- the natural thing to do, because it
reads as a general question about a record -- it asks whether `{ab}/{cd}/{cid}.avif` exists for a
rung that lives at `{ab}/{cd}/{cid}.mp4`, one tree and one id apart only by extension. It answers
false on every run, and the
command re-encodes a clip that is already on disk. Nothing raises, nothing logs, and the only
symptom is that a run which should be a no-op takes minutes.

The shape is what invites this rather than any one call site. A function that takes a mime and
cannot fail reads as a function that knows every mime, so it gets called on mimes it does not
know, and the answer it gives is indistinguishable from an answer it does know. The separate
`for_icon` beside it is `Option`-returning for a reason its own doc gives -- a `Content-Type` from
a server nobody controls -- and the two sit in one file disagreeing about whether an unknown type
is a value or a question.

**What deciding it would cost.** The narrow reading is that `for_variant` is named for an image
variant and video should never have reached it, so the fix is at the call sites and the function
is fine. The wider reading is that a total function over an open input set is the defect, and
`for_variant` should return `Option<&'static str>` with the AVIF default moved to the one caller
that wants it -- which is every image path, so the change is small in edits and large in what it
asserts. Both readings leave a picture, a rung and a track needing a mime-to-extension answer
each, and there is no longer a tree in the key to tell them apart -- the extension is the whole of
it. Neither is worth doing while the video commands are still landing, because the call sites are
what would move.

## The homepage lists every article, and will not be able to for long

`+page.svelte` renders one card per article the API answers with, and the API answers with all of
them. Six today. The intent is a fold -- five, or thereabouts -- and a route carrying the rest,
and none of that is decided: whether the fold is a count or a date, whether the full list is
paginated or one page, whether it has its own card and its own place in the sitemap, and what a
reader on a phone sees instead of a hover.

It is written down here because two things already built assume the list is short and will quietly
stop being right. The homepage warms every article it lists on a device with no pointer, which is
sound for six and wasteful for sixty; and the read-count batcher carries up to 24 keys, which is a
number chosen against today's list rather than against anything. Both follow whatever the fold
turns out to be, so neither is worth changing before it is decided.

## The license surface is eight addresses and one baked record

`/licenses`, `/licenses/{spdx}`, `/licenses/pkgs`, `/licenses/pkgs/{registry}`,
`/licenses/pkgs/{registry}/{package}`, `/licenses/{registry}/{name}@{version}.txt`,
`/licenses/full.txt` and `/licenses.txt` are eight public addresses across thirteen route files.
Nothing else this site serves spends that much of its URL space on one subject, and the subject is
a dependency list.

Behind them, the `virtual-licenses` plugin in [vite.config.ts](../../apps/site/vite.config.ts) bakes
`data/build/licenses.json` into the server bundle. Measured on a production build: 482KB raw and
71.7KB gzipped, the largest chunk the Worker carries after the corpus itself -- ahead of
`index-server.js` at 40.6KB and `surfaces.js` at 36.5KB. Only the metadata travels; the license
texts are already published objects the CDN serves.

What makes it a finding rather than a preference is that the record sits on the wrong side of a
line this repository is in the middle of drawing. It is derived from the lockfile by a pure
function, so nothing is lost by regenerating it, which is the test that sends a generated record
out of git and into R2. It is also the only such record with a consumer at request time. So the
classification reaches it, and the answer it gives -- publish it as an artifact and fetch it like
any other -- is an answer about a surface nobody has decided to keep.

**One piece has already been taken, and it was the expensive one.** The surface had an OpenGraph
card per license, per registry and per package, in each of the nine views: 6804 files and 518 MiB,
87% of everything the bucket held. Those are gone and the routes are not -- see
[architecture/media.md](../architecture/media.md), "The license routes have no card". It narrows
nothing about the addresses; it stops an undecided surface from being the largest thing published.

**The direction is set and waits on the platform.** The surface leaves the site: its routes take
another form, and the page becomes a shared one that `apps/landing` serves, which depends on the
platform's hosts being built first -- see the workspace's `spec/issues.md` for the layer in front of
every page it may sit behind. What stays open is the shape the addresses take.

**What deciding it would cost.** The intent is two or three addresses rather than eight, and which
ones is open: a single page carrying the directory inline, or a page plus the text endpoints that
exist for machines rather than readers. Whatever survives decides what the record has to be, which
is why it is held out of the move rather than carried through it and rebuilt afterwards. The cost
of waiting is that `data/build/licenses.json` stays in git while every other pure derivation
leaves; the cost of not waiting is migrating a payload onto a surface that is about to lose most
of it.

## The site's non-page routes are SvelteKit's, and every other worker's are hono's

`apps/site/api` is hono, as the platform's Workers are. `apps/site` is not, and it serves thirteen `+server.ts`
routes, measured on 2026-10-05, plus a handle that answers `<url>.md` before the router sees it:

| Route                                                           | Answers                                     |
| --------------------------------------------------------------- | ------------------------------------------- |
| `/atom.xml`                                                     | the assembled feed                          |
| `/sitemap.xml`                                                  | the assembled sitemap                       |
| `/llms.txt`, `/llms-full.txt`                                   | the assembled index, and every agent view   |
| `/sitemap.xsl`                                                  | the sitemap's stylesheet                    |
| `/site.webmanifest`                                             | the install manifest                        |
| `/favicon.ico`                                                  | the site's mark, followed for the browser   |
| `/.well-known/security.txt`                                     | the security contact                        |
| `/robots.txt`                                                   | a constant                                  |
| `/{key}.txt`                                                    | the IndexNow key                            |
| `/licenses.txt`, `/licenses/full.txt`, `/licenses/{...package}` | license text                                |
| `<url>.md`                                                      | an article's source, from `hooks.server.ts` |

The intent is that a page stays SvelteKit's and everything else becomes one hono app mounted
inside it, so that every non-HTML response this project serves is written the same way: one
router, one `failure` helper, one place a cache header is decided. Today the site answers those
questions in thirteen files and a handle, none of which share the helpers `apps/site/api`
already has.

**What has to be decided before it can be done.** Where the hono app is mounted -- a catch-all
`+server.ts` forwarding `event.request`, or `handle` in `hooks.server.ts` ahead of the router --
and the two differ in what they can reach. Hono would not have `event.fetch`, which is what makes
a same-origin subrequest work in SSR and what `$lib/published` takes as an argument, so that has
to be passed in rather than imported. `<url>.md` is the awkward one: it is a suffix on every
page's path rather than a route, so it is the case that decides whether the mount point can be a
route at all. And whether the license text routes survive the surface decision above is open, so
there is no reason to move them first.

## The resolution path on the site has no tests, because the site's modules do not resolve under vitest

`apps/site/src/lib/published/` is where a rid becomes a record: the batch question, the split at
what one request carries, the memo, and the two cache windows that decide what is stored after a
miss and after an outage. Nothing in it is covered. Every test under `apps/site` imports by
relative path and none touches `$lib` or `$app`, and that is not a convention -- the root
`vitest.config.ts` declares no alias for either, so a test that imported `$lib/published` would
fail to resolve before an assertion ran.

The behavior was verified by execution rather than by assertion while this was written: driving
`publishedResources` against a recording fetch under a throwaway config shows one question for a
page, a rid the corpus does not publish stored and not asked for again, nothing stored at all when
the API cannot be reached, and a 65-rid page split into 64 and 1 rather than refused. Each of those
was confirmed to fail when the behavior behind it was removed. None of it is committed.

**What deciding it would cost.** Three aliases -- `$app/environment`, `$lib`, and a stub for
`@tanstack/svelte-query`, which publishes `.svelte` source that Node cannot load. The first two are
a line each. The third is the decision: either a stub module that every test in the workspace would
then resolve to, or `@sveltejs/vite-plugin-svelte` in the root config, which pulls the site's whole
Svelte pipeline into the root test run as well. Neither is a change to make as a side effect of
a task about batching.

## An article written in English is told it has no English version

Open `/hindsight/except-me` or `/convention/forecast-tense` in the English interface and the
translation notice reads "No English version of this article yet. What is shown is English (US)".
Both carry `lang: en`, so the sentence contradicts itself in the one place a reader sees.

It is not in the server's markup -- `grep translation-notice` over either response returns
nothing -- so it arrives at hydration, from `article.svelte`'s
`{#if locale.code !== 'mw'}` around the notice. That test asks whether the reader is looking at a
non-default locale; it never asks whether the article's own `lang` already is that locale. For a
corpus written mostly in Chinese the two questions had the same answer, and the first article in
English made them differ.

The fix is a condition, not a message: the notice belongs where the view's locale differs from
`meta.lang`, which the component already receives as `sourceLanguage`. Worth checking at the same
time what the notice should say on a `lang: en` article viewed in Chinese, since that is the
mirror case and nothing has exercised it either.

## A table head wants a ground that stays the darker one in both themes

A Markdown table draws two grounds, and the reading the head is supposed to carry is a band set
behind its rows. That only happens while the head is the deeper of the two, and the palette cannot
promise it -- [styling/surfaces.md](../styling/surfaces.md), "A mirrored pair cannot keep one of its
members the darker one". With head `paper` the band is right in dark and inverted in light; with
head `paper-hover` it is right in light and inverted in dark. The current assignment is the second,
chosen by looking at both and preferring the light half, not by an argument that settles it.

Three repairs were tried against the running site and each one is a trade rather than a fix.
Swapping the component's two tokens, which is what the current assignment is, moves the inversion
from light to dark rather than removing it. Swapping the palette's
two light values makes both tables right and costs the homepage thumbnail, which stops being a
white sheet and becomes a gray one on a lighter page, along with every card and the light hover
feedback. Giving the head a border instead of a ground was not built; it changes what the block is
rather than which color it takes, so it belongs to whoever decides the table's shape.

Deciding it costs a token pair. A band that must always recede needs two values of its own that do
not mirror -- roughly 0.962 and 1.000 in light, 0.157 and 0.213 in dark, which is the existing pair
with the two themes crossed over. That is a fourth and fifth entry in a palette whose argument is
that it has one home for a color, and it is worth spending only if a second band turns up. So far
the table is the only one.

## A wrap policy is one decision per language, and the paragraph is where it is wanted

[styling/prose.md](../styling/prose.md) settles where a line ends per language and per column width,
and both halves hold. What it has no way to say is that one paragraph wants a different answer from
the one beside it, and that is the case English keeps producing: a two-line paragraph whose second
line carries three words. Measured on `convention/forecast-tense` at the 672px column, five of its
twelve multi-line paragraphs end on a line holding between 16% and 32% of the column; the whole
article is nineteen paragraphs and thirty-four lines, so the shape is most of what a reader sees.

`text-wrap: pretty` does not reach this. Measured over that article it scores identically to the
browser's default -- same lines, same stranded finals -- because rescuing a three-word final line
means loosening the line above it, and that is the trade `pretty` declines. `balance` is the
property that makes the earlier lines shorter, and applied to the whole article it costs what
prose.md already says it costs: the mean gap on non-final lines goes 3.1% to 24.3% and eleven of
twenty-two lines stand more than an eighth short.

**Applied per paragraph instead, the same property costs about half.** Marking only the paragraphs
whose final line falls under a threshold, measured on `architecture/compile-time-rendering` --
forty-nine paragraphs, 224 lines, no extra lines at any setting:

| threshold      | marked | short finals | mean gap | loose lines |
| -------------- | ------ | ------------ | -------- | ----------- |
| none, as it is | 0      | 8            | 2.0%     | 0           |
| 15%            | 3      | 5            | 3.2%     | 10          |
| 20%            | 4      | 4            | 3.6%     | 13          |
| 30%            | 6      | 2            | 4.2%     | 21          |
| 40%            | 8      | 2            | 4.7%     | 26          |
| whole article  | 49     | 2            | 7.9%     | 40          |

Two paragraphs survive every threshold because Chromium stops balancing past six lines; the two
are eleven lines and eight. A system that marks paragraphs should not mark those -- the declaration
would be inert and the marking would lie about what the page does.

**The rule cannot be written in CSS, and that is the whole shape of the problem.** A selector
cannot ask how long a line came out, so something that can see the layout has to decide, and only
then does CSS execute the answer under a policy name. Three places could decide. The browser, with
the `measured()` mechanism [styling/first-paint.md](../styling/first-paint.md) already uses for the
table of contents rail -- exact at any width, at the price of a first frame that reflows and of
JavaScript in the reading path. The compile step, laying the text out with the real font at the one
column width that is fixed -- exact only if its line breaking agrees with the browser's, and unable
to say anything about the narrow column, whose width is the device's. Or a character count, which
was measured and is not viable: predicting from characters per line picked two of four paragraphs
on the short article and three of eight on the long one, with seventeen false positives.

That the fixed column and the per-paragraph decision share a boundary is not a coincidence. A
paragraph can only be judged where the column is a known number, which is `--rail-column` and
above -- exactly where `pretty` already lives.

What deciding it costs: a named policy per language, which is the shape prose.md already has; an
optional per-paragraph override in the compiled article, which is a change to the block contract in
`@monoflake/sdk/artifacts` and to both ends that read it; and a measuring layer chosen from the three above.
The threshold is a constant in whichever layer measures, and the table above is what it should be
argued from. The language half stays as it is: English opts in, every other language keeps one
answer per article until somebody measures it.

## A list on the page has no marker and no indent

Measured on the preview of a draft holding one, 2026-09-24: `ul` and `ol` compute `list-style-type:
none` with no padding, so a list reads as lines of plain text -- Tailwind's reset takes the markers
away and nothing in [prose-root.svelte](../../libs/prose/src/prose-root.svelte) puts them back. No
article has used a list yet, which is why nobody saw it. The CMS's editor draws a list as its source
until this is decided, rather than inventing a look the page does not have.

**What deciding it would cost.** A rule for `ul`, `ol` and `li` beside the blockquote's in the
prose root, which the editor then draws to match: the marker, the indent, the space between items.

## The crate chart's tiles are links with no text

The `cargo` block ([cargo.svelte](../../libs/prose/src/blocks/cargo/cargo.svelte)) draws each
dependency as a tile, and every tile is an `<a>` to crates.io whose name is only an `aria-label`;
the words drawn on a tile sit outside it. Measured on the live
`development/rust-cargo-cranelift-tuning`, 2026-10-01: 254 of the page's 301 links carry no text,
every one of them a tile. To anything that reads a link's text -- a crawler, a translator, an answer
engine -- they are links with no name, and to a keyboard each is a stop of its own. Open; the
approach is the author's to decide.

## A page's markdown is its source in every language

The markdown a page serves -- at `.md`, or at the page to a reader asking for markdown -- is the
source, in the source's language, with a line saying so and where the asked language is as HTML.
The translations exist only as compiled HTML; a markdown view per locale would let an answer engine
read the asked language as markdown too. See [architecture/markdown.md](../architecture/markdown.md).

## The markdown target keeps both halves of a width pair

A `:t[...]{wide}` and its `:t[...]{narrow}` twin are one sentence drawn two ways, and the page shows
one. The compiler's markdown target writes both, so the homepage's view reads "I hope somedaySomeday
I hope" -- live at `/homepage.md`, 2026-10-01. Fixing it changes the published markdown, so it waits
for the corpus to be published again.

## A section has no page, for a person or an agent

An article's agent view says where it sits as the homepage, then its section as plain text, because
there is no section page to link -- for people or for agents. A section page comes to both at once;
an agent-only one would be a page people cannot see. See
[architecture/markdown.md](../architecture/markdown.md).

## The author has no entity home yet

The author's structured-data identifier is `https://canmi.net/about#person`, chosen as the page
that will say first-hand who the author is -- see
[architecture/entities.md](../architecture/entities.md). That page does not exist, so the identifier
does not resolve. **`/about` is therefore a fixed address**: when it is built it is a
`ProfilePage` whose `mainEntity` is that person, the person's full node moves there, and every other
page keeps only the reference. Nothing else may take the path. The same page is where `article:author` and
`<link rel="author">` point once it exists.

## The structured graph stops at what today's data says

Each of these waits on data or a page that does not exist yet; the graph grows by the same rules
when it does. See [architecture/entities.md](../architecture/entities.md).

- **The home page as a `CollectionPage`**, its articles as `hasPart`, once the home page is decided
  to be the list it is.
- **What an article is about**: `about` and `mentions` naming Wikidata entities rather than strings,
  which needs a record mapping each tag to its item; the author's `knowsAbout` follows from the same
  record.
- **A project as two entities**: the running service as `WebApplication` and the code as
  `SoftwareSourceCode` with `codeRepository` and `programmingLanguage`, once a page shows projects.
  Something that fits no narrower type -- hardware, an experiment -- is a `CreativeWork`.
- **The status page's checks as `Service` nodes** in an `ItemList`, each identified by an anchor on
  its row, which the page does not have yet; `about` from the page, never `status` on the service.
- **`TechArticle.proficiencyLevel` and `dependencies`**, when the author states them in an
  article's frontmatter.

## An application has no way to stand apart from the infrastructure it is built on

The gateway gives the service layer one place for its hosts, its files and its rules. The
application layer -- the site, the status page -- has none: each answers its own robots, its own
security.txt, its own canonical and its own mirrors by calling the libraries, and nothing says
which of its concerns are its own and which it only borrows from the platform.

**Undecided: what separates an application from the infrastructure**, so that the questions only
an application asks -- which of two hosts a page is indexed under, what a page's title is -- stay
with it, and none of the platform's leaks into it.

## OpenPanel reports an anchor followed on the site as a view of its own

It records the hash in the path, so one article read through its table of contents counts as
several views. Whether to rewrite its events or leave it until the site keeps one service is
undecided; the arrangement it concerns is [../analytics.md](../analytics.md).

## What can be selected is decided by the page around a component, not by the component

The console's three rules -- chrome is not selectable, a control never is, what a reader would quote
is -- are [../console/design.md](../console/design.md), "What can be selected", and the site follows
none of them yet. It sets `select-none` in three places only: the home page's `<main>`
(`apps/site/src/routes/+page.svelte:147`), the article rail (`libs/prose/src/shell.svelte:50`) and
the article's meta row (`apps/site/src/lib/article/article.svelte:435`). Everything else inherits
from those or from nothing, so the answer for one component depends on the page it lands on: the
home page turns selection off and reopens fourteen sentences one at a time, the article page leaves
all of it on but the rail and the row, and the licenses and error pages do nothing. Measured on
2026-10-08 by reading the markup and its ancestors.

**What deciding it would cost.** Each control carrying its own rule, as the console's do, instead of
a page deciding for everything under it; the entries below are the departures that one change would
close, and each is worth a browser check after it.

## A portalled surface escapes every page's choice of what can be selected

Bits UI portals the search dialog, the modals, the translator-note popover and the menus to
`<body>`, outside any `<main>`, so the home page's `select-none` reaches none of them:
`apps/site/src/lib/search/dialog.svelte`, `apps/site/src/lib/components/modal.svelte:92-121`,
`libs/prose/src/body.svelte:360-370`, `apps/site/src/lib/components/menu-content.svelte:48`. Their
controls -- the result rows, a modal's close button, the popover's -- are selectable on every page,
while the same kind of control on the home page is not.

**What deciding it would cost.** Rules on the portalled surfaces themselves, since no ancestor of
theirs is the page's.

## The search dialog's keycaps can be selected

The `kbd` hints in the dialog's footer (`apps/site/src/lib/search/dialog.svelte:462-471`) and its
result buttons (`:418`) are selectable, the plainest break of "a control never is": a drag across
the hint row takes `↑↓ move ↵ open esc close` as text. The group titles (`:~405`) are a judgment
call, a title a reader might quote.

**What deciding it would cost.** `select-none` on the hint row and the rows, kept off the group
titles if they count as quotable.

## The article page's controls can be selected

Outside the rail nothing on the article page is `select-none`, so its controls are text to a drag:
the code block's copy button and collapsible title row
(`libs/prose/src/blocks/code-block.svelte:361`, `:435`), the footnotes' fold toggle with its "Show N
more" (`apps/site/src/lib/article/footnotes.svelte:364`), the heading anchor
(`libs/prose/src/anchor-button.svelte:66`), the action bar holding reading progress and the theme
toggle (`libs/prose/src/action-bar.svelte:39`), and the video player's control bar, settings menu
and time readout (`libs/prose/src/components/video-chrome.svelte`, `video-controls.svelte:672`,
`video-settings.svelte:243-300`).

**What deciding it would cost.** A rule per control; the action bar and the player's bar are chrome
as well as controls, so `select-none` at their roots.

## The licenses and error pages' chrome can be selected

The licenses pages' breadcrumb navs (`apps/site/src/routes/licenses/+page.svelte:137`,
`licenses/[license]/+page.svelte:88`, `licenses/pkgs/+page.svelte:99`,
`licenses/pkgs/[registry]/+page.svelte:85`,
`licenses/pkgs/[registry]/[...package]/+page.svelte:200`) and their action rows (`:193`, `:109`,
`:103`, `:235`) carry no `select-none`, where the article's equivalent rail does; the error page's
report button drawn as a link inside a sentence (`apps/site/src/lib/error/offer.svelte:77`) is
selectable too.

**What deciding it would cost.** `select-none` on those navs and rows; the inline button is a
control inside prose, the case most worth deciding explicitly.

## A card's date cannot be selected, while the article's own date can

The home list's card leaves its `<time>` unselectable on purpose
(`libs/prose/src/card.svelte:79-91`, its comment says so), while the article page reopens the same
date with `select-text` (`apps/site/src/lib/article/article.svelte:440`). A date is something a
reader quotes, so one of the two is wrong, and the comment's reason has to be weighed against that.
The meta row's word and read counts (`article.svelte:441-466`) are unselectable, which the rules are
silent on.

**What deciding it would cost.** Which way the card goes, and whether counts are quotable.

## A field under the home page's `select-none` may not take typing in Safari

The newsletter's email input sits under the home `<main>`'s `select-none` with nothing reopening it
(`apps/site/src/lib/newsletter/newsletter.svelte`, near `:400`). WebKit has been known to let an
ancestor's `-webkit-user-select: none` stop an input from taking a caret; not tested here, so this
is inferred, and the rule that a field's text is always selectable assumes it is not so.

**What deciding it would cost.** A check in Safari, then `select-text` on fields under a
`select-none` ancestor if it fails.

## The user-select entry in the CSS issues describes CSS that is now a class

[css.md](css.md), "The gate compares a list, and a list is not a test", records `.article-rail,
.meta { user-select: none }` moving into the visual layer; both are now Tailwind's `select-none` in
the markup (`libs/prose/src/shell.svelte:50`, `apps/site/src/lib/article/article.svelte:435`), so
the entry describes a state the code no longer has. Its point -- that the migration's snapshot does
not compare `user-select` -- still stands.

**What deciding it would cost.** Rewriting that entry against the code as it is, or closing it if
the point moves to where the selectability rule lands.
