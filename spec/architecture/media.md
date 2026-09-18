# Images and the records that describe them

## Variants stop where the layout does

An image is published at 640, 1280 and 1920 on its long edge, and no further. Nothing on the
site renders wider, so pixels above the cap are weight every reader pays for and nobody sees.
An original below the cap is its own top rung; upscaling is never done.

`cms image --original` adds one more rung at the original resolution for the images where the
detail is the point -- a photograph rather than a screenshot of some text. It is still AVIF
and still lossy, so "original" means the full frame rather than the original file. The choice
is recorded in the manifest rather than inferred, because re-deriving has to reproduce what
was published, and comparing the top variant against the source would guess wrong for every
image that sits below the cap, where the two are the same size for an unrelated reason.

## A description belongs to the image

Alt text is held in the manifest, on the asset, not on the reference. It describes the
picture, and the picture is the same picture wherever it appears -- so one description written
once is inherited by every reference, including the ones written years later. An article that
needs different wording for its own context overrides it; nothing else has to say anything.

`cms alt` fills them by handing the work to a local agent CLI rather than to an API. The
default is `gpt-5.6-terra-medium` through Codex. How each runner is shown the file is
in [i18n/runners.md](../i18n/runners.md). There is no API request to assemble and no key to hold.

The framing in the prompt is the instruction that matters. "Describe this image" produces a
caption -- a label naming the subject. Asking for what someone who cannot see it would need
produces what is actually useful: what kind of image it is, what it contains, and what it is
evidence of. `--limit` exists because each call costs real money, and finding out the prompt
is wrong should be cheap.

## Where a picture came from is a claim, and it can point inward

`source` sits beside the description in `data/record/media.yaml`, holding a `url` and an English `label`.
It is there rather than in the manifest for the reason that separates the two files: nothing here
can be rebuilt. EXIF describes what a sensor did and a screenshot of a web page has none; a picture
that has been through an editor carries nothing true about its origin either. So a source is a
claim somebody makes, and `cms image --force` must not be able to take it away.

**The label names the origin, not the route.** An `web.archive.org` address for a page Apple
published is labelled Apple: the Internet Archive is how the page can still be read, not who wrote
it. Crediting the library for the book is the mistake the rule exists to prevent.

**The label is the name the origin publishes under, verbatim, in the language it publishes in
first.** It is recorded rather than composed, so the workspace rule that file content is English
does not reach it -- and this field is what produced that exception; see the workspace
`spec/voice.md`. The reason first written here was "English, because a publication is called the
same thing in every language this site is written in", which holds for Apple and fails for the
Chinese sitcom one of these clips is cut from, whose English title is a distributor's rendering and
not its name. Rendering a proper noun does not make the file more English, it makes the record less
true, and the record is the whole reason the field exists.

One string rather than the per-locale map a description carries, for the same reason: a name is not
translated, so one spelling serves every language the page is read in. An origin leading in two
languages is taken at the one it leads with, never at the one the reader happens to speak. The
description of the thing is still English and still translated like any other description.

**A source can name something inside this repository, as `cid://{blake3}`.** A video's poster frame
came from the video, and that is as real a provenance as a URL. The asset id and not a variant's:
the frame came from the picture, not from the 1080p rendition of it, and a rung's id can change
when a ladder does. No extension either -- an extension is how a request asks for one
representation, and the CDN treats it as exactly that, so putting one here would say the frame came
from the mp4 rather than from the video.

**`label` is omitted when the scheme is `cid://`.** The target can be resolved and named by the
system, and a hand-typed name for something the system already knows is a name nothing checks.
Following the reference reaches the target's own source, so a poster's provenance resolves through
its video to whoever published it, without the outer name being retyped and without the two ever
disagreeing.

## The description is baked in beside the placeholder

The build inlines an image's description the same way it inlines its thumbhash: both belong to
the picture, both come from the manifest, and neither should be repeated in the article that
happens to reference it. An article written before any description existed picks one up on the
next build, without being edited.

Writing `alt` overrides it for one page's context. The two syntaxes differ in what they can
express, and the difference is real: markdown has no way to say "decorative", so `![](x)`
parses to an empty alt meaning unwritten and nothing else. A directive can say it, so
`::image{alt=""}` is a decision and is left alone. A linkcard's cover is decorative by
construction -- the title it illustrates is right beside it.

