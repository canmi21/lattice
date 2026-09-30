# `probe` and `status.canmi.app`: the platform seen from outside

`apps/probe` checks the platform the way a visitor meets it, and `status.canmi.app` shows what it
found. The checking is a Rust service on the node -- later on the VPS too, a second place to look
from -- because what it checks is more than a request: a name resolving, an API answering what it
should, a page rendering without an error. The showing is a SvelteKit app on Vercel that reads a
Supabase Postgres database the probe writes to. Neither the showing nor the path between them touches
Cloudflare, so a Cloudflare outage is something the page reports rather than something it shares.

## What is checked, and how often

**Checks are declared in the repository**, `apps/probe/checks.toml`, each a kind, a target, what is
expected of it, and how often -- set by what the target is and how much it matters, not by one
beat for everything. They fall into two kinds, and it is the first that finds a fault first.

- **Inside**: each service asked directly on the private side, or on its socket -- `/health` and
  the cheapest real answer it gives -- as often as every second. This is availability, and it
  catches a fault before a visitor meets it.
- **Outside**: the whole chain a visitor's request takes, through the public names and Cloudflare,
  end to end. A route that costs nothing but CPU, `geo`'s, can be asked every second; a page that
  renders -- every article's -- is asked once a minute, through `shot`'s private scope with
  `fresh=true` so each round is a capture of its own, which reports the page's errors, failed
  requests, status and title from a real Chromium. The probe holds no browser. Outside checks are the chain working, not availability; they cost more and run slower.

**A check has a name a reader understands**, `name` in `checks.toml` -- "Scheduler", "Site DNS" --
beside its id, which stays the probe's and the ledger's. The probe writes it with the rest of the
check, and the page shows it and never the id or the target.

**A check's target names an address rather than spelling it**: a `libs/urls` constant's name,
`API_PRIVATE` or `API_PUBLIC` for the API host's two sides, followed by a path or a query as it
needs -- `API_PRIVATE/geo/health` -- so `checks.toml` holds no address that could drift from the
one the rest of the platform uses. The target is kept and shown as written, never resolved.

