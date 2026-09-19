# Reaching a reader

## Formats are produced here, not at the edge

Cloudflare's image transformations cannot read AVIF below an Enterprise plan, and even there
the source is capped at 1200px while these variants go to 1920. The format chosen for storage
is the one format that pipeline cannot open. Measured: an AVIF source returns
`ERROR 9520: Original image has unsupported format` where the identical request against a PNG
source succeeds.

So the CDN decodes and re-encodes in the worker, using WASM codecs. That removes the plan
tier, the monthly quota and the dimension ceiling together, and the cost is bounded because
the extension is the entire request -- there is no size parameter to vary, so a caller cannot
invent work. Results are held in the edge cache, so the decode is paid once per colo rather
than once per reader.

Only the decoders for what is stored and the encoders for what is asked for. **The AVIF encoder
was deliberately absent and now is not, on one route.** It was argued out on its size -- 1.1MB
compressed against 332KB for the decoder -- and on `cms image` already producing AVIF locally
where the time costs nothing. The first half was measured against the wrong number: the limit is
64MiB uncompressed and nothing compressed, and the bundle carrying it is 5.7MB.

The second half still holds, which is why the encoder is on `/derive` alone and `/image` still
offers `webp`, `jpeg` and `png`. A flat-colour original stored as PNG has no AVIF to serve, and
`/image/{cid}.avif` answering 404 for it is a fact about the bucket that a caller can act on.
Adding the encoder there would have turned that 404 into a silent conversion on a live route.

## Two routes, and what each will not do

`/object/{cid}.{ext}` is the whole of content addressing with nothing added: it forms the key,
reads, and answers. No probe, no synthesis, no outbound request. It is the one route on this host
that keeps its year on a property rather than a promise.

`/derive/{cid}.{ext}.{ext}` is where every transcoding lives, present and future. The source
extension is stated rather than searched for -- this route is told the full name of what to work
from, so it never probes, and it asks the same lookup `/object` uses by calling it rather than by
fetching its own hostname, which would spend a subrequest and invite a loop.

| asked for | answered |
| --- | --- |
| a source that is not in the bucket | `404`, before any byte is read |
| the same extension twice | `301` to `/object`, because there is no work to do |
| an image format from a decodable source | the transcode |
| `zip` | the object packaged, stored rather than deflated |
| anything else | `400` |

**A `3xx` here earns the year, which no other route on this host grants it.** Everywhere else a
redirect is a fact about now; on these two it is a function of the input and can no more change
than the bytes can. The rule is `2xx` or `3xx` keeps the year, everything else keeps five minutes.

**The archive is streamed and its timestamp is not a clock.** Entries are stored, not deflated --
these are already-compressed media and deflate would spend CPU to add bytes -- and the source is
capped at 50MB, checked against a `head` before anything is read, because an isolate has 128MB for
its heap and its WebAssembly together and may already be holding a codec. A fixed epoch rather
than the hour it was asked for, because a response served `immutable` has to be a function of its
input, and a clock in the bytes would make the same request return different archives.

## The extension asks for a format

**AVIF is the usual storage format, not the only one.** This section said only AVIF is stored
and that was wrong: `cms image` writes a flat-colour original as PNG, because lossy coding is
the wrong tool for it -- [data.md](data.md) records the same fact from the article's side, in
the rule that an asset stored as PNG must not be referenced as AVIF. So `/image/{cid}.avif` and
`/image/{cid}.png` may each be a direct hit from the bucket, and the worker probes every
decodable format for the stored object rather than assuming which one it is. Asking for an AVIF
that was never written is how a flat-colour asset became a 404 instead of a conversion.

An extension that is not the stored one is a request to convert that same object, which the
worker satisfies itself: the decode-and-re-encode path in `transcode.ts` described above, not
Cloudflare's image transformations, which the previous section already ruled out for not being
able to read AVIF at all. That also corrects an earlier version of this section, which reasoned
about that pipeline's per-image conversion counting; the worker has never called it.

The conversion instead costs one decode and one encode per requested format, held in the edge
cache afterward so it is paid once per colo rather than once per reader -- the same accounting
the section above gives for the AVIF-to-storage-format case, now applied to AVIF-to-fallback.
Storage would be nearly free either way -- what a stored fallback really costs is the sync, the
derive time, and a second thing to keep consistent.