## A link's name says where it goes; everything else is a description

Everything inside an anchor becomes part of the link's accessible name, so what goes there is
a budget rather than a place to be thorough. A linkcard's cover keeps `alt=""` even though a
description exists for it: an 800-character alt would make the link announce the whole
screenshot before saying its destination, and a reader tabbing through links would sit through
that every time.

The description is offered through `aria-describedby` instead, from an element outside the
anchor. A screen reader announces it after the name and lets the reader skip it, so the
content is available without being in the way. Inside the anchor it would join the very name
it is meant to follow.

The name itself has to carry what the visuals carry. A card's title never said which site it
led to -- the favicon did, and that is `aria-hidden` -- so the domain is added there, along
with the new-tab warning that `:link` directives already emit. That last one was an
inconsistency rather than a new decision.

## Where a photograph was taken is worked out offline

`cms image` reads EXIF once at import, because the original may not be on hand later and the
published variants carry none of it -- a reader downloads pixels and nothing else. Nothing in
that block is trusted about the _file_: EXIF describes what the sensor did, and one sample
reports 4032x3024 for a frame that is 4032x2268 on disk. Dimensions and ratio come from
decoding. Orientation is the exception and must be read, or every derived image comes out
turned.

The address is the one part not in the file. It is looked up from the coordinates against
GeoNames' `cities500` in `data/source/geo`, indexed into an R-tree, with the timezone from the
polygon the point actually falls in rather than from the nearest town. Offline deliberately: a
geocoding service would make importing a photograph depend on somebody else's uptime, rate
limit and terms, for a fact that never changes once written.

The county comes from the admin2 code the settlement already carries, and the postal code from
a second index of GeoNames' postal points -- found by position and then checked against the
country, because a code is not unique on its own: 27707 is a district of Eumseong and also a
part of Durham.

`district` stays absent. Naming a neighbourhood needs the full GeoNames dump, an order of
magnitude larger than everything else here put together, and deriving one from the nearest
town would state something no source claimed.

Building the postal index costs about fourteen seconds for 1.8 million points. It happens once
per run, which a batch import absorbs and a single import does not, and that is the trade for
never asking anyone.

HEIC decodes through a pure-Rust decoder rather than bindings to libheif. It is HEVC inside a
HEIF container -- the same container AVIF uses, with a different codec, so support for one
says nothing about the other. A system library would be a thing to install on this machine and
again in CI; 249ms for a 4032x2268 frame is nothing against the AV1 encode that follows. Only
the primary image is taken. A phone's HEIC may also hold a depth map, a gain map and the
frames of a live photo, and none of those are wanted yet.

## A category is closed; a tag is not

Five categories -- photograph, screenshot, diagram, document, artwork -- and a distinction that
can be drawn with a tag never earns a sixth. A terminal capture, a browser capture and an
editor capture are all screenshots, and letting each become a kind of its own would grow that
list once for every application that exists. The category says what sort of thing it is; tags
say what is in it.

Tags are raw identifiers: lower case, digits, hyphens. Each identifies one concept without
needing an image to explain it, so an ambiguous word gets qualified -- `cellular-network`, not
`cellular`; `mold-linker` names the product while `mold` names fungal growth. The constraint is
the point -- `TypeScript`, `typescript` and `type-script` would otherwise be three tags for one
thing, and one `mold` for two things would make a correct translation impossible.

What a reader sees lives in `data/record/tags.yaml`. A technical name has one official display form
and is never translated. An ordinary name records a disambiguated English source label, a
short semantic meaning, and its translated display forms. Its `en-US` form comes from the same
vision answer that creates the tag and retains that answer's provenance. The meaning is not
copy: it is the stable contract that lets both the tagging model and the translator decide
which concept the identifier denotes. See [i18n/copy.md](../i18n/copy.md) for how those labels are
translated and cased.

Both answers come from one request, because they are one look at one picture. Asking
separately would pay twice for the same glance and let the two disagree; a `screenshot` tagged
`landscape` is a contradiction only a second request can produce.

