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
platform/libs/sdk from having been read out of them, where every address this repository resolves is
declared.

All three carry `dns-prefetch` rather than `preconnect`. A preconnect opens a socket and
negotiates TLS before the first paint, which is the wrong trade for all three: the loader is
deliberately `fetchpriority="low"`, and the two reporting addresses are not contacted until the
reader already has the page. The lookup is the part that is slow on a cold cache and it is the
part worth buying; the handshake would compete with the article for the one thing a first paint
is short of. The tags, and the loader's priority, are `@canmi/hints`' `analytics` group at its default --
see [hints.md](architecture/hints.md).

## Neither service is self-hosted, and analytics of our own comes later

**Self-hosting umami and OpenPanel was given up.** Running a vendor's image beside the platform
meant adapting the platform to it -- a scope it could not version, a database it alone used -- for a
count the two clouds already give. The site keeps reporting to both clouds with their official
clients. Analytics worth owning will be built here, into the platform, as a service like the rest,
rather than borrowed and adapted.

## A page is its path and query, never its hash

**Both umami tags carry `data-exclude-hash="true"`.** Without it umami reports the full address,
so `/post#intro` and `/post#notes` count as two pages, and following an anchor inside a page
reports a fresh view: SvelteKit records the jump with `history.replaceState`, and umami counts a
view whenever `pushState` or `replaceState` changes the address it would report. With it the hash is cut before both the report and that comparison, so an
anchor is free to use and a page keeps one row. umami sends one request per view and has no
batching to turn on; what ran together here is the address, and that is the part fixed.

OpenPanel on the site still counts the hash: its views compare the full address. Its option
`trackHashChanges` only adds `hashchange` as a trigger, and cutting the hash would take a
`filter` that rewrites the event. Not done; see Open.

## Open

- **OpenPanel still reports an anchor followed on the site as a view of its own**, with the hash in
  its path. Whether to rewrite its events or leave it until the site keeps one service is undecided.
