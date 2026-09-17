# One address per article, and how a request is answered in a language

How a URL, a header, a cookie and a query parameter decide which of the nine views of an article a
request is answered with, and what the canonical link, the sitemap, the feed and the cache make of
that. What produces those views is a separate problem; see [i18n/](../i18n/).

## One domain, one path, no locale in the URL

Everything is served from `canmi.net`. A locale never appears as a path segment and never as a
subdomain: `/rust-cargo-cranelift-tuning` is that article in every language, and which one a
given reader sees is decided per request.

The alternative shapes were considered and rejected for the same reason. A path prefix or a
subdomain makes the language part of a page's identity, which means every already-published
link belongs to one language forever and adding a language multiplies the URL space. Here a
link is a link to the article, and the reader's own preference decides the rest.

The cost is real and accepted: **a shared URL carries no language.** Sending someone a link
shows them the article in their language, not in yours.

## Browser-facing HTML has three preference sources

An HTML request resolves its locale from the first of these that answers:

1. A `lang` query parameter.
2. The locale cookie.
3. `Accept-Language`.
4. Failing all three, the article's own language.

The last step is what keeps the bare URL honest. It is the `x-default`, so what it serves to a
reader nothing is known about has to be the original; anything else would make `x-default` name
a translation. Paraglide's message fallback is the original as well, for an unrelated reason --
see [interface.md](interface.md), and do not read either as implying the other.

The query parameter wins outright and **also writes the cookie**, so following a language URL
once is choosing it from then on rather than making a one-off override. The browser's language
controls use the other entrance to the same state: they write the closed locale code into that
cookie. The server still performs the same negotiation on the next document request; the client
chooses an input, never the rendered view.

**After hydration that takes effect without a document load, and it is still one negotiation.**
The cookie is written, the page re-runs its own universal load, and what it shows is exactly what
the server would have resolved from that cookie -- a prediction, not a second negotiation. What
makes it possible is that the interface's whole vocabulary is already in the browser: every
message call names its locale explicitly, from page data, so no catalogue is fetched and no
runtime state is switched. The article is one request, which is what the published corpus made
cheap. See [architecture/artifacts.md](../architecture/artifacts.md).

**Nothing moves until the article is in hand.** Not the interface, not the menu. The page reads
its locale out of page data and page data changes only when the load has finished, so the swap is
atomic without being coordinated -- which is the same requirement the full reload used to meet,
and the reason that reload existed. A pointer that can hover starts the fetch when it reaches a
row, so by the time it is clicked there is usually nothing to wait for.

Selection runs in the worker on the request, before any HTML is rendered. Every input already
arrives there, and choosing after first paint would make a page render in one language and then
swap. Unlike theme, the content itself differs, so this cannot be a class toggle — see the
caching rule below for what that forces.

Browser-facing collection surfaces use the same resolved code for every article they include.
Homepage cards and article lists take their title, subtitle, description, body, and language
from that article's resolved view; `mw` means each article's own original. The homepage bio is
identity copy and stays in its English source form in every view. Collection UI such as the
Writing heading resolves from the same code through the UI message table. `llms.txt` keeps its
existing behaviour and has no indexed language dimension: an LLM can read any of the views. It
documents the eight translation query codes and `mw` so a machine can ask HTML or Atom for a
specific view, while every `.md` endpoint continues to return the source exactly as written.

Server-only discovery routes do not inherit this negotiation. The sitemap publishes every
indexable view at once. Atom selects from `lang` alone, because each query-specific feed is a
shared-cache resource and neither a cookie nor `Accept-Language` is part of its address.

### Locale is not negotiated twice

Selection runs on the server, once, and the client is told the answer. It never runs a
negotiation of its own -- not after hydration, and not when it navigates without touching the
server at all.

That mattered less when every page came from the server. Now a navigation after hydration is the
browser asking the API and the CDN directly ([architecture/artifacts.md](../architecture/artifacts.md)),
so the client holds a locale and could plausibly re-derive one. It must not. Two implementations
of this negotiation -- one reading a cookie and `Accept-Language` in a Worker, one reading
`document.cookie` in a browser -- would be two readings of one input, and
[the workspace code.md](../../../../spec/code.md) names that shape as a defect waiting for the
first input that separates them.

The resolved code reaches the client as page data and is carried from there. Changing language
still writes the cookie and reloads, which is the client choosing an input and the server
deciding again; nothing about that changes.