The existing tags go into the prompt with their kind, label and meaning, and images are
classified one at a time rather than in parallel. A raw list cannot say whether `mold` is a
linker or fungus, while a model shown nothing invents `terminal-window` beside `terminal` and
`cli` beside both. Four running at once would each name the same thing before any could see the
others.

A malformed tag is dropped, never repaired. Turning `shell terminal` into `shell-terminal`
invents a name nobody chose, which then competes with `terminal` forever.

## A card is named by its slug, and that is the exception

Every other published asset is named by a hash of its bytes. An OpenGraph card is not:
`cms og` writes `opengraph/{slug}.png`, mirroring the article tree, and the page emits that
URL from its own route. Nothing stores a reference, so there is nothing to rewrite and no id
to look up -- the address follows from where the article sits.

The cost is that the name is mutable, and the cache rule already prices it: no hash means a
week rather than a year, which is also what X caches a card for. An edited title takes that
long to circulate, and that is the accepted trade rather than an oversight.

**A card is rendered once per view, and asked for by `?lang=`.** A page served in Japanese that
advertises a Chinese card is telling a reader one thing and a crawler another, so the nine
views each get their own card, with the title and subtitle the sidecar already holds for that
locale. The address is the page's own slug plus the same `?lang=` that selects the page --
`/opengraph/{slug}.png?lang=ja` -- while the bytes are stored under `opengraph/{view}/{slug}.png`.
That is the key-is-not-the-URL rule again: one parameter names what the reader wants and the
worker decides where to read from.

**The home card is a different card, not an article card with the site's name in it.** An
article card answers "what does this page say"; the home card answers "whose site is this", so
it keeps the same three bands and puts a different thing in each: the site name at the top, the
portrait with the author's name and role in the middle, and what there is to read in the
bottom-right -- the corner an article card uses for its date and category, chosen there because
the bottom-left belongs to X. Two cards that share a grammar read as one site; two that share a
template read as one card with a field swapped.

The name and role come from `site.config.yaml`, which is where the page reads them from, and
are not translated: a name is a name, and the job title is one of the things this site leaves
in English. The counts beside them are worded by the same message catalogs the pages use, so a
card and a page never phrase the same fact differently.

**The article page draws the same number, from the same function.** It used to compute its own:
`view.text` with the whitespace removed, in characters. `view.text` is every readable string on
the page -- the prose, but also each picture's description, each linkcard's title, each diagram's
caption, each embedded post -- so a 9,102-character article reported 14,870, and 38% of what it
claimed was components rather than writing. Those are not the article. What counts is body prose
and what is inside it: inline code and quotations stay, because they are in the sentence.

The count is recorded by `cms segments` into `data/build/segments.json`, which the site build
already requires and already reads per article, and the site reads it rather than counting. One
rule, one implementation. A second one in TypeScript is exactly how the page and the card came to
disagree, and what a word is across scripts is not obvious enough to be worth answering twice.

**The count is words, in a word processor's sense, and the definition is borrowed rather than
invented.** Han and kana count once per character, everything else once per whitespace-delimited
run, and the two are summed -- which is what Word, WPS and Google Docs all report and what 字数
means in Chinese. The rule this replaced was characters, on the argument that a word is not a unit
CJK has. That argument is true and the conclusion drawn from it was not: counting characters does
not remove the mismatch, it moves it. Measured over this corpus a character was worth 1.23 units
in a Chinese article and 4.78 in an English one, so the number quietly favoured whichever articles
happened to be in English by nearly four to one.

**Each view counts what that view serves.** The old rule counted the source text for all nine
cards, on the argument that the number describes the site rather than the translation being read.
That holds only while the unit is script-blind. Once it is words, an English card carrying a
Chinese article's 字数 is stating something false about the text an English reader would actually
get -- so a view counts its own translation where there is one and the source where there is not,
which is exactly what the page renders.

**The ninth view is recorded honestly and the card overrides it, and those are different
questions.** `mw` serves the source article, so that is what it is counted from: for one article
the hybrid is coherent, and a reader of that page sees exactly those words. The home card is where
it breaks, because the card sums every article -- five in Chinese and one in English added
together is Han characters plus English words, not a quantity of anything -- and `mw` is also the
card a bare link resolves to, the default social card for the site. So that one card carries the
English figure instead, because `mw.json` is English copy and "N words" written in English has to
mean English words. The two move together: translating that catalogue means changing which view's
figure the source card prints.

