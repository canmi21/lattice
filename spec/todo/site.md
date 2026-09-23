# Deferred: the site

What the site does that it should not, or does not do that it should. Routing, rendering, the article page, and the tests that cannot reach them.

The rules over an entry are the index's; see [todo.md](todo.md).

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

## The licence surface is eight addresses and one baked record

`/licenses`, `/licenses/{spdx}`, `/licenses/pkgs`, `/licenses/pkgs/{registry}`,
`/licenses/pkgs/{registry}/{package}`, `/licenses/{registry}/{name}@{version}.txt`,
`/licenses/full.txt` and `/licenses.txt` are eight public addresses across thirteen route files.
Nothing else this site serves spends that much of its URL space on one subject, and the subject is
a dependency list.

Behind them, the `virtual-licenses` plugin in [vite.config.ts](../../apps/site/vite.config.ts) bakes
`data/build/licenses.json` into the server bundle. Measured on a production build: 482KB raw and
71.7KB gzipped, the largest chunk the Worker carries after the corpus itself -- ahead of
`index-server.js` at 40.6KB and `surfaces.js` at 36.5KB. Only the metadata travels; the licence
texts are already published objects the CDN serves.

What makes it a finding rather than a preference is that the record sits on the wrong side of a
line this repository is in the middle of drawing. It is derived from the lockfile by a pure
function, so nothing is lost by regenerating it, which is the test that sends a generated record
out of git and into R2. It is also the only such record with a consumer at request time. So the
classification reaches it, and the answer it gives -- publish it as an artifact and fetch it like
any other -- is an answer about a surface nobody has decided to keep.

**One piece has already been taken, and it was the expensive one.** The surface had an OpenGraph
card per licence, per registry and per package, in each of the nine views: 6804 files and 518 MiB,
87% of everything the bucket held. Those are gone and the routes are not -- see
[architecture/media.md](../architecture/media.md), "The licence routes have no card". It narrows
nothing about the addresses; it stops an undecided surface from being the largest thing published.

**What deciding it would cost.** The intent is two or three addresses rather than eight, and which
ones is open: a single page carrying the directory inline, or a page plus the text endpoints that
exist for machines rather than readers. Whatever survives decides what the record has to be, which
is why it is held out of the move rather than carried through it and rebuilt afterwards. The cost
of waiting is that `data/build/licenses.json` stays in git while every other pure derivation
leaves; the cost of not waiting is migrating a payload onto a surface that is about to lose most
of it.

## The site's non-page routes are SvelteKit's, and every other worker's are hono's

`apps/api` and `apps/cdn` are hono. `apps/site` is not, and it serves eight `+server.ts` routes
plus a handle that answers `<url>.md` before the router sees it:

| Route                                                           | Answers                                     |
| --------------------------------------------------------------- | ------------------------------------------- |
| `/atom.xml`                                                     | the assembled feed                          |
| `/sitemap.xml`                                                  | the assembled sitemap                       |
| `/llms.txt`                                                     | the assembled index                         |
| `/robots.txt`                                                   | a constant                                  |
| `/{key}.txt`                                                    | the IndexNow key                            |
| `/licenses.txt`, `/licenses/full.txt`, `/licenses/{...package}` | licence text                                |
| `<url>.md`                                                      | an article's source, from `hooks.server.ts` |

The intent is that a page stays SvelteKit's and everything else becomes one hono app mounted
inside it, so that every non-HTML response this project serves is written the same way: one
router, one `failure` helper, one place a cache header is decided. Today the site answers those
questions in eight files and a handle, none of which share the helpers `apps/api` and `apps/cdn`
already have.

**What has to be decided before it can be done.** Where the hono app is mounted -- a catch-all
`+server.ts` forwarding `event.request`, or `handle` in `hooks.server.ts` ahead of the router --
and the two differ in what they can reach. Hono would not have `event.fetch`, which is what makes
a same-origin subrequest work in SSR and what `$lib/published` takes as an argument, so that has
to be passed in rather than imported. `<url>.md` is the awkward one: it is a suffix on every
page's path rather than a route, so it is the case that decides whether the mount point can be a
route at all. And whether the licence text routes survive the surface decision above is open, so
there is no reason to move them first.

## The resolution path on the site has no tests, because the site's modules do not resolve under vitest

`apps/site/src/lib/published/` is where a rid becomes a record: the batch question, the split at
what one request carries, the memo, and the two cache windows that decide what is stored after a
miss and after an outage. Nothing in it is covered. Every test under `apps/site` imports by
relative path and none touches `$lib` or `$app`, and that is not a convention -- the root
`vitest.config.ts` declares no alias for either, so a test that imported `$lib/published` would
fail to resolve before an assertion ran.

The behaviour was verified by execution rather than by assertion while this was written: driving
`publishedResources` against a recording fetch under a throwaway config shows one question for a
page, a rid the corpus does not publish stored and not asked for again, nothing stored at all when
the API cannot be reached, and a 65-rid page split into 64 and 1 rather than refused. Each of those
was confirmed to fail when the behaviour behind it was removed. None of it is committed.

**What deciding it would cost.** Three aliases -- `$app/environment`, `$lib`, and a stub for
`@tanstack/svelte-query`, which publishes `.svelte` source that Node cannot load. The first two are
a line each. The third is the decision: either a stub module that every test in the workspace would
then resolve to, or `@sveltejs/vite-plugin-svelte` in the root config, which pulls the site's whole
Svelte pipeline into `apps/cdn`'s test run as well. Neither is a change to make as a side effect of
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
white sheet and becomes a grey one on a lighter page, along with every card and the light hover
feedback. Giving the head a border instead of a ground was not built; it changes what the block is
rather than which colour it takes, so it belongs to whoever decides the table's shape.

Deciding it costs a token pair. A band that must always recede needs two values of its own that do
not mirror -- roughly 0.962 and 1.000 in light, 0.157 and 0.213 in dark, which is the existing pair
with the two themes crossed over. That is a fourth and fifth entry in a palette whose argument is
that it has one home for a colour, and it is worth spending only if a second band turns up. So far
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
`libs/artifacts` and to both ends that read it; and a measuring layer chosen from the three above.
The threshold is a constant in whichever layer measures, and the table above is what it should be
argued from. The language half stays as it is: English opts in, every other language keeps one
answer per article until somebody measures it.