No `?format=` parameter, because the extension already says which format is wanted and two
spellings of one request fragment the cache key.

**And for the same reason there is no `.jpg`.** It is not a second format, it is JPEG written
for an eight-character filename limit that outlived the system that imposed it -- the history
that leaves `yml` beside `yaml`. Carried as one, it would fragment exactly what the paragraph
above refuses to fragment: two validators, two edge entries and two conversions over identical
bytes. A request for it is answered with a permanent redirect to `.jpeg`, so a reader pays one
extra hop once and their browser never asks again.

The id is checked before that redirect is issued, and a missing one is answered `404` directly.
Redirecting first would make a client spend two round trips to learn that nothing is there.

**Nothing here generates the short spelling**, which is what keeps that lookup off the ordinary
path: `cms image` names a published file `.jpeg` and writes that name into the article, and the
site's asset resolver builds the same one. Both spelled it `jpg` until the redirect existed to
catch them, which would have made every JPEG this repository serves pay a hop meant for somebody
else's typo -- invisible from either side alone, since the CDN and the article each looked right.
A test on each side now holds the two spellings together.

The extension also caps the exposure, and that argument stands on its own: only a size that was
derived exists as an object, so nobody can invent dimensions and make the worker encode whatever
they ask for. The reachable set is the stored ids crossed with the three encodable extensions,
and each answer is held at the edge once produced.

**What it was capping exposure to is the part that was wrong.** This passage reasoned about a
monthly transformation quota and about a failure mode where exceeding it returns an error on new
conversions while already-cached ones keep serving. Both belong to the Cloudflare design the
first section of this file abandoned. A worker that decodes and re-encodes itself has no
per-image allowance to exceed: what a conversion costs is CPU in the worker, paid once per colo.
The preference that reasoning produced survives on the cheaper ground -- the request path a
browser takes by default is the stored object, and conversion is only ever the fallback.

## Exactly one picture in an article is given a priority hint

Every image on the page is `loading="lazy"`, which is right for the thirtieth and wrong for the one
the reader is already looking at. So the first picture gets `loading="eager"` and
`fetchpriority="high"`, and nothing else does.

**One, not the first few.** Priority is a ranking, and a ranking with no bottom has no top: hinting
three pictures mostly reorders them against each other. The hint is worth having because it says
_this one before everything else on the page_, which stops being true the moment it is shared.

**It is withheld unless the picture is near the top.** Counted in blocks -- the first three --
because blocks are what exists at build time. Pixels would be the right unit and are not available:
the hint has to be in the served HTML and where the fold falls depends on a viewport the server has
never seen. A picture within the first few blocks is above it on almost any screen; one further
down is a guess in both directions, and a wrong high priority costs more than a missing one.

**A clip cannot be hinted at all.** `fetchpriority` is defined for `img`, `link`, `script` and
`iframe`; a media element's own fetches are not covered by it, and a `fetchpriority` on `<video>`
is an attribute the browser ignores. `preload="metadata"` is the whole of what a clip's loading can
be told, and it already says the right thing.

**The three tiers above it are already in the right order and are not adjustable.** A stylesheet
in `<head>` is render-blocking and therefore in the browser's highest priority class before anyone
asks; the article's prose is not a resource at all but the document itself, arriving first by
definition -- measured at 277KB of HTML for a long article with the body inline; and the component
code is `modulepreload`, which is already below both. There is nothing to raise and nothing worth
lowering.

## Caching is the worker's job now

The old CDN served these files through a static-assets binding and set their cache policy in
a `_headers` file: `/fonts/*` for one year, `immutable`. That file has no equivalent once a
worker reads from R2, so the policy has to be reasserted in worker code or it is silently lost
-- the assets keep working while being re-fetched on every visit.

The trap inside the old policy was worth keeping in view for as long as it existed. Latin font
filenames carried no content hash -- `IoskeleyMono-Regular-latin.woff2` was a stable name -- so
declaring it `immutable` for a year promised that re-subsetting would produce a new filename,
while the CJK chunks beside it already carried hashes and needed no promise at all. Two shapes
under one prefix, and the policy had to keep both in mind.