**Prose only, and only what a visitor can open.** A code block is not writing, and neither is a
directive or a thematic break; what separates them is decided once by `segment::Kind::translatable`,
which already answers that question for the translator, so the count reads it rather than stripping
markdown a second time and drifting from it. Frontmatter is left out -- a title is metadata here.
Drafts are left out too, because `buildArticles` excludes them from a production build and
advertising writing nobody can open is a lie in the other direction. Before all three fixes the
card said 8 articles and 141,344 characters; after them it said 6 and, in English, 23k words at
the time.

The counting itself is the `words-count` crate's rather than this repository's, chosen by
running five candidates against one table of cases instead of reading their descriptions --
which are identical, while their answers are not. The one thing added on top is that Hangul is
not Han: Korean is written with spaces, so a word processor counts it like Latin, and the
crate's `is_cjk` disagrees. See `apps/cms/src/words.rs`, where the table is the specification
and the rejected candidates are argued.

The address is drawn opposite the site name across the top, because the other free corner is
the bottom-left and that one belongs to X. It lives in `site.config.yaml` rather than in
`libs/urls`, and the distinction is real: what is drawn there is a label a person reads off a
picture, not an address anything resolves. The exemption only holds while the two agree, so a
test compares it against the host `libs/urls` declares -- nothing structural can, since one is
read by Rust and the other by the bundler.

The portrait is fetched into `data/` once, like the font and for the same reason: it is bytes
somebody else serves, and a local command should not need the network to draw a card. A clone
without it still renders every card, with that one lacking a portrait rather than the command
refusing to run.

**A draft gets no card, and a card nothing asks for is deleted.** A draft has no production URL
for a card to be the picture of, and a card is a public object -- rendered, deployed to the CDN,
and fetchable by anyone who guesses the path -- so drawing one publishes a piece nobody decided to
publish. `cms og` skips drafts on the same flag [i18n/segments.md](../i18n/segments.md) uses to keep them out of the
paid sweeps.

Skipping alone would have left the pictures behind. The card record was already rebuilt rather
than merged, so it forgets a card that is no longer produced, but the file stayed on disk and
deployed anyway -- nine of them per article that becomes a draft, is renamed, or is deleted. The
sweep is driven by that record rather than by walking `data/public`, which is what keeps it from
being a second garbage collector: it can only remove a file this command wrote and named, and a
key it cannot account for is left alone, because the record is a file somebody may have edited and
a path escaping the published root is a reason to stop rather than a reason to delete.

**`cms gc` sweeps the tree that record cannot see.** Being driven by the record is what keeps
`cms og`'s own sweep from being a second garbage collector, and it is also its limit: a key the
record never held, or one it lost when the file was deleted or its version bumped -- `load` reads
any other shape as no record at all -- names a card nothing will ever remove. So
`data/public/opengraph/**` is walked by `cms gc` like every other published tree, and anything
under it the site does not ask for goes, which is what the sweep means everywhere else too.

**The live set is derived from the corpus rather than from `data/build/opengraph.json`.** A card is
keyed by `{view}/{slug}.png`, and the live slugs are exactly the ones `cms og` would draw: every
article that is not a draft, is not the bio page, and has a title; and the home page -- crossed
with the nine views. `cms gc` asks the `opengraph`
module for that set rather than restating it, and both sides build the path through `card_path`, so
a change to which pages get cards moves the sweep with it instead of leaving it to be discovered.
Keying the sweep on the card record instead would have taken the whole tree in exactly the case the
record was lost, and deleting a card a page still links to is far worse than leaving one behind:
both are silent, and only the second repairs itself on the next run.

**A card is redrawn when its inputs move, not when its file is missing.** `cms og` records a
hash of everything each card was drawn from in `data/build/opengraph.json` and redraws the ones
whose hash has changed. The older test -- skip anything already on disk -- was always slightly
wrong, since an edited title left the previous card in place until somebody remembered
`--force`; it stopped being defensible once a card started carrying a read count, which changes
without anything in the repository changing at all. The record holds hashes and not the values
behind them, so it stays small and nobody is tempted to read an article out of a build artifact.

