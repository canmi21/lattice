# The site's API

The routes the site's pages ask, and the public ones the platform's gateway reaches. It moved here
from the platform's `spec/architecture/services.md` and `spec/architecture/artifacts.md` with the
split, since the API is the site's; the objects it reads, and their keys, stay the platform's.

## The site's API runs in the site's Worker

The site's pages and its API are one Worker, `site`. The API's routes are a Hono app in
`apps/site/api`, and the site's `hooks.server.ts` hands it the requests that are its own before
SvelteKit reads a path as a page's. Two doors reach it:

- **The site's pages ask it on their own origin, under `/api/`.** During server rendering SvelteKit
  answers a same-origin `fetch` in-process, so rendering a page costs no request at all; in the
  browser it is the connection the page already has, with no CORS and no preflight. These routes
  are the site's own and nobody else's contract.
- **The public routes are the `site` scope of the API host.** The gateway binds the `site` Worker
  and sends it `/api/{route}` under the API host's name, which a request can carry only by coming
  through that binding: Cloudflare picks the Worker by the host. The Worker serves those names
  alone -- `PUBLIC_ROUTES` in `apps/site/api/src/contract/routes.ts`, today `media` and `asset`, which the
  alias layer reads. The declaration says where it answers with `[api] prefix = "/api"`; see platform's
  `spec/architecture/services.md`, "The site's API runs in the site's Worker".

**Why one Worker.** The pages and the API they call now build together, so what one expects the
other is -- an internal route can change shape without a window where a deployed page asks a
deployed API a question it no longer answers. That is also what lets the internal addresses be
generated at build time for both at once. And rendering reads the corpus through the API, so a
subrequest per record was the price of keeping them apart.

**What it costs, accepted.** The code rendering pages holds the database, the records bucket and
the limits, where a separate Worker kept them from it. The rule [data.md](data.md)'s two buckets exist for is
that no route or catch-all can reach what it should not; here the API is reached only at `/api/`
and the API host, both decided in one function, and the records bucket is still not the one the CDN
serves. The site's error reporting covers the API, which had a Sentry project of its own.

**The two runtimes stay apart in the type checker.** The site's program checks against the
browser's globals, and the API against workerd's, and the two disagree about `Response` and
streams. So the site imports `@canmi/site-api` through `src/boundary.d.ts`, the one thing it needs --
something that answers a request -- and the API's own tests hold the real app to that declaration;
see the workspace's `spec/code.md`, "A runtime's globals decide which program checks a file".

**It lives in the site, beside `src/` rather than inside it.** `apps/site/api` is the site's own code
and sits in the site's directory, as a package of its own because its type program is not the
site's: inside `src/` it would be checked against the browser's globals. Nor is it a SvelteKit
route -- a `+server.ts` is in `src/` too, and would give up the Hono app, the addresses by contract and
the limits the API answers through. It was `libs/site-api` for a while, which put the site's API
among code every app may take, and it is nobody's but the site's.

**It is named `api`, and the SvelteKit app stays at the site's root.** The half with no page is
the server's; the other half renders on the server as well -- its hooks, its SSR, the dispatch into
this one -- so calling it `client/` would say something false about it, and moving it would have
moved every path the site's tooling and its build configuration name for no gain but symmetry.

**In development the records come off the disk.** The API reads the records tree through the
fetcher the store takes, which `wrangler dev` used to hand over as assets. The site's assets are its
own build and Vite runs in node, so the site reads the tree itself, in development only.

### The pages ask by contract, not by name

In production a page asks for a route at `/api/{address}`, twelve hex digits of a SHA-256 over the
route's name and its contract: the schemas its answer and request are read by, taken as data, and a
revision for whatever of its shape no schema describes. `apps/site/api/src/contract/contracts.ts` holds the
contracts, and the site's build states every address to the pages and to the Worker in one
`define`, so the two agree by construction. The shapes and the hashing are `libs/addresses`,
`@canmi/addresses`, which the console's facets ask by too. A route has a shape as well -- `articles/{slug}/reads`,
`assets/{name*}`, in `SHAPES` beside the routes -- which puts the thing it is about in the path, as
the workspace's `spec/addresses.md` has every address do; a production page asks at the route's
address followed by the shape's placeholders, `/api/{address}/{slug}`, and the Worker reads the
values back into the parameters its handler takes. Development asks at the shape itself, and a
production Worker answers a shape with a 404.

