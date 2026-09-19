# What is published, how it is addressed, and what may cache it

The corpus is compiled here and published as objects. The site reads them at request time and
is rebuilt only when its own code changes. What the objects hold is
[data.md](data.md); how a reader reaches one is [delivery.md](delivery.md); this file is the
shape they are addressed by and the rules that fall out of it.

## One mutable root, and everything else immutable

The published corpus is a tree of objects that name each other by content hash, with exactly
one object at the top whose name does not change. Nothing else in it may be rewritten.

That is the whole design, and every rule below is a consequence of it:

- **An immutable object needs no invalidation.** Its key cannot denote different bytes, so a
  cached copy is correct forever and the edge may hold it for a year.
- **The root is the only thing that can go stale**, so the site's publication delay is one
  number rather than a policy per resource.
- **A republish is incremental by construction.** An edit changes the hash of the object it
  touched and of the root; every other object is byte-identical and is not uploaded.

The last of those is inherited rather than invented. [i18n/segments.md](../i18n/segments.md)
already hashes a block after normalisation, so a reflow or a restyle changes no id. Hashing the
compiled view extends that property one level up: reformatting the whole corpus publishes
nothing.

## The key says what may cache it

**`/{type}/{hash}.{ext}`, where the hash is BLAKE3 truncated to 128 bits and written as 32
lowercase hex characters.** A key of that shape is content-addressed and is answered
`immutable`. Any other key is not, and is answered with five minutes.

The classifier is the rule. Nothing is looked up in a table and no new object type has to
remember to ask for a policy: it gets the right one from the shape of its own name. The test
that this is working is that adding a type is a one-line change with no cache decision in it.

**The long life is conditional on the answer having one.** A `404` on a content-addressed key
means the object was not uploaded or has been swept, and neither is a fact worth keeping for a
year. Every failure is five minutes, whatever the key looks like.

**A `304` is not a failure, and reading the condition as "2xx" got that wrong.** A revalidation's
headers replace the stored response's, so five minutes on a `304` cuts a year-old copy down to
five every time a client checks it -- the exact opposite of what the answer means. Measured: a
conditional request for a content object came back `304, max-age=300`. It now comes back with the
year, and a `416` or a `404` still comes back with five minutes.

That cuts both ways and it is why publication has an order: a root that names an object nobody
uploaded yet produces a `404` that is then held for five minutes on a key that becomes valid a
second later. See "Publication is ordered" below.

### The type segment is for people

A machine needs only the hash; `/{type}/` exists so a person listing the bucket can see what
they are looking at. It is still matched strictly rather than ignored -- `/{type}/{hash}.{ext}`
and nothing looser -- because a segment that is decorative in one place and load-bearing in
another is the kind of thing that is eventually parsed by accident.

### There is one exception, and it carries a promise

**Latin font subsets.** `IoskeleyMono-Regular-latin.woff2` is a stable name served for a year,
which is a promise that re-subsetting produces a new filename. The promise is written in
[delivery.md](delivery.md) and is the reason the name may keep its long life.

That is the whole list. An exception is a name plus the promise that justifies it, and a key
wanting a long life without a hash has to arrive with one.

`/favicon/{domain}` is deliberately not on it. It is not content-addressed, it is refetched and
may legitimately change, and so it takes the five minutes the rule gives everything else -- which
is the default rather than a decision about favicons.

## The mutable root

`state/index.json` is the only object in the bucket whose bytes change under a fixed name. It
holds, for every article and standalone page, every locale view's metadata and the hashes of
the objects that carry that view's content.

**Only the API reads it.** Nothing else parses its format, which is what lets it change shape
without a second consumer to keep in step, and what makes the API the one answer to "what is
published right now".

It is not sharded. At the corpus's size a locale split would be arithmetic performed on a file
small enough to send whole, and a shard is a second thing to keep consistent. The question comes
back when the file stops being small, and not before.

## Which objects exist

| Type       | Holds                                                | Produced per     |
| ---------- | ---------------------------------------------------- | ---------------- |
| `content`  | One compiled view: meta, toc, blocks, summary, words | article x locale |
| `markdown` | The article source, served at `<url>.md`             | article          |

**Three types, and a whole-corpus document is not one of them.** `atom.xml`, `llms.txt` and
`sitemap.xml` are assembled by the site's Worker out of the API's answer and, for the feed, the
content objects that answer names.

The feed was published for a while and it is the shape a content-addressed store is worst at:
a document the size of the whole corpus, rewritten whenever any one article changes. Nine
locales at a quarter-megabyte each, per edit, immutable and never swept -- a one-line fix to an
image URL wrote 2.0 MB. What made it look necessary was the belief that a feed says something a
block does not. It does not: `feedHtml` in libs/artifacts is the whole difference, and every
field it reads is already in `content/{hash}.json`. `llms.txt` needs no object at all, being a
projection of the root the homepage answer already carries.

