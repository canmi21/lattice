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

**A key is the service's code, the row's methods, the row's path and the subject, kind and value**:
`shot_post_tasks_address-198.51.100.7`, lowercase, as everything the dashboard shows here is. The
hostname a call came in on is not part of it, nor is the version: `api.monoflake.com/v1/shot/...`,
`shot-rdu-int.ixc.one/v1/...` and a retired host's spelling of the same route fill one bucket, and so
does every version of it, since a row's path is written after the version. No spelling of an
address and no change of version is a way round a limit. The subject's kind is spelled in the key, so
an account's identifier and an address can never name the same bucket.

**A row counts one kind of subject, named by `subject`, and a route may have a row of each.** A call
is let through only when every row that covers it does: one device asking for many accounts meets
the address's row, one account asking from many devices meets the account's. Two rows of the same
kind covering one call are refused when the table is generated; rows of different kinds stack.

| `subject` | Counts                                                  | A key's subject               |
| --------- | ------------------------------------------------------- | ----------------------------- |
| `address` | the caller's address: IPv4 whole, IPv6 by its `/64`     | `address-198.51.100.7`        |
| `account` | one account, over all its sessions and devices          | `account-{account}`           |
| `session` | one signed-in session, inside the account it belongs to | `session-{account}.{session}` |

**Only `address` is accepted until there are accounts**, as `auth` takes `"none"` alone, and it is
what a row without `subject` counts. An IPv6 address counts by its `/64`, the block one machine is
usually given, so a caller cannot step round its limit by changing the last half of its address. A
call that carries no subject of a row's kind -- nobody signed in, for an account's row -- is not
counted by that row. When the account system issues tokens, the gateway reads the account and the
session out of the credential and the rows for them start counting; no key, call or store changes.

```toml
[[api.limits]]          # one device
methods = ["POST"]
path = "/tasks"
subject = "address"     # what a row without `subject` counts
count = 60
seconds = 60

[[api.limits]]          # one account, from however many devices
methods = ["POST"]
path = "/tasks"
subject = "account"
count = 300
seconds = 60
```

**The buckets of one call are taken in order, and the first refusal ends it.** `address`, then
`account`, then `session`: each is taken as it is reached, and a refusal leaves the ones after it
untouched and answers with its own `Retry-After`. What was taken before a refusal is not given back,
so a refused call may have spent the address's room -- a limit that errs strict, never loose, at one
Durable Object request a bucket. Checking every bucket before taking any would cost two requests a
bucket and still race between them, since the buckets are separate objects. The address comes first
so that one device cycling through accounts is stopped there, before it spends any account's room.

## Deployed twice, counted where a request enters

**`quota` is one service with two deployments, as the gateway is.** On Workers its counts are
Durable Objects, one per key, one class in `quota`'s own Worker: the one place every location
agrees on, which is why Cloudflare's rate limiting binding, counted per location, is not used --
an address whose calls land in three locations was allowed three times as much, no closer than the
firewall's floor. On the node it is a Node container whose counts are memory in one process, which
is the same single place there, reached as every service at home is: through Caddy, on its inside
side, which nothing but a holder of `INTERNAL_TOKEN` reaches. Neither writes anything down: a count lost to an evicted object or
a restarted process is a window started again, which a limit can afford.

**A call is counted once, by the gateway it entered.** The internal gateway counts what the LAN asks
against the node's `quota`; what it passes on to a service on Workers carries `INTERNAL_TOKEN`, and
the public gateway does not count it again -- it would see only the node's address, every caller in
the house in one bucket. See [gateway.md](gateway.md), "Inside the house, the same names answer
locally".

**What a deployment counts is its own.** The LAN's subjects never reach the public deployment's
buckets, nor the public's the node's; there is no sharing between them to keep in step.

## Two doors: one inside, and one held for later

**The inside door is a binding's.** `quota`'s Worker exports a named entrypoint whose `take` is
given every key and row of one call, in order, and answers once, `{ allowed, retryAfter }`; a Worker
reaches it by service binding, which costs nothing beyond the Durable Object requests it makes. On
the node the same call is `POST /take` with the checks as its body, on Caddy's inside side, and
`quota` declares that side alone, so neither the LAN's API host nor the tunnel's carries it. The
inside door takes any key, so nothing outside the platform reaches it.

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
  `apps/site/api/src/contract/limits.ts`, in the same row format.
- **Caddy on the node** keeps a sliding window under the `address` rows, as a floor for the moment
  `quota` fails, at `burst + count` calls in `seconds` -- the most a bucket ever admits in that
  window, so the floor never refuses what the bucket allows. Caddy's limiter has no bucket of its
  own, and sees no account.