**The address moves with the contract and with nothing else.** A deploy that leaves a route alone
leaves its address, and whatever cached it, alone. A deploy that changes it gives it a new address,
so a tab still open from before asks the old one and is told the route does not exist -- the answer
a removed route would get -- rather than reading an answer of a shape it no longer understands.
Hashing the build instead would have cost every open tab every route on every deploy.

**It is not access control.** The addresses are in the page's script for anyone to read. What it
buys is that the internal routes are nobody's contract: nothing outside the site can come to depend
on one, so it can change whenever the site does. The public routes keep their names on the API host,
which is where a promise is made.

This reversed a first arrangement, in which the API was a Worker of its own named `site-api`. Its
reason was the credential split above, and it was sound until the internal addresses were wanted
built together with the pages, which two Workers cannot do.

## The API is the only thing that changes

Every request the site makes resolves through the API, whose answers are cached for five
minutes and whose payload is metadata and hashes. Everything else it needs is then fetched from
the CDN by hash and cached for a year.

**One variant dimension, and it is the locale.** Every additional dimension divides a
five-minute cache by the number of values it takes, and the hit rate on these answers is what
the whole design's latency rests on.

| Route                          | Answers                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `GET /articles/{slug}?locale=` | one view's metadata and its `content` hash               |
| `GET /articles/{slug}/source`  | the `markdown` hash, for `<url>.md`                      |
| `GET /homepage?locale=`        | the article list it renders, and its own compiled page   |
| `GET /sitemap`                 | every indexable view's path, date and alternates         |
| `GET /feed?locale=`            | one locale's entries: metadata and a `content` hash each |
| `GET /media/{resource}`        | what is known about one resource                         |
| `POST /batch`                  | every question asked about many things; see below        |

The shapes are the site's, in `api/src/contract/routes.ts`.

### A slug is the identity and the path is the address

**A slug is unique across the whole corpus, whatever directory holds it.** `friends-come-in-phases`
names one article for as long as it exists; `mirror/friends-come-in-phases` is where it currently
lives. One is what it is, the other is where to find it, and only the second can change.

That is what the API asks with: the slug in the address takes the identity and nothing else. Passing the
directory too would be a second copy of a derivable fact, and the API would then have to decide
what to do when the two disagree -- a failure mode bought for nothing, since the answer names the
real path anyway.

**Three rules make the identity usable as an address, and all three are refused at build time**,
before a single article is compiled -- a corpus that breaks one of them produces artifacts that
are wrong rather than absent, and wrong silently.

- **Lowercase letters and hyphens, and at least one hyphen.** No dots, because a dot is how this
  site tells a document from a page. The hyphen is what reserves every single word for the site's
  own router: `/{name}` with no hyphen cannot be an article, so it is a `404` without asking the
  corpus at all.
- **No two articles share one.** Two that did would resolve to whichever the lookup reached first.
- **None may be a name the router already answers for.** The router is asked first and always
  wins, so an article behind one of its names is an article nobody can reach. The reserved list is
  read from the route directory rather than written down, so a route added tomorrow is compared
  against the corpus tomorrow.

**The read counter is keyed by the slug**, which is the same decision seen from the other side. It
used to be keyed by the path, so recategorizing an article opened a fresh row at zero and orphaned
everything it had earned -- six rows carried between 340 and 9,795 reads when this was written.
Identity is what a count should hang from; an address is not.

### Reaching an article by name

The site accepts both shapes and serves neither: it redirects, so which address is the real one is
answered by the server rather than guessed by a crawler. Serving the article at every address it
answers to, with a `canonical` pointing elsewhere, is the duplicate-content shape.

| Asked for           | Answer                           |
| ------------------- | -------------------------------- |
| `/{wrong}/{slug}`   | `301` to the real path           |
| `/{slug}`           | `302` to the real path           |
| `/{name}` no hyphen | `404`, without asking the corpus |

**The two codes differ for a reason worth keeping.** Two segments whose second is a known slug is
unambiguously an article at a stale address, and that shape will never be anything else, so the
redirect is permanent. A single segment is the site's own namespace -- `licenses` is there now and
more will be -- and a `301` is cached by browsers approximately for ever, so using one would spend
an address this site may want later and be unable to take it back.