### Every page negotiates; the exceptions are documents

Being multilingual is what a page here is, so nothing has to opt in. What
[hooks.server.ts](../../apps/site/src/hooks.server.ts) carries is the exception, and the exception
is documents: Atom, the sitemap, `robots.txt`, `llms.txt` and the licence text routes.

**A document is recognised by having an extension, and ordinary pages do not have one.** That
is a convention this site already keeps -- `/atom.xml` and `/licenses/full.txt` against `/` and
`/licenses` -- so the test reads the distinction that exists rather than restating a list
beside it. The article lookup is tried first, so a slug that happens to carry a dot is still a
page. `/licenses/pkgs/` is the other explicit exception: its HTML package routes end in a
semantic version containing dots, so that browser namespace is locale-aware before the generic
document test runs. The stable package notices remain outside it at
`/licenses/{type}/{name}@{version}.txt`.

Stated the other way round it would be a list of pages, and the two failures are not
comparable. A page missing from a list of pages serves the original to every reader and says
nothing about it, which is exactly the kind of thing nobody notices; a document missing from
this list merely negotiates when it did not need to.

The licence page shows both halves at once. The page negotiates like any other, while
`/licenses.txt`, `/licenses/full.txt` and the per-package routes beside it do not: a licence is
not translated, and a translated one would be a different licence.

**Not negotiating is what makes a document shared-cacheable, and that is the point of it.** A
page picks its language from a cookie, so two readers asking for one URL get two answers and only
the reader's own browser may keep either. A document takes `?lang=` or nothing: the URL is the
whole of the request, no header is read, no script runs, and an edge may hold one copy for
everyone. So `atom.xml`, `sitemap.xml` and `llms.txt` carry `public, max-age=300, s-maxage=300`,
where a page carries `private, no-store`.

It has to be enforced rather than assumed, because the code that picks a locale is shared with
the pages. `feedLocale` is where it is enforced for the feed, and it reads the search parameter
and nothing else. Confirmed by asking for one URL twice, once with a `content-language` cookie
and an `Accept-Language` that name a different language: the two answers hash the same, while
changing `?lang=` changes them.

### Server-only documents leave the page router

Links from an HTML page to Atom or the sitemap perform a full document navigation. They are
server endpoints, not pages in the client route manifest; allowing the SPA router to intercept
one produces its own 404 even though a direct request to the same URL succeeds. The boundary
belongs on the [source link](../../apps/site/src/routes/+page.svelte). Making the endpoint reload
itself would first render the wrong route and would require client JavaScript in a document
that never needed it.

## The query parameter is for crawlers, and is removed for readers

A crawler has no cookie and does not run a language switcher, so without a URL that names a
language it can only ever see one of the nine views. **The default URL stays bare and every
other language is reachable at `?lang={code}`.** That is the only reason the parameter exists.

Once the page has loaded, the parameter is removed with `history.replaceState`. The reader
keeps a clean URL, the cookie already holds the choice, and nothing about the page depends on
the parameter still being there. Interactive selection creates no query at all: it writes the
cookie and calls `location.reload()` on the clean address. A reload preserves the current
history entry, so switching language cannot leave an extra, visually identical entry behind
the reader.

The preference cookie is deliberately client-writable. It contains only one value from the
closed locale-code set, and the worker validates it again before use. The server rewrites it on
every locale-aware HTML response, even when its value is unchanged; besides refreshing the
lifetime, this migrates an older `HttpOnly` cookie that client controls could not replace.

Only `lang` is ever touched. Other query parameters are left exactly as they arrived, including
their order, because they belong to whatever put them there. `URLSearchParams` is built into
every browser this site supports; **a query parameter is not a reason to ship a library**, and
the post-load cleanup is the last place to add one.

## Two vocabularies, and only one of them is public

The codes in `?lang=` are internal: `mw`, `de`, `en`, `es`, `fr`, `ja`, `ko`, `zh`, `tw`. They
are short because they are ours, they appear only in a URL we generate and read, and no
consumer outside this repository is expected to interpret them.

Everything a machine other than ours reads gets full BCP-47: `<html lang>`, `hreflang`,
`og:locale`. **The two must never be confused, because two of the internal codes are not
language tags at all** — `tw` is Twi, a language of Ghana, and `mw` is a country code. Emitting
either as an `hreflang` value does not merely mislabel one link; an invalid value makes a
crawler discard the whole set.