What a runtime document costs is one fetch per entry on a cold assembly. Those are immutable and
a year old at the edge, and the document itself is held for five minutes, so it is paid once per
five minutes rather than once per reader.

## Publication is ordered, and deletion is not part of it

Two phases, and the order is the whole of it:

1. Upload every immutable object, and confirm each is readable.
2. Write the root.

A root that arrives first names objects that are not there yet, and the previous section says
what that costs. Confirming before the flip is a step in the publish task rather than a
property of the transfer, because ordering within one `rclone` run is not something to rely on.

**The content-addressed prefixes are mirrored with `copy`, not `sync`.** `sync` deletes what is
no longer local, which would remove the objects a root still in somebody's cache is naming. The
retention that prevents that is simply not deleting: an object stays until a sweep asks. This is
the position [data.md](data.md) already takes -- "Deletion is the one thing that never happens
as a side effect" -- applied to a prefix where it is load-bearing rather than merely prudent.

The root is written with `sync` like everything else. It is one file and it is meant to be
replaced.

A sweep is `cms gc`'s existing shape: dry by default, listing what nothing references. It has
one new constraint, which is that an object may only be swept once no cached root can still
name it -- five minutes plus a margin, so in practice a day.

## Drafts leave the corpus at publication, not at build

A draft is compiled like anything else and its objects go into the **same** tree as everything
else. What withholds it is that the published root does not name it; a second root, under
`data/bucket/draft/` and never mirrored, does.

**The object tree was never the boundary, and pretending it was hid that.** `refs::scan` has never
read the draft flag, so a draft's pictures and clips have always been derived and mirrored like any
other article's -- protected, in practice, by nobody knowing their content ids. Giving the compiled
body the same protection makes the arrangement uniform instead of adding a new risk: a 128-bit hash
of the bytes is not reachable without having been told it.

**The root is the one thing that turns a guessable name into an id**, which is why it is the thing
that is withheld. A slug is human-readable and easy to guess; `findArticle` maps one to a content
id. So the production API is given a root that does not contain drafts, rather than a root that
does plus a filter -- a forgotten filter publishes a draft, and there is no filter to forget.

That also keeps this boundary the one the mirror already enforces, from the other side: `sync`
names the two trees it transfers, and refuses outright a source that contains the draft tree.

**Development reads the draft root, and that is the whole of the difference.** `wrangler dev` binds
one directory, so `data/bucket/draft/` holds the draft root and one symlink to the published records;
the CDN's dev binding is the objects tree itself. Nothing is copied and nothing is mirrored twice.

## The API is the only thing that changes

Every request the site makes resolves through the API, whose answers are cached for five
minutes and whose payload is metadata and hashes. Everything else it needs is then fetched from
the CDN by hash and cached for a year.

**One variant dimension, and it is the locale.** Every additional dimension divides a
five-minute cache by the number of values it takes, and the hit rate on these answers is what
the whole design's latency rests on.

| Route                      | Answers                                                  |
| -------------------------- | -------------------------------------------------------- |
| `GET /article?slug=&lang=` | one view's metadata and its `content` hash               |
| `GET /source?slug=`        | the `markdown` hash, for `<url>.md`                      |
| `GET /homepage?lang=`      | the article list it renders, and its own compiled page   |
| `GET /sitemap`             | every indexable view's path, date and alternates         |
| `GET /feed?lang=`          | one locale's entries: metadata and a `content` hash each |
| `GET /media?cid=`          | what is known about one asset                            |
| `POST /batch`              | every question asked about many things; see below        |

### A slug is the identity and the path is the address

**A slug is unique across the whole corpus, whatever directory holds it.** `friends-come-in-phases`
names one article for as long as it exists; `mirror/friends-come-in-phases` is where it currently
lives. One is what it is, the other is where to find it, and only the second can change.

That is what the API asks with: `?slug=` takes the identity and nothing else. Passing the
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
used to be keyed by the path, so recategorising an article opened a fresh row at zero and orphaned
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

### A question asks with a query; a list asks with a body

**Nothing about a question lives in the path.** A single lookup is a `GET` whose identifiers are
all query parameters -- the slug as much as the locale -- and asking about many things at once is
a `POST` carrying a list, because a list does not belong in a URL.

It was not that before, and the inconsistency was invisible from inside: the locale had been
argued into the query while `/view/{slug}` kept the slug in the path, so one question asked two
ways at once. The rule is worth more than either spelling.

The cost is that a slug carries slashes and arrives percent-encoded --
`?slug=architecture%2Fcompile-time-rendering` reads worse than a path did. That is the price of a
rule with no exceptions, and a rule with one exception is a rule nobody can apply without asking.

**The locale is a query parameter and never a path segment.** `?lang=` is how this site already
asks -- [locale/addressing.md](../locale/addressing.md) gives it as a reader's first preference
source and `llms.txt` documents it for machines -- so one spelling reaches the site and the API.
Absent means `mw`, the same answer a bare URL gives; an unknown value is a `400` and never a
fallback to another view. It stays the one variant dimension either way.