**`<url>.md` redirects on the same terms.** A source served at every address that reaches it is the
same duplicate-content shape as a page served that way, and a rule with one exception is a rule
nobody can apply without asking. So `/source` answers with the path as well as the hash, for the
reason every other single lookup does: the question asked by identity, and only the answer knows
whether the address it was asked at is the real one. A page has no directory, so its identity is
already its address and it never redirects.

**The homepage is the one thing whose two sides have different canonical addresses**, and `/.md`
is where that shows. The page is at `/` and `/homepage` bounces to it; the source is at
`/homepage.md` and `/.md` bounces to _that_, so the two redirects run in opposite directions. The
alternative reading of `/.md` -- an address naming nothing, answered 404 -- describes a request
nobody makes: a reader appending `.md` to the page they are on is asking for that page's source,
and the homepage is a page like any other.

It was a 500 before it was either. `/.md` leaves no identity behind once the extension is taken
off, the empty slug went to the API anyway, and `/source` answers 400 to one -- which is correct,
and which the site turns into a thrown error, because only a 404 means absence there. **A 4xx that
is not 404 says the caller built the question wrong**, so it is left loud: swallowing it here would
have hidden every malformed request this site will ever send, to save one guard at the one place
that could send one.

### A question names its thing in the path; a list asks with a body

**A single lookup is a `GET` that names the thing it is about in the path and every refinement in
the query** -- the slug in the path, the locale in the query -- as the workspace's
`spec/addresses.md` has every address do. Asking about many things at once is a `POST` carrying a
list, because a list does not belong in a URL.

It was not that before, and the inconsistency was invisible from inside: the locale had been
argued into the query while `/view/{slug}` kept the slug in the path, and then the slug was moved
into the query too, against the workspace's rule. The rule is worth more than either spelling.

The cost is that a slug carries slashes and arrives percent-encoded --
`?slug=architecture%2Fcompile-time-rendering` reads worse than a path did. That is the price of a
rule with no exceptions, and a rule with one exception is a rule nobody can apply without asking.

**The locale is a query parameter and never a path segment.** The API spells it `?locale=`, as it
spells every parameter out -- see services.md, "Names in an API are spelled out". The site's pages
keep `?lang=`: `spec/locale/addressing.md` gives it as a reader's first
preference source, `llms.txt` documents it for machines, and it is in every indexed address, so a
page's spelling is not the API's to change. The two used to be one spelling on purpose; the API's
names being meaningful was worth more. Absent means `mw`, the same answer a bare URL gives; an
unknown value is a `400` and never a fallback to another view.

**The CDN is the exception, and it is not one.** There a path _is_ the key --
`/object/{cid}.{ext}` -- and the whole cache policy is derived from its shape, so moving a hash
into a query would take away the thing that decides how long it may be held. The rule above is
about questions; the CDN serves addresses. See platform's `spec/architecture/delivery.md`.

### A refusal nobody handled is still a refusal

**Every non-2xx either worker answers is the envelope**, including the ones no handler of ours
produced. A route that does not exist, a method a route does not take, an error thrown past
everything: hono answers those itself, in `text/plain`, and a caller parsing JSON reads that as a
syntax error rather than as a message.

It was wrong in production before it was noticed, which is the part worth keeping. Every refusal a
handler wrote was wrapped from the first day, so the rule looked kept -- and `GET /batch`, a route
that exists only for `POST`, answered `404 Not Found` as plain text. The failure mode of a
half-applied rule is that the applied half makes it look finished.

So both workers carry a `notFound` and an `onError`, and the lifetimes stay what they already
were: a miss is held for five minutes, because which routes exist changes when a worker is
deployed and not before, while a `500` is `no-store` -- a 404 is a fact about the service and a
500 is a fact about this moment.

**A method is answered as a method problem.** `GET` on a `POST`-only route is `405` with `Allow`,
not `404`. Typing a URL into a browser is the first thing anyone does with one, and a browser
sends `GET`; being told the route does not exist, when it does, is the least useful true answer
available.

### One batch entry point