The article card's bottom band is two lines: its date and category on the upper one, and what
else the article is available as on the lower. A read count was tried there and dropped -- it is
the one fact on a card that changes while nothing in the repository does, and a figure that can
only be as fresh as the last time somebody ran a local command is a number the card would be
wrong about most of the time. What is left is a badge -- `+8 languages`, and the same
shape in each of the nine -- saying how many other languages this article exists in. `+` carries
"and this many more" without a word for it, which is why the line stays short enough to read at
thumbnail size and identical in form across scripts that share no vocabulary.

**The licence routes have no card, and the routes stay.** They had one: the article template
drew a card per licence, per registry and per package, in each of the nine views. That is
6804 files and 518 MiB -- 87% of everything the bucket held, for a surface whose future is
still open. Articles and the home page keep theirs.

The cost is what decided it rather than the design being wrong: a card per package per view was
a defensible trade while the bucket held nothing else, and it stopped being one once the corpus
moved in beside it. The pages still render, still carry `og:title` and `og:description`, and a
crawler that wants a picture gets none rather than a wrong one. What to do with the licence
surface at all is [todo.md](../todo.md)'s, and a decision there is what would bring cards back
or retire the question.

A view with no card falls back to the source view rather than to a 404. Translation arrives
per segment and per article, so a missing card is a normal intermediate state; a card in the
wrong language still says what the page is, and a blank rectangle says nothing. An unknown
`?lang=` collapses the same way, which is also what keeps the code from reaching the bucket as
an arbitrary prefix.

PNG, not AVIF, against the rule that says store the newest format. The consumers here are
crawlers for X, Slack and Discord, and they do not read AVIF. When the format a thing is
stored in is decided by software nobody here controls, the rule bends to the reader.

The CDN's `robots.txt` forbids nothing, and two failed attempts is why. `Disallow: /` was
right in principle -- a CDN has nothing worth indexing, and its URLs in results compete with
the pages embedding them -- but crawlers read that file before fetching an `og:image`, so it
hid the one thing a page advertises. Carving out `Allow: /opengraph/` did not help either:
Twitterbot implements the original 1994 draft of the format, which has no `Allow` directive at
all, so it reads the disallow and never sees the exception.

A per-agent block would work and would mean tracking which crawler parses which decade of the
format, forever. What was being protected was mild and the bandwidth is not ours to ration, so
the policy stops being clever. An empty `Disallow:` is the one spelling every parser agrees
means "all of it".

## A card is an object, and the answer says which one

A card used to be addressed by the slug of the page it belonged to: `/opengraph/{slug}.png?lang=`,
derivable from the route, with nothing storing a reference. That is what made it a week rather than
a year -- **an edited title rewrote the bytes under an unchanged URL**, and everything holding that
URL kept the old picture until it expired. X caches by URL, so a corrected title showed the old
card for as long as X felt like.

Now a card is published like every other object, under the hash of its own bytes, and the id rides
in the answer the page already fetches. Three things follow, and the third is the one worth stating:

- It keeps a year and `immutable`, because now that is true.
- A redraw is a **new** object at a new address rather than an overwrite, so nothing holding the
  old URL is holding a lie -- and a crawler that refetches the page finds a URL it has never seen,
  which is what actually forces the refresh.
- Two views that draw identically are one object. Sixty-three cards were sixty distinct files the
  first time this was measured, and nothing had to be written to notice.

**The card's id is in the answer rather than derived**, which is the rule the alias layer's charter
gives: a card changes when the article changes, so it resolves at build time. Compare an external
site's favicon, which changes on somebody else's schedule and therefore does not. See
[delivery.md](delivery.md), "A name is resolved, never stored".

`cms og` still decides what to draw from its own record -- the hash of everything a card was drawn
from -- and that record now carries the content id beside it, because with no path to derive there
is nowhere else the address is written.

## The title is sized to fit one line

A card's title is shaped at 96px and stepped down until it occupies a single line, stopping at
56px and wrapping below that. Measured, never estimated: where a CJK title breaks has no
relation to its character count, so the only way to know whether a size fits is to lay it out
and look. The same measurement decides where the band below it starts.