A check's kind is one of `dns` (a name resolves, through Cloudflare's resolver and Google's alike,
to what it should), `api` (a URL answers with the status expected, the envelope's `success`, the
fields a check names, within a time), `page` (as above) and `health` (a service's own health path).

**The probe passes the limits it is checking through with a token of its own**, `x-probe`, which
Cloudflare's rate rules and the gateway's counters both leave uncounted: the probe asks far more
often than a visitor may, and counting it would make the limits fail the thing they protect. The
token is a secret; the rule files carry a placeholder the sync fills from the repository's secrets,
per [firewall.md](firewall.md), and the gateway reads it from its own.

## Where the results go

Every result is written three ways:

- **To Supabase, thinned as it ages, within a budget of 300 MB** of the free plan's 500: each
  result at its own rate for the last ten minutes, by the minute for a day, by five minutes for a
  week, by ten for a month, by thirty for three months, and by the hour for a year -- each step a
  summary of the one before (passed, failed, and the time taken at its median and worst), and every
  window rolling. A check asked every second keeps some twenty-one thousand rows across them, about
  3 MB, so the budget holds some ninety such checks, and more of those asked less often. The number
  of checks will change, so the budget and not the windows is the rule: the probe measures the
  tables' size, and past 300 MB shortens the coarsest, oldest window first -- once for each time
  the size grows past both the budget and what it measured when it last shortened, since Postgres
  reuses the space a delete frees rather than handing it back, and a size that never falls would
  otherwise shorten every window to nothing.
  Nothing is lost by it, since the archive below keeps everything. The probe writes in batches
  every ten seconds and thins as it goes. Supabase's free database is always running rather than billed by the time it is awake --
  Neon's was, and a page reporting every second never lets a database sleep, so what Neon saves
  could never be had here. The probe writes through Supabase's session-mode pooler on port 5432,
  with TLS required and one long-lived connection: the direct address is IPv6 alone on the free
  plan, and the node reaches the pooler over IPv4. Supabase keeps no backups on this plan, and none
  are needed: what it holds is a window on what the node keeps.
- **To the probe's own SQLite, whole and for good**: every result as it was, the archive, which
  the node's disk holds. It is answered read-only on the `probe` scope of the public API host,
  through Cloudflare -- **the one route an outside service of ours calls over the public API**,
  since Vercel and Cloudflare share nothing and the status page's history has to come from
  somewhere. When Cloudflare is down, that history is what the page goes without.
  The scope answers `GET /checks`, every declared check; `GET /results?check=&since=&until=`,
  one check's results oldest first, `since` inclusive and `until` exclusive, whole seconds since
  the epoch and at most a day apart, at most ten thousand a page with the next page's `since` said,
  as `{ place, results: [{ at, ok, duration_ms, detail }], next }`; and `/health`. Each is the
  envelope, kept a minute by the gateway; a check not declared is `404 no_such_check`.
- **To the ledger**, for what fails: a failing check opens a task with each check's events on it,
  so the panel shows a failure's full timeline. Passing rounds are counted, not recorded one by one
  -- a second's round is far more than the ledger is for. See [ledger.md](ledger.md).

**The page draws ninety days, a bar a day**, from the `status_daily` view: each check's passed and
failed rounds summed per UTC day from the hourly rollups, which are kept a year. A day with no rows
is drawn empty; today's bar grows from what the broadcasts carry. **A bar's color is how long the
check was down that day, on a line**: its failed rounds times its interval, with green at none,
amber at an hour and red at twelve, and the color between two stops mixed in proportion. A day with a
minute's blip is all but green, one with a bad afternoon is plainly amber, and a day lost is red --
the eye reads how bad, not only whether.

## The schema: declared once, in Drizzle, applied by the probe

**The tables and views are written once, in TypeScript with Drizzle, in `libs/status-schema`**,
and nothing else describes them. `drizzle-kit generate` turns them into SQL migrations, committed
beside them; the grants and row policies are declared there too, so what the database allows is
what the repository says. `mise run verify` fails when the schema has changed and its migrations
were not generated again.

- **The probe applies them and writes, in Rust alone**, with sqlx: at start it runs the
  migrations it has not yet run, then writes as the database's owner over the pooler. It is the one
  writer, so the schema is its to move forward. No Node runs on the node for it.
- **The page takes its types from the same schema**, by Drizzle's inference, and reads the views,
  which are the contract between the two: a table may be split, thinned or renamed behind a view,
  and the page does not change. Drizzle does not run where the page renders; reading needs nothing
  PostgREST cannot say, and the day it does is a view more, or a function.

## The page: one app, three doors

**The status page is one SvelteKit app, built for three places by an environment variable**:

| Door                | Served by                                                               | For                                            |
| ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| `status.canmi.app`  | Vercel                                                                  | the one address, the one a search engine keeps |
| `canmi.vercel.app`  | Vercel, a second name on the same project                               | reaching it while Cloudflare's DNS is down     |
| `canmi.app/status/` | Cloudflare, a scope of the platform built with `paths.base = '/status'` | the page inside the platform's own name        |

Every door renders the same page from Supabase, read-only, and names `status.canmi.app` as its
canonical address, so three doors are one page to an index. Its bar carries the platform's links on
every door, so a visitor who arrives at the status page is one click from the rest of `canmi.app`.
The variable picks the adapter -- Vercel's or Cloudflare's -- the base path and nothing else.

**Its icon is an SVG in the objects bucket, named by its content id** and served by the CDN, so it
is kept a year and never stale; while Cloudflare is down the page goes without it.

**It connects early to its fonts, our hosts and its database, and only resolves its analytics'**,
as [hints.md](hints.md) declares for it.

**It is styled as the site is**: the three layers of
[css/layers.md](css/layers.md) with its own StyleX build, `motion` for what moves, and the `mono`
palette -- see [palettes.md](../styling/palettes.md).

**`status.canmi.app` is a DNS-only record pointing at Vercel**, not proxied: `*.canmi.app` is
behind Access, and Access stands only in front of proxied names, so the status page stays public
and never passes Cloudflare's proxy. When Access becomes a list of what is let through, this is on
it.

**The page reads PostgREST with the anon key, from views alone, once; after that it is told.** The
first screen is rendered where the page is served -- Vercel's function, or the Worker -- by a `load`
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

**Its name resolves through Cloudflare's DNS, and that is accepted**, since `canmi.vercel.app`
does not: when Cloudflare's DNS is down, that door is still open, and the page names it in its
footer so it is known before it is needed.

## Open

- **`status.canmi.app` answers `307` to `canmi.vercel.app` for now**, set in Vercel, while the page
  is redesigned; once it is, the redirect goes and the canonical address serves the page again, the
  one an index keeps.
- **A second place shares `checks` with the first.** A check's row is keyed by its id alone, so a
  probe on the VPS declaring the same checks would overwrite the node's; the key gains `place`
  when the second probe is written.