`POST /batch`, and the body's `type` says which question. Every batchable question used to get a
route of its own -- `/views` beside `/article`, `/read-counts` beside `/read` -- which meant
inventing a second name for something already named, and then living with names a letter apart
where only one had an effect.

```jsonc
{ "type": "articles", "slugs": ["architecture/one"], "locales": ["ja", "de"] }
{ "type": "reads",    "slugs": ["architecture/one", "mirror/two"] }
```

`articles` is one shape for two gestures: a language menu is one slug and many locales, a homepage
warming its list is many slugs and one locale, and they are the same question. The answer carries
its `type` back, so a consumer holding one can tell what it answers without remembering what it
sent -- which starts to matter as soon as one batcher serves several questions.

A slug the corpus does not name is **absent** from the answer rather than an error, because this
is what a consumer asks before it knows which exist. A locale that is not a locale is a `400`: the
first is a fact about the corpus, the second is a mistake in the question.

Nothing here is cacheable, and that is the trade. A `POST` is not a cacheable request, so the
caller memoizes what it asked for -- which is what makes a batch a warming path rather than a
serving one.

**An answer is grouped, not flat.** `objects`, `locale`, `meta`, `dates`, `metrics`, `preview`:
each group answers one question, and a reader looking for a title does not have to know the whole
list to find it. Flat, this was thirteen keys with `content` beside `title` and `words` beside
`language_tag`. The groups are the same ones the root stores, so an answer is mostly a projection
of it.

**A read count is not here at all, and the reason is worth the paragraph.** It was carried inside
`/article` for an afternoon, which gave one counter nine cached snapshots of itself -- one per locale
-- that could disagree by five minutes, so a reader changing language watched the number move for
no reason. A count and a view have different freshness: one is written by every visitor, the other
changes when somebody publishes. It lives in `spec/engagement.md`'s API, on a route
of its own, with no locale in it.

`/source` takes no locale, because `<url>.md` serves the source whatever view asked for
it, and it resolves against articles and standalone pages alike -- a page's markdown hash is
reachable nowhere else. Having no variant dimension at all makes it the best-cached answer here,
and the whole design's latency rests on how often these answers are hits.

**A fact appears in exactly one answer.** `/article` carries neither the markdown hash nor the
alternates, though it once carried both: the first has the route above, and the second is already
inside the `content` object the view names. Two answers holding one fact is the shape
the workspace's `spec/code.md` warns about, where the second reader is the one
that eventually disagrees.

**These shapes are typed in the platform's `libs/sdk/artifacts` and are not restated here.** They changed seven times
in one afternoon while two Workers held two hand-written spellings of them, and every disagreement
was silent until somebody described one out loud. Each route is annotated `satisfies` its shared
type and each consumer imports the same one, so the next disagreement is a compile error. Three
routes answer `{ hash }` and share one name for it rather than three.

The first thing that arrangement caught was already there: `RootArticleSchema` parsed an
alternate's `code` as a bare string while `Alternate` allows only the eight translation codes and
`x-default`. The API's one schema parse -- the thing the section below says everything downstream
trusts -- was accepting a value its consumers' types say cannot exist. The schema was tightened
rather than the answer type widened, because widening pushes the cast onto the sitemap route,
which is how a schema quietly stops meaning anything.

**A `404` is cached; a `5xx` is not.** Five minutes on "this slug does not exist" is the cost of
a new article being invisible for five minutes, which is the delay this design already has. Five
minutes on "the API failed" would turn a blip into an outage, so an error is cached for seconds
or not at all.

### The site keeps serving when the API does not

Before this, an article was a lookup in a map compiled into the Worker, and the site could not
fail to render one. It is now a network call, which is a failure mode that did not exist.

The answer is `stale-if-error` over the root's answers, with a stale window measured in hours.
A root from three hours ago names objects that are all still there and still immutable, so what
it renders is a coherent older page rather than a broken one. That property is a gift of content
addressing and it is the reason this is worth relying on rather than merely tolerable.

**There are two calls on that path now, and the second one is the same bet.** A compiled article
names resources and stops, so rendering one also asks what those rids currently mean -- see
platform's `spec/architecture/resource.md`, "A rid is resolved three times, and each stage bakes only what it can
know". The stale answer survives for the reason the stale root does: a record from three hours ago
names files that are content-addressed and therefore still there.

