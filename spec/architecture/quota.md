# `quota`: how often one subject may call one route

Every limit here is counted by one service, `quota`, and nothing else counts. A gateway or a Worker
that limits a route asks `quota` whether the call may pass; none keeps a counter of its own, and
none uses Cloudflare's rate limiting binding. Where a limit is declared, and the layers above and
below this one, is [services.md](services.md), "A limit is declared once and kept in three places".

## A limit is a bucket

**A row allows a burst at once and a steady rate after it.** Each row names `burst`, how many calls
may come together, and `count` in `seconds`, the rate at which room comes back. Over any stretch of
time `T`, a subject is let through at most `burst + T * count / seconds` times: a short crowd is
admitted whole, and the long run is held to the rate all the same. `burst` left out is `count`.

```toml
[[api.limits]]
methods = ["GET", "HEAD"]
path = "/address"      # as the service sees it, after the version
count = 60             # room comes back at 60 calls
seconds = 60           #   in 60 seconds, 1 to 86400
burst = 20             # at most 20 at once; `count` when left out
```

**The arithmetic is GCRA, the generic cell rate algorithm**, which admits exactly what a token
bucket would while keeping one number per key: the moment the next call is due. A sliding log of
every call, which the gateway kept first, holds up to `count` moments per key and refuses a burst
the rate would have paid for. A refusal says when a call would next pass, to the second, as
`Retry-After`.

**The arithmetic is written once**, as a pure function in `libs/limits`, and every deployment of
`quota` calls it. Two copies of a counting rule would come to disagree about who is over.

## A key names the service, the route and the subject, never a host

**A key is the service's code, the row's methods, the row's path and the subject**:
`shot_post_tasks_198.51.100.7`, lowercase, as everything the dashboard shows here is. The
hostname a call came in on is not part of it, nor is the version: `api.monoflake.com/v1/shot/...`,
`shot-rdu-int.ixc.one/v1/...` and a retired host's spelling of the same route fill one bucket, and so
does every version of it, since a row's path is written after the version. No spelling of an
address and no change of version is a way round a limit.

**The subject is the caller's address until there are accounts, and the account after.** An IPv4
address counts whole. An IPv6 address counts by its `/64`, the block one machine is usually given,
so a caller cannot step round its limit by changing the last half of its address. When the account
system issues tokens, a signed-in caller's subject is the account, and the key keeps its shape.

## Deployed twice, counted where a request enters

**`quota` is one service with two deployments, as the gateway is.** On Workers its counts are
Durable Objects, one per key, one class in `quota`'s own Worker: the one place every location
agrees on, which is why Cloudflare's rate limiting binding, counted per location, is not used --
an address whose calls land in three locations was allowed three times as much, no closer than the
firewall's floor. On the node it is a Node container whose counts are memory in one process, which
is the same single place there. Neither writes anything down: a count lost to an evicted object or
a restarted process is a window started again, which a limit can afford.

**A call is counted once, by the gateway it entered.** The internal gateway counts what the LAN asks
against the node's `quota`; what it passes on to a service on Workers carries `INTERNAL_TOKEN`, and
the public gateway does not count it again -- it would see only the node's address, every caller in
the house in one bucket. See [gateway.md](gateway.md), "Inside the house, the same names answer
locally".

**What a deployment counts is its own.** The LAN's subjects never reach the public deployment's
buckets, nor the public's the node's; there is no sharing between them to keep in step.

## Two doors: one inside, and one held for later

**The inside door is a binding's.** `quota`'s Worker exports a named entrypoint whose `take(key,
row)` answers `{ allowed, retryAfter }`; a Worker reaches it by service binding, which costs nothing
beyond the Durable Object request it makes. On the node the same call is an HTTP request on the
node's own network. The inside door takes any key, so nothing outside the platform reaches it.

**The outside door is not open until there are accounts.** `quota` is declared `public = false`, so
the gateway's table does not know it and no host answers it. Opening it to a third party anonymously
would open the keys: whoever chooses a key can spend somebody else's bucket, or read how much of it
is left. Its HTTP door opens when a caller's namespace can be fixed to the caller's account -- its
routes declared with `auth`, and the service made public, a change to its declaration and nothing
else.

**The gateway may both depend on `quota` and pass callers on to it.** The gateway asks the inside
door, by binding, whether a call may pass; a third party's call to the outside door is first
counted that way and then forwarded to the HTTP door -- two calls by binding, one after the other,
and never a circle through a public host. The alias layer is the same arrangement already: behind
the gateway, and asked by the gateway for its own marks.

## A caller depends on it softly

**A `quota` that fails lets the call through**, logged, with the firewall's rate rule beneath it:
the limit is a guard, and the guard being down is not a reason to refuse the platform. A binding
that is missing refuses instead, since that is a deploy that went wrong, and letting everything
through would hide it.

## Who asks

- **Both gateways**, for every route of a service that declares rows.
- **A Worker's own routes**, which its pages call without the gateway: the site's, in
  `apps/site/server/src/contract/limits.ts`, in the same row format.
- **Caddy on the node** keeps a sliding window under the rows, as a floor for the moment `quota`
  fails, at `burst + count` calls in `seconds` -- the most a bucket ever admits in that window, so the
  floor never refuses what the bucket allows. Caddy's limiter has no bucket of its own.