**Every chunk is a content-addressed object now**, so the trap is gone rather than handled: there
is one shape, and the year it keeps is the year its name earns.

### And the policy is derived from the key, not decided per route

That trap generalises, and it is now the worker's one cache rule: **a content-addressed key
answered `2xx` gets a year and `immutable`; everything else gets five minutes.** Nothing is
looked up in a table, so a new object type arrives with the right policy and no decision to
remember.

The paragraph above was once the same statement made twice about fonts, and this is that
observation applied to every key the bucket holds. **Nothing keeps a long life without a hash any
more.** The Latin subsets were the only entry on that list and they joined the rest; a key wanting
to rejoin it has to arrive with its own written promise, and there is nothing to copy from.

The condition on the status is the half that is easy to omit, and easy to state too narrowly. A
`404` on a content-addressed key means the object was not uploaded or has been swept, and holding
that for a year would outlive the mistake by a very long way -- but a `304` is a successful
revalidation whose headers replace the ones already stored, so giving it five minutes shortens the
copy it was confirming. Failures get the five minutes; `2xx` and `304` keep the year. See
[artifacts.md](artifacts.md), "The key says what may cache it".

**This shortened three things that were not content-addressed and had been getting a week**:
`/favicon/{domain}`, `/license/full.txt`, and the assets no named route claimed. The week was
inherited from the `_headers` era and had never been argued for any of them individually.

Five minutes is the right number for the same reason the API's answers get five minutes: these
are published bytes, and the whole point of the arrangement above is that **publication has one
delay rather than a different one per resource**. A favicon a week stale while an article is five
minutes stale is two answers to one question.

**Every one of those three has since stopped needing the rule**, which is the better answer than
tuning a number: the icons, the notice and the cards are all content-addressed now and all keep a
year. What is left on five minutes is the addresses that name rather than identify -- the
metadata bucket's root, and the refusals.

## The CDN is four route groups and a refusal

**It resolves nothing, and that is enforced by what is mounted rather than by what is declared.**
Four groups reach a handler and everything else is a `400`:

| group | what it does | outbound |
| --- | --- | --- |
| `/object/{cid}.{ext}` | hands back the bytes at that key | none |
| `/derive/{cid}.{ext}.{ext}` | every conversion and every archive | none |
| `/proxy/{vendor}/**` | a third party, live | **yes** |
| `/` `/favicon.ico` `/robots.txt` | this host's own three answers | none |

Beside them, `/github/**` answers `308` to `/proxy/github/**`, permanently, because the prefix
moved and a reader holding the old one should stop holding it.

**This replaced a route per object type.** `/image`, `/video`, `/captions`, `/content`, `/page`,
`/markdown` and `/license` are gone, and with them the table that said which types existed, the
`301` that corrected a mistyped one, and the test that failed when a type arrived unrouted. A type
in the path answered a question the extension already answers, and the bucket never stored one.

**`400` and `404` are not interchangeable here.** A `404` on a hashed name is a fact about the
bucket and a short-lived one; a path that is not one of the four shapes is a fact about the address
and will never become true. Collapsing them would throw away the only signal that distinguishes a
sweep from a typo.

**The catch-all is back and it refuses**, which is the opposite of the one that was removed. That
one answered for whatever happened to be in the bucket, which is how the records were served with a
year of `immutable` for as long as they shared it. This one reaches nothing: a prefix added
tomorrow is unreachable until somebody mounts it, and until then it is a refusal rather than a
lookup.

### What each lifetime is earned by

One rule over the four groups, and it reads the answer rather than the route:

| answered | kept | because |
| --- | --- | --- |
| `2xx` or `3xx`, a hash in the path | a year, `immutable` | the hash is the bytes |
| `2xx` or `3xx`, no hash | an hour | what stands behind a name can move, but not on this site's clock |
| anything else | five minutes | a refusal is a fact about now |

Everything `public`. **A `3xx` keeps the year here, which no other host grants it**: a redirect
elsewhere is a fact about this moment, and on `/derive` it is a function of the input and can no
more change than the bytes can.