A subtitle begins at 38px and stays there when it fits. Package descriptions are authored by
hundreds of upstream projects and can run much longer than an article subtitle, so a long one
steps down to 20px to keep the complete description between the header and the bottom metadata.
Clipping would make the package's own sentence incomplete; allowing it to overlap would make
the version and licence unreadable. This is measured from shaped lines for the same reason as
the title rather than guessed from character count.

The bottom band is aligned right because X draws the domain over the bottom left of every card
it renders. Anything placed there is covered by somebody else's chrome.

## The manifest has versions, and only one is current

`data/record/metadata.json` and every published record carry a version. Raising it means migrating the file
in place and writing it back, never teaching the reader a second shape -- two readers for two
shapes is how a format stops having a current version at all.

A migration republishes records from the merged manifest rather than re-deriving. The pixels
did not change; only the record did, and spending minutes of AV1 encoding to alter a field
would be paying for an answer already on disk.

**Version 4 is the one exception, and it was checked rather than reasoned.** Its "no transform
needed" was verified against the 39 records in `data/record/metadata.json` at the time: every one
loaded and round-tripped byte for byte through the version-4 shape. Every other version's claim
here was reasoning about the shape; this is the only one a corpus was run against, which is what
the next migration should match before trusting its own precedent by reasoning alone.

## A published record is minified; a committed one is not

`data/record/metadata.json` is read in diffs, so it is written pretty and gets a trailing newline. The
per-asset records under `data/public/meta/` are served, so they are minified. Both hold the same
shape and the difference is only whitespace, which is why it has to be stated rather than inferred
from either file.

**Where the formatting is decided is not a preference here, it is the only place it can be
decided.** `GET /media` returns the stored object's body as it stands -- it never parses, and it
echoes the store's ETag, which is computed over those exact bytes. Reshaping a record on the way
out would mean buffering and re-serialising it on every cache miss, and would make the ETag
describe bytes nobody was sent.

The records published before this rule was written were minified in place. Their key is the
asset's content id rather than a hash of the record, so rewriting one changes no address, orphans
nothing, and needs no republication of anything that points at it.

## Cropping is presentation, so the browser does it

`::image{src=...}` is how an article names one of its own images. It crops to 16:9, centred,
with `ratio` and `align` to say otherwise. Markdown's `![]()` is left to external images,
which have no manifest entry and nothing to inherit.

One syntax, because a default only holds where writing the thing is itself a decision.
`![]()` is what a hand reaches for without choosing, so giving it an opinionated crop would
have been deciding for the author; a directive has to be typed on purpose, and there the
default reads as "you said nothing else, so this". The first version of this rule kept both
and made the directive opt-in, which optimised for not editing existing articles and paid for
it with two permanent code paths and two rules for alt text -- markdown cannot express
"decorative" at all, so `alt=""` meant one thing in a directive and another in an image.

It is done with `aspect-ratio` and `object-fit`, never by storing another object. A variant per
ratio and alignment would multiply the bucket, and would make a content id mean "this image as
shown here" instead of "this image" -- which would take the addressing model with it, because
`cms gc` reaches assets through the ids articles name. The cost is that the hidden part of the
image is still downloaded; that is the cheaper of the two.

**A link card's cover is cropped the same way, by the same default.** `::linkcard` is a
directive typed on purpose, so the argument above applies to it unchanged: saying nothing about
the ratio reads as "the usual one", not as "leave it alone". It takes `ratio` and `align` too,
and the shared helpers name whichever directive rejected the value.

That this was missing was not a decision, it was a place the rule never reached: the default
lives in the compiler's `::image` branch, while the card only borrowed the _component_ -- whose
contract is that an absent crop shows the whole image, because `![]()` depends on it. Covers are
screenshots, so they arrive at whatever shape a window happened to be. The ten in this corpus
ran from 1.52 to 1.96, which is a column of cards at ten heights.

A crop does not reach the feed or the markdown target. Neither runs a layout, and how a page
frames an image is not something the image says.

The scanner reads `::image` for its `src` alone. Missing that would be worse than cosmetic: an
asset referenced only in cropped form would look unreferenced, and the next sweep would delete
it.
