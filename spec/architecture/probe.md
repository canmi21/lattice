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
  renders -- every article's -- is asked once a minute, through `shot`, whose capture reports a
  page's errors, failed requests, status and title from a real Chromium. The probe holds no
  browser. Outside checks are the chain working, not availability; they cost more and run slower.

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
  tables' size, and past 300 MB shortens the coarsest, oldest window first until it fits again.
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
- **To the ledger**, for what fails: a failing check opens a task with each check's events on it,
  so the panel shows a failure's full timeline. Passing rounds are counted, not recorded one by one
  -- a second's round is far more than the ledger is for. See [ledger.md](ledger.md).

## The page

**`status.canmi.app` renders on the server from Supabase, read-only, and says when the probe has
gone quiet.** A result older than a few rounds is shown as the probe silent -- the node, its link,
or the probe itself -- rather than as the last thing it said. The page reads through supabase-js with the
anon key, which is granted `SELECT` on the status tables and nothing else, under a row security
policy that lets it read every row: the grant is what makes it read-only, whatever else changes. It names the second place once the VPS runs a probe: two places agreeing
that a name fails is Cloudflare, one place failing alone is that place.

**Its name resolves through Cloudflare, and that is accepted**: the zone is Cloudflare's like every
other here, and moving one name out is more to keep than the outage it would survive. When
Cloudflare's DNS itself is down the page is still at its Vercel address, `*.vercel.app`, which the
page names in its footer so it is known before it is needed.
