# The status page

`status`, the page that shows the platform from outside. What it shows is the platform's probe, its
checks and the schema they are written in, in platform's `spec/architecture/probe.md`; the page is
this repository's, and moved here from that file with the split.

## The page: one app, served by Vercel

**The status page is one SvelteKit app, deployed to Vercel alone**, under two names:

| Name               | For                                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| `status.canmi.app` | the one address, the one a search engine keeps                                 |
| `canmi.vercel.app` | Vercel's own name for the same project, reached while Cloudflare's DNS is down |

Both render the same page from Supabase, read-only, and name `status.canmi.app` as its canonical
address, so the two are one page to an index. Its bar carries the platform's links, so a visitor
who arrives at the status page is one click from the rest of `canmi.app`. It is not built for
Cloudflare: a page that reports whether the platform is up is served from outside it.

**It reads the Supabase pair as `SUPABASE_URL` and `SUPABASE_ANON_KEY`, or with a `PUBLIC_`
prefix, the bare name first.** mise decrypts the pair bare from `secrets.json`, and Vercel sets it
prefixed, because SvelteKit hands the browser only a `PUBLIC_` name and the browser opens the
Realtime socket with the key. `vite.config.ts` copies a bare name over the prefixed one, so a
development server needs nothing set by hand. It runs as `dev-status`, in the base session, on 26522.

**Its icons are the `status` scope's marks** in `data/record/symlinks.json` -- the ICO, the SVG, the two
PNGs and the touch icon, each derived from the one SVG -- which the page answers at its own `/{file}`
by following the alias layer; see platform's `spec/architecture/delivery.md`, "A page follows the
name for the browser". While Cloudflare is down
the page goes without it.

**It connects early to its fonts, our hosts and its database, and only resolves its analytics'**,
as [hints.md](hints.md) declares for it.

**It is styled as the site is**: the three layers of
[css/layers.md](css/layers.md) with its own StyleX build, `motion` for what moves, and the `mono`
palette -- see [../styling/palettes.md](../styling/palettes.md).

**`status.canmi.app` is a DNS-only record pointing at Vercel**, not proxied: `*.canmi.app` is
behind Access, and Access stands only in front of proxied names, so the status page stays public
and never passes Cloudflare's proxy. When Access becomes a list of what is let through, this is on
it.

**The page reads PostgREST with the anon key, from views alone, once; after that it is told.** The
first screen is rendered where the page is served, in Vercel's function, by a `load`
that asks through `@supabase/postgrest-js`, not the whole of supabase-js, since reading is all it
does; so the page arrives whole, which is what an index reads, and a render is kept at the edge for
a few seconds. Once hydrated it asks nothing on a timer: **the database broadcasts each batch the
probe writes**, on the public Realtime channel `status`, from a statement trigger on `results` that
calls `realtime.send` with every check's latest result in the batch, and the page listens over one
WebSocket through `@supabase/realtime-js`. A broadcast is Realtime's own, not a change feed, so it
needs no grant on any table: the database says what is sent, and the anon key hears only that. The
page folds each result into the half-hour it falls in and asks the history view again only when a
half-hour closes; a reconnected socket asks for `status_now` once, for what it missed. The broadcast
is the heartbeat as well -- one every ten seconds while the probe writes -- so a page that hears
nothing for a few rounds shows the probe silent, which is the truth it should tell. The anon key is granted `SELECT` on the status views and nothing else --
no table -- under a row security policy that lets it read every row: the grant is what makes it
read-only. A result older than a few rounds is shown as the probe silent -- the node, its link, or
the probe itself -- rather than as the last thing it said. It names the second place once the VPS runs a probe: two
places agreeing that a name fails is Cloudflare, one place failing alone is that place.

**A tab left hidden stops listening.** Thirty seconds after it is hidden the page closes its socket
and stops its clock; shown again, it asks for the latest rounds and the history it missed, then
listens. The probe writes at its own rate whoever watches, so what a background tab spent was
Realtime's: a held connection and each broadcast delivered to it, which the project's quota counts.
A glance at another tab costs nothing, since the grace outlasts it.

**Its name resolves through Cloudflare's DNS, and that is accepted**, since `canmi.vercel.app`
does not: when Cloudflare's DNS is down, that door is still open, and the page names it in its
footer so it is known before it is needed.

## Errors go to Sentry

**Each app that reports errors has its own Sentry project and its own DSN, declared in
`@canmi/me/urls` and read as `URLS.external.sentry.<app>`** -- `site`, and `status` for this page. A DSN only
sends, and a browser bundle carries it, so it is public and sits beside the other URLs. An app
whose DSN is absent initializes nothing and registers no Sentry request handle; the status page
then drops the build plugin as well.

**What the apps share is `@canmi/web/sentry`**: the upload decision, the `sentrySvelteKit` options,
and the client and server init. **Source maps upload only when `SENTRY_AUTH_TOKEN` is set**, and
are deleted after the upload; without it the build emits none and skips silently.
`SENTRY_SKIP_UPLOAD` turns the upload off locally, as [data.md](data.md) records under "A CI
build compiles the site, and no longer compiles the corpus". The site alone fails a CI build that lacks the token, since that build is the one
deployed; the status page is built on Vercel, where the token may not exist.

**Development initializes the SDK and sends nothing**: every integration is installed, and the
transport drops what it is handed -- the rule [../analytics.md](../analytics.md) states under
"Development loads the client and reports nothing". `enabled: false` would install no
integrations, so capture would go unexercised.

The page's server takes the same handles the site does, from `@canmi/web/sentry/server`; Vercel's
function runs the SDK's `node` build, which initializes on the first request.
