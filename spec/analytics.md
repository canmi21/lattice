# Analytics

Two services currently count visits to the site: umami and OpenPanel. Nothing here argues for
that number. The rules below are what they must agree on while it holds.

Cloudflare Insights was a third and has been removed. Its beacon was injected into every page
from the layout, which is one more third-party script in the critical path for a count the
other two already keep.

## Development loads the client and reports nothing

A dev session runs the same wiring production does, and sends no hits. Not loading the client
in development would be simpler and is wrong: the parts that break are the ones only exercised
by loading it -- a `data-track` attribute that names an event nobody registered, an outgoing
link handler that never binds. Those surface on a page you are looking at, or they surface in
production.

How each one is held to it, since no two offer the same switch:

| Service   | Mechanism                                    |
| --------- | -------------------------------------------- |
| umami     | `data-domains="canmi.net"` on the script tag |
| OpenPanel | `filter: () => !dev`                         |

Both hold to the rule from inside the client. Cloudflare Insights could not: its beacon took no
filter hook, so the only control was whether the tag rendered at all, and it was the one service
here that had to be kept out of a dev page rather than told to stay quiet on one. That is not
why it was removed, but it is why it never fitted.

**The umami tag carries a second attribute, and this file had never recorded it.**
`data-exclude="/@/*"` keeps the site's internal namespace out of the count -- the same prefix
[robots.txt](../apps/site/src/routes/robots.txt/+server.ts) disallows, for the same reason: `/@/`
is not the published site, and a request under it is not a reader arriving at an article. It is
listed here rather than in the table because it is not a development switch: it holds in
production too, and a dev session is already silent by the row above. The code settled this and
the rules are only now catching up with it.

**For OpenPanel, `filter` is the only option that does this.** `send()` consults it before the
queue check and resolves immediately when it returns false, so the payload is dropped rather
than held. `disabled` looks like the same thing and is not -- it queues events and flushes the
backlog on `ready()`, which turns a dev session into a delayed batch of real-looking traffic.
Verified against SDK 1.3.1 by probing both branches: `dev` gives zero network calls and zero
queued events, production gives one call per event.

Every reporting path in that SDK -- `track`, `screenView`, `identify`, the group calls -- funnels
through the one `send()`, so the filter is a complete boundary and not a list to keep current.

## The client id is public, the client secret is not in the repo

An analytics client id ships in the browser bundle and is readable from devtools by anyone who
loads the page. It goes in plain source next to a note saying so, per the rule in
[toolchain.md](toolchain.md). What restricts its use is the CORS origin list configured on the
service, not obscurity.

The OpenPanel **client secret is absent from the repository entirely** rather than stored
encrypted and unused. It is only required for server-side events, and this site sends none. A
credential stored before anything needs it is one more thing to rotate and one more way to be
wrong about what is in use.

The derived `MCP_TOKEN` some services hand out is not stored either -- it is
`base64(client_id:client_secret)`, so keeping it is keeping a second copy of a credential that
will not be updated when the first one rotates. Recompute it when it is needed.

## Session replay stays off

It records what a visitor did rather than counting that they came. That is a different bargain
with the reader than page counting, and turning it on is a decision that belongs here in
writing, not a commented-out block in a config.

## The analytics hosts are resolved early, not connected early

Three hosts serve the two counters: `cloud.umami.is`, which the loader is fetched from, and
`gateway.umami.is` and `api.openpanel.dev`, which the two clients report to. Neither reporting
host is written in this repository's own code -- umami's is a constant inside the script it
downloads and OpenPanel's is the default baked into `@openpanel/sdk` -- so both are recorded in
libs/urls from having been read out of them, where every address this repository resolves is
declared.

All three carry `dns-prefetch` rather than `preconnect`. A preconnect opens a socket and
negotiates TLS before the first paint, which is the wrong trade for all three: the loader is
deliberately `fetchpriority="low"`, and the two reporting addresses are not contacted until the
reader already has the page. The lookup is the part that is slow on a cold cache and it is the
part worth buying; the handshake would compete with the article for the one thing a first paint
is short of.

## umami, self-hosted, for the pages that matter less

**`apps/umami` is the upstream umami image at a pinned version**, with `[postgres]` for its one
database -- see [databases.md](architecture/databases.md) -- and its `APP_SECRET` set once through
host. Its dashboard is `umami.canmi.app`, behind Access. What a page reports to is the `umami`
scope of the public API host, which the gateway opens only as far as a reporting page needs:
`POST /api/send`, every other path refused there, so nothing of the dashboard's API is public.
Reports are never cached, and one address may report sixty times a minute. umami reads the
visitor's address from the header the gateway forwards it in.

**A page loads umami's own tracker from its cloud, as the site does, and reports here** with
`data-host-url` set to that scope: the script is the same program either way, so no path of ours
serves it. `data-domains` names the page's production hosts, so a development page stays silent,
per "Development loads the client and reports nothing". The site does not: it
reports to both clouds as it did, since its own `umami.track()` calls reach only the first tracker
a page loads, and a second count missing its events would look whole and not be.

## Open

- **OpenPanel is self-hosted on the node once ClickHouse runs there**, from a ClickHouse built here
  for ARMv8.0 -- see [databases.md](architecture/databases.md). umami comes first, self-hosted with
  Postgres alone, for the pages that matter less; the site keeps reporting to both clouds until a
  self-hosted one has earned it.