The two failures are not the same and are not cached the same. A resource the corpus does not
publish is a fact about the corpus and keeps the publication delay; an API that could not be
reached is a fact about this moment and is not stored. That is the asymmetry `apps/delivery/aka` already
keeps, arrived at there because every icon on a page came through one host and holding a blip for
five minutes turned it into an outage.

## Two consumers, and the second one is the browser

The site renders the first view a reader asks for, so that the first paint costs them no round
trip of their own. After hydration the client has everything it needs to do the same work:
ask the API for a slug and a locale, fetch the `content` object from the CDN, and render.

So a navigation after hydration does not call the site at all. This is what the API and CDN
being separate origins on stable addresses buys, and it is why the hop between them is a public
one rather than a Worker binding: a consumer that moves off this platform keeps working, and the
browser is already such a consumer.

**A client fetch that fails falls back to a full document navigation.** The server path still
works, so the recovery is to use it; without this the failure is a click that does nothing.

**Every answer this API composes arrives in one envelope**, `{ status, data }` or
`{ status, message }`, so a consumer asks whether the call worked before it asks what it returned
-- and asks it in one place rather than at every call site. What the envelope carries is not
standardized: `data` is whatever that route answers with, checked by whoever asked for it. A
stored object streamed through this API is not composed by it and is not wrapped. The type and the
one function that opens it are in the platform's `libs/sdk/artifacts`.

**The server's own fetch is a cross-origin request with no `Origin`, and that combination has a
trap in it.** SvelteKit's universal `load` simulates CORS on the server for a cross-origin
response, refusing one whose `Access-Control-Allow-Origin` is neither `*` nor the page's origin --
while `event.fetch` sends no `Origin` header at all, so an allowlist keyed on that header sets
nothing. The API answers `200`, the render throws, and nothing says why. So a request arriving
without an `Origin` is answered `*`: it is not a browser making a cross-origin request, and the
header grants it nothing. Requests that do carry one are still matched against the list.

**That held only while every such fetch was a `GET`, and it is half the rule.** SvelteKit sets
`Origin` on every server-side request and deletes it again only for `GET` and `HEAD` --
`runtime/server/fetch.js:41-43` against `:52-58` in 2.70.3 -- while the CORS simulation at
`runtime/server/page/load_data.js:297` runs for every cross-origin fetch from a `load` whichever
method it used, and throws at `:307-309` on an answer the header does not name. So the paragraph
above describes a `GET`, and the allowlist it says grants nothing was dead code on this path for
as long as the site only made those. **The first non-`GET` a `load` makes is the first request the
list can refuse**, and it refuses it in development, where the site's origin is a port.

Resolving a page's resources is that first one, because it asks for many rids at once and a batch
question has a body. Nothing before it could have revealed this: the trap is not that the rule was
wrong, it is that half of it had never been reached.

**What the reached half costs is one port, and that is the port rule arriving from a second
direction.** The list names the site's development port and no other, so a site served from
anywhere else has its resource question refused while the API answers `200`, and the page renders
blank with `CORS error: No 'Access-Control-Allow-Origin' header is present` in the site's log and
nothing in the API's. Measured on port 26611. It is not a gap to widen:
`spec/toolchain.md` already says one checkout runs one set on the pinned numbers and
that the slot arithmetic for a second is gone, so the one legal origin and the one legal port are
the same decision written twice. **A browser never meets it**, because in development it reaches
the API through the site's own proxy, and that proxy answers the CORS question itself -- verified:
the same `POST` carrying the same foreign origin is refused directly by the API and allowed through
the proxy, which echoes it. So the allowlist is consulted on exactly one path, the server's own
non-`GET`, and anyone who sees a page resolve after hydration but not before should look here
before looking at their own work.

**And in development the site's origin is not the one the list names.** `localhost` and
`127.0.0.1` are one machine spelled two ways; the list holds the first, so browsing the site by IP
produced an answer with no header and a `500` where the same page worked by name. Development
accepts either spelling on the site's own port, gated on the host the request arrived at, so
production's list is exactly the list.

**Locale is not negotiated twice**, which this arrangement makes newly possible to get wrong and
does not change. See `spec/locale/addressing.md`, "Locale is not negotiated
twice".