So there is exactly one mapping table, in one place, and every public attribute goes through
it: `tw` to `zh-TW`, `zh` to `zh-CN`, and so on.

## `mw` is the article's language, not a language

`mw` means _the original_, and which language that is depends on the article. Today every
article is Chinese; the next one may not be.

So `<html lang>` and `og:locale` for the original view come from the article's own `lang`
frontmatter, never from the code. A code that resolves to a different tag per article is fine
as an internal name and fatal as a public one, which is the same rule as above arriving from a
different direction.

That frontmatter value is validated as a BCP-47-shaped language tag when the source article is
read. A malformed value fails the build once, with the source file named; it must never travel
unvalidated into every original-view public attribute.

### New interface copy for `mw` is written in English

An article's original view is whatever language the article was written in. The interface around
it is a separate question, and it is **mostly English**: English carries it, with some Chinese and
some Japanese mixed in where the owner preferred it that way.

The mix is the owner's and is made string by string, which is why the rule here is only about new
ones: **a message added to `mw` takes the English wording**, the same as under `en`. Whoever wants
one of them in another language changes that one. So a handful of Chinese entries in `mw.json` is
the file working as intended and not a gap to fill in -- somebody chose each of them -- while a
`mw` catalogue that had drifted mostly into Chinese would be the mistake.

The default settles the case that keeps coming up: who decides the wording of a message nobody has
an opinion about yet. English, so a message added today is legible rather than a guess at the mood
the original was in.

## Canonical points at the version being read

Each view starts with its own canonical: the original at the bare URL, every other language at
its `?lang=` form. Ranking weight then accumulates where the content actually is instead of
being handed to a version the reader never asked for, subject to the same-language deferral in
[views.md](views.md).

The `hreflang` set accompanies every view: the eight locales, plus `x-default` pointing at the
bare URL. Canonical alone says "this is the address of this page"; it does not say "these pages
are translations of one another", and without that a crawler is left to guess from content it
has already decided is similar.

**`mw` is the `x-default` and never an `hreflang` value of its own.** Its tag would have to come
from the article's frontmatter, and that tag always duplicates whichever locale matches it —
`zh` beside `zh-CN` for a Chinese article, `en` beside `en-US` for an English one. Worse, it is
the honest position: an article that deliberately mixes languages has no single one to claim,
and `x-default` already means the version to serve when nothing else matches.

The original stays reachable by `?lang=mw` and through the language switcher. It stops making a
claim about its language; it does not stop being served.

## The sitemap lists addresses, not language codes

The sitemap emits one `url` entry per distinct canonical URL. It does not assume that nine
codes produce nine entries: when a translation defers to the original, both codes share the
bare address and only one entry is emitted for it.

Every article entry carries the complete `xhtml:link` alternate set, including its own URL and
`x-default`. The set is the same one the page head receives from `indexingMetadata`; the
sitemap never reimplements similarity, canonical selection, or the internal-code mapping. A
set that omits its own member, or disagrees with the page head, is invalid as a whole rather
than partially useful.

## Atom puts its language in the URL

The bare `/atom.xml` is the original feed. Each translation is `/atom.xml?lang={code}`, using
the same internal codes as article pages. Atom reads that parameter and nothing else. An
unknown value falls back to `mw`; cookies and `Accept-Language` are deliberately invisible to
the route so they cannot make one cached URL contain different readers' content.

The feed and every entry declare the BCP-47 language of the view actually served. Entry titles,
summaries and bodies come from that resolved view, including translated frontmatter. A page's
feed-discovery link names the same code as the page, so subscribing from a translated view
selects its translated feed.

## HTML is never cached; assets still are

The response body for a page depends on a cookie, so **HTML is served with `Cache-Control:
private, no-store`**. A cached page is a page some other reader's language is about to be
served from. Atom is the deliberate opposite: its language is wholly in the URL, so it remains
`public, max-age=360, s-maxage=360` and is safe in shared caches.

This is the deliberate exception to the rule in [fonts.md](../architecture/fonts.md) that a
hashed name is cached for a year. HTML carries no hash in its name, so it was never covered by
that rule; saying so here is what stops a later reader from assuming the general case applies.
Everything the page references — images, fonts, styles — keeps its usual lifetime, because none
of it varies by language.

The site worker is not a cache tier and does not need to be. Articles are compiled into it at
build time with all nine views present, so a request is a lookup and a return; there is no
origin to protect and nothing expensive to avoid repeating.