Two answers sit outside the rule and say so. `/favicon.ico` keeps a year with no hash in it -- the
one exception on this host, and it carries a promise: what moves is what the alias layer answers,
and that keeps its own hour. And a `502` from anything that had to reach another host is
`no-store`, because status alone cannot tell it from a `400` about a malformed address, and only
one of the two is worth forgetting immediately.

`/proxy` lost lifetimes of its own in the bargain. They said how fast somebody else's data moves --
a rolling tag against a version, an avatar against a release -- which is a real fact, and not one
worth a second rule. An avatar is now an hour stale rather than five minutes, and a `nightly`
likewise.

## Three layers, and the dependency runs one way

Four hosts answer, and three of them are a ladder.

| | depends on | answers with |
| --- | --- | --- |
| `cdn` | nothing, except on `/proxy` | bytes |
| `api` | the metadata bucket | records |
| `ill.li` | `api` | a redirect |
| `site` | `api` + `cdn` | pages |

**Nothing below reaches upward.** The CDN can serve every byte it holds with the API down, which is
not a happy accident -- it is what content addressing buys, and asking the CDN to look anything up
would spend it. So resolution cannot live there, and that is what the third host is for.

That claim is about the bytes and is narrower than it reads: `/proxy` reaches a third party by
definition, and the day `/symlink` lived on the CDN it reached the API. Neither serves an object,
so `/object` answering with everything else down has stayed true throughout -- but it is worth
saying which half is guaranteed rather than leaving the sentence to carry more than it can.

`ill.li` is the hostname and `alias` is what the code calls it: the binding says what the layer
does, one name standing for another, and the host is the short form a reader sees. It was
`aka.ffoni.com` and the domain was `internal.link`, serving nothing -- `link` said nothing either,
because every URL is a link.

### What this layer lets a cache keep

**Its answer is exactly as fresh as the answer behind it**, so a resolved redirect takes the life
the API's `/asset` answer takes and not a number of its own. Any other value would be a second
publication delay on one resource, which is the thing the ladder above exists to avoid.

The refusals split on one question, and it is not success against failure:

| answered | kept | because |
| --- | --- | --- |
| `302`/`307`, resolved | five minutes, `stale-if-error` | the life of the answer it wrapped |
| `404`, no such name | five minutes | a fact about the corpus, true until the next publication |
| `400`, malformed hostname | five minutes | a fact about the address; not worth a third number |
| `502`, upstream unreachable | `no-store` | a fact about this moment |
| `500` | `no-store` | the same |

**`502` is the one that matters.** Every icon on a page comes through here, so a five-minute hold
on one unreachable upstream is an outage rather than a blip -- the same asymmetry the CDN keeps
between a `404` about its bucket and a `500` about its moment.

`stale-if-error` only appears here. This is the one host that must reach another to answer at all,
and a redirect it resolved earlier is a better answer during an outage than no answer -- the target
is content-addressed, so a stale one is still the bytes somebody asked for.

A middleware stamps the corpus lifetime on anything that named none, so a route added later cannot
answer without one.

### A name is resolved, never stored

This layer holds no bytes and no records. A request names something, it asks the API what that name
means right now, and it redirects to the CDN. That is the whole of it, and the emptiness is the
design: a layer that proxied bytes would be a second CDN with worse properties, and one that cached
records would be a second API that can disagree with the first.

**What belongs here is the resolution that cannot happen at build time.** An image an article owns
changes when the article changes, so its address is compiled into the article and needs nobody. A
favicon belongs to somebody else's site and changes on their schedule -- compiling that in would
mean republishing every article that mentions them the day they change their icon. The rule is the
asset's clock, not its kind: **resolve at build time what changes when the article changes, and at
request time what changes on somebody else's schedule.**

### Every answer is temporary, and the request decides which kind

A permanent redirect from here would be a promise about bytes this layer does not hold. So the
answer is always temporary, which leaves two codes, and what picks between them is whether the
request carried input.

| asked with | answered | because |
| --- | --- | --- |
| a path alone | `302` | there is nothing to preserve; a `GET` stays a `GET` |
| a query | `307` | the query is the question, and the answer depends on it |
| a body | `307` | a `302` is specified to let an agent discard it |