**The CDN is the exception, and it is not one.** There a path _is_ the key --
`/{type}/{hash}.{ext}` -- and the whole cache policy is derived from its shape, so moving a hash
into a query would take away the thing that decides how long it may be held. The rule above is
about questions; the CDN serves addresses. See [delivery.md](delivery.md).

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
caller memoises what it asked for -- which is what makes a batch a warming path rather than a
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
changes when somebody publishes. It lives in [engagement.md](../engagement.md)'s API, on a route
of its own, with no locale in it.

`/source` takes no locale, because `<url>.md` serves the source whatever view asked for
it, and it resolves against articles and standalone pages alike -- a page's markdown hash is
reachable nowhere else. Having no variant dimension at all makes it the best-cached answer here,
and the whole design's latency rests on how often these answers are hits.

**A fact appears in exactly one answer.** `/article` carries neither the markdown hash nor the
alternates, though it once carried both: the first has the route above, and the second is already
inside the `content` object the view names. Two answers holding one fact is the shape
[the workspace code.md](../../../../spec/code.md) warns about, where the second reader is the one
that eventually disagrees.

**These shapes are typed in `libs/artifacts` and are not restated here.** They changed seven times
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
standardised: `data` is whatever that route answers with, checked by whoever asked for it. A
stored object streamed through this API is not composed by it and is not wrapped. The type and the
one function that opens it are in `libs/artifacts`.

**The server's own fetch is a cross-origin request with no `Origin`, and that combination has a
trap in it.** SvelteKit's universal `load` simulates CORS on the server for a cross-origin
response, refusing one whose `Access-Control-Allow-Origin` is neither `*` nor the page's origin --
while `event.fetch` sends no `Origin` header at all, so an allowlist keyed on that header sets
nothing. The API answers `200`, the render throws, and nothing says why. So a request arriving
without an `Origin` is answered `*`: it is not a browser making a cross-origin request, and the
header grants it nothing. Requests that do carry one are still matched against the list.

**And in development the site's origin is not the one the list names.** `localhost` and
`127.0.0.1` are one machine spelled two ways; the list holds the first, so browsing the site by IP
produced an answer with no header and a `500` where the same page worked by name. Development
accepts either spelling on the site's own port, gated on the host the request arrived at, so
production's list is exactly the list.

**Locale is not negotiated twice**, which this arrangement makes newly possible to get wrong and
does not change. See [locale/addressing.md](../locale/addressing.md), "Locale is not negotiated
twice".

## Validation is heavy where it is free and light where it is not

The builder validates every object completely, in a process with no payload budget
([the workspace code.md](../../../../spec/code.md) puts local code on the other side of that line). What ships to
an edge is narrow:

- The **API** parses the root with a schema. It is small, it is read once per cache miss, and
  everything downstream trusts it.
- The **site** and the **browser** check an object's envelope -- version, slug, locale, hash --
  and trust the body.

The reasoning is the one [i18n/segments.md](../i18n/segments.md) already gives for the span
fingerprint: the check exists to catch drift between a producer and a consumer that were
deployed at different times, not to resist an adversary. The producer is trusted; the version
skew is not.

**What the envelope check cannot do is worth stating, because it looks like it can.** `v.object`
strips unknown keys rather than rejecting them, so a producer emitting a field the type no longer
declares passes every consumer silently. That is not a hole to close -- a consumer cannot police a
producer it does not run -- it is the boundary of what this check is. Measured: a stale writer kept
emitting a `locale` on a page object after the field was dropped, which cost nine published objects
where one would do, and no consumer noticed or could have. What found it was a person reading the
builder.

`valibot` is the schema library, chosen over `arktype` and `zod` because the schema ships to a
browser and an edge runtime, because it is the type's source of truth and therefore has to be a
file a person can annotate, and because runtime validation speed -- the axis `arktype` is
strongest on -- is the axis this design spends least on. See [todo.md](../todo.md) for what is
still undecided around it.

## What happens when writing moves online

Two decisions are pinned to one event and are recorded here together, because when it arrives
they change together.

**The event:** an online editor exists and local editing is retired, so an article is written
through a request rather than to a file.

**Then `contents/` and the records beside it leave git.** They are in git today because they are
small, because a rollback of prose matters, and because nothing else backs them up. An online
write path has to answer backup and history itself, and once it does, the reason to hold them
here is gone. Until then they stay, which [data.md](data.md) states as the rule and this file
states as the condition on it.

**And the API's storage separates from the CDN's.** Metadata would then be written by the cloud
rather than mirrored to it, which is the line [data.md](data.md) draws between what the author
produces and what a visitor produces. D1 for one and R2 for the other follows from that line
moving, not from a preference about databases.

Neither is worth doing early. Both are cheap to do late, because the addressing above does not
depend on where the root is stored -- only on there being exactly one of it.
