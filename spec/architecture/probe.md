# `probe` and `status.canmi.app`: the platform seen from outside

`apps/probe` checks the platform the way a visitor meets it, and `status.canmi.app` shows what it
found. The checking is a Rust service on the node -- later on the VPS too, a second place to look
from -- because what it checks is more than a request: a name resolving, an API answering what it
should, a page rendering without an error. The showing is a SvelteKit app on Vercel that reads a
Neon database the probe writes to. Neither the showing nor the path between them touches
Cloudflare, so a Cloudflare outage is something the page reports rather than something it shares.

## What is checked

**Checks are declared in the repository**, `apps/probe/checks.toml`, each a kind, a target and what
is expected of it:

- **`dns`**: a name resolves, through Cloudflare's resolver and Google's alike, to what it should.
- **`api`**: a public URL answers with the status expected, the envelope's `success`, the fields a
  check names, within a time.
- **`page`**: a page renders as a visitor would see it, with no script error and no failed request,
  and with what the check names on it -- asked of `shot` on our own lane, whose capture reports a
  page's errors, failed requests, status and title from a real Chromium. The probe holds no browser.

Each round runs every check, from outside in: through the public names, as a visitor's request
goes.

## Where the results go, and how often

A round runs every minute, and every round is recorded **in the ledger**, whole: each round a task
and each check an event on it, so the panel shows a failure's full timeline. See
[ledger.md](ledger.md). What leaves the node follows what is happening:

- **A live feed, while Cloudflare carries it.** The status page opens a Server-Sent Events stream
  from the probe through the public API host and shows each round as it lands. SSE and not a
  WebSocket, because every hop is documented to carry a streamed response -- a Worker streams for
  as long as the client stays, and Caddy flushes `text/event-stream` as it arrives -- while a
  WebSocket through a Workers VPC binding is documented neither way. The stream answers
  `Cache-Control: no-store`, so the gateway never tries to keep it, and Caddy's compression leaves
  `text/event-stream` alone, since an encoder buffers what it compresses. Whether anyone is watching is the
  number of streams open; nothing else has to say so.
- **Neon, merged hourly, while everything is well**: the rounds of the hour in one write, per round
  and check -- passed or not, how long, one line of why. It is what the page renders before its
  stream connects, and all it has if the stream cannot. Neon's free plan bills a database for the
  time it is awake and puts it to sleep after five idle minutes, so an hourly write keeps it asleep
  nearly always.
- **Neon every five minutes while a public check fails, and for an hour after it recovers.** The
  probe knows the public path is failing without being told: its own checks through the public
  names say so. That is when Cloudflare -- and so the live stream -- may be down, and when people
  come to look; the page then shows rounds at most five minutes old, and says the live feed is
  unavailable, which is itself the sign of where the fault is. Outages are rare enough that their
  writes do not strain the free plan.

## The page

**`status.canmi.app` renders from Neon, then follows the live feed, and says when the probe has
gone quiet.** A result older than its cadence allows is shown as the probe silent -- the node, its
link, or the probe itself -- rather than as the last thing it said. Neon is read on the server with
the page cached, so a view does not wake it. The page names the second place once the VPS runs a
probe: two places agreeing that a name fails is Cloudflare, one place failing alone is that place.

**Its name resolves through Cloudflare, and that is accepted**: the zone is Cloudflare's like every
other here, and moving one name out is more to keep than the outage it would survive. When
Cloudflare's DNS itself is down the page is still at its Vercel address, `*.vercel.app`, which the
page names in its footer so it is known before it is needed.