**A path is not input.** It is the name being resolved, and it arrives at the CDN as a different
name anyway. `?tone=dark` is input: it selects among several answers, so the request is preserved
rather than merely followed.

### The whole chain, for a fixed asset

The site's own marks are published as content-addressed objects like anything else. The published
root names each one under the name a browser asks for, `/asset?name=` is the question the alias
layer puts to the API, and the name a reader sees never changes.

```
site/favicon.ico            301  ill.li/symlink/favicon.ico   a permanent name, and where it lives
ill.li/symlink/favicon.ico  302  cdn/object/{cid}.ico         what that name means right now
cdn/object/{cid}.ico             the bytes, for a year
```

The two redirects look like one too many and are not. **The `301` is about a name and the `302` is
about a meaning**, and they have different lifetimes for that reason: where the entry lives never
changes, what it currently points at does. Every host mounts the same permanent name -- the site,
the API and the CDN all answer `/favicon.ico` with the same `301` -- so a crawler that reaches any
of them finds the same answer.

**The marks themselves live in `data/source/brand` and travel with the repository.** They were loose in
the published tree, which is to say on one machine: authored once by hand, regenerable by nobody,
and in no clone. That is the one set `data/`'s "the bytes belong to the machine" rule must not
cover. The icons `cms favicon` fetches from other sites travel for the same reason, in
`data/source/favicon`: re-fetchable in principle, but only from a site that may have redrawn its icon
since, so a clone without them cannot reproduce what is published.

### Another site's icon is the case this layer exists for

`ill.li/favicon/{domain}` keeps the domain in the address, because that is what a link card can
construct from what it already knows and it is the half worth reading. What the name means changes
when that site redraws its icon -- somebody else's schedule -- so compiling the hash into every
card would mean republishing every article that mentions them on the day they do.

`?tone=` selects among answers, so a request carrying one takes the `307`. **A named tone is that
tone or nothing**: a caller that asked for dark and received light cannot tell it happened, and
would draw a light icon on a dark surface believing it had the right one. With no tone named,
either will do and light is tried first.

Content addressing deduplicated them on the way in: a site whose light and dark icons are the same
file now has one object, not two, without anything being written to notice that.

## Release assets are proxied, for one account

`/github/release/{repo}/{tag}/{asset}` serves a file attached to a GitHub release, fetched live
from `github.com/{owner}/{repo}/releases/download/{tag}/{asset}` and held at the edge. `latest`
as the tag takes GitHub's own alias for the newest non-prerelease. jsDelivr already serves a
repository's files at a tag, a branch or a commit, so those are not proxied here; a release
asset is the one thing it does not carry.

**The account is not in the URL.** It is `GITHUB_OWNER` in `libs/urls`, and there is no segment
in the CDN's path to name another, which is how "only my repositories" is enforced rather than
checked. A repository the account does not have, a tag that was never cut and an asset that was
never attached are all one answer from GitHub, 404, and the proxy says the same.

**A moving tag is held for minutes; a version for an hour.** `nightly`, `weekly`, `monthly`,
`stable`, `beta`, `dev`, `canary` and `latest`, in lowercase, name a release that is rewritten in
place, so what their assets held an hour ago is a different file: a hit is kept five minutes and
a miss one. Any other tag is read as a version, whose bytes will not change: an hour, and five
minutes for a miss, which is the CDN's usual life for an error. The list is exact -- `Nightly`
is a version as far as this is concerned -- because guessing at case would be guessing at
intent.

**A ranged download is answered from one upstream fetch.** The whole file is stored at the edge
under its plain URL, and the cache answers a `Range` request out of it with a 206, so a client
opening eight connections costs GitHub one transfer per colo rather than eight. A ranged request
that misses is answered from upstream as asked, and the whole file is fetched once behind it so
the connections that follow find it. Files past the edge cache's limit of 512 MB are passed
through unstored, ranges and all.

**The redirect is followed only onto GitHub.** The published address answers with a 302 to a
signed object URL, and following it is the whole mechanism; following it anywhere would make
this an open proxy the day that redirect changed, so the final host is checked. The headers that
describe the file -- type, length, disposition, `ETag`, `Last-Modified` -- are carried through;
the ones that described the upstream connection are not.
