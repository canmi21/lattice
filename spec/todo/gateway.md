# Deferred: the gateway

Where the hosts are today against [the gateway](../architecture/gateway.md) they are moving to:
what has to change, and what is not yet decided. The order the work is done in is a milestone once
it is agreed, not an entry here.

The rules over an entry are the index's; see [todo.md](todo.md).

## The CDN and the alias layer still answer for themselves

The gateway holds CORS, lifetimes, the host files and the path rule from each service's
declaration. `cdn` on `cdn.ffoni.com` and `aka` on `ill.li` are Workers on custom domains of their
own, and each still writes all four itself: `*` to every origin from its own middleware; a stamp
the CDN derives from whether the path is content addressed ([cdn's cache.ts](../../apps/cdn/src/cache.ts))
and the alias layer gives a resolution, a refusal and a blip three ways
([aka's cache.ts](../../apps/aka/src/cache.ts)); its own `robots.txt`, `security.txt` and
`favicon.ico`; and `normalizedLocation` mounted by hand.

Their routes -- `/object`, `/derive`, `/proxy/github`, the legacy `/github/*`, `/symlink/...`, the
five-character rids -- move behind the gateway unchanged, reached by binding, and their custom
domains go; each stamp becomes a declaration.

## No service answers a versioned path

The gateway reads every hostname as a profile and every request into its tuple, but it is bound to
`api.ffoni.com` alone, which reads as a retired host and forwards its old, unversioned path. No
service routes on `/v{n}/` yet. Every service is `v1` from the start except the CDN at `v3` and the
alias layer at `v1`.

Decided: the gateway forwards the version in the path, and a service routes on it; see the
gateway's spec.

## The addresses are spelled for the old hosts

`libs/urls` names `API.public` as `https://api.ffoni.com`, the CDN as `https://cdn.ffoni.com` and
the alias layer as `https://ill.li`; ten files read the CDN's, eight the API's and four the alias
layer's, and the Rust mirror follows. The published corpus spells none of them -- every address is
made at render from `libs/urls` -- so moving them republishes nothing.

Outside the repository: GitHub's webhook calls `hook` at the old API host; Cloudflare holds the
custom domains, the DNS for `monoflake.com` and `ixc.one`, and the Worker routes the gateway would
need for every profile's hostname.

Decided: `rdu`.
`api-{region}-int.ixc.one` can name it.

## A deployment's own host would be indexed as a second copy

The gateway writes each host's `robots.txt` from what the routes it reaches say, so a new host
needs nothing written for it. But a deployment's host under `ixc.one` answers what
`api.monoflake.com` answers, and a crawler let into both would index the same answers twice.

**Undecided: whether a deployment's host refuses every crawler**, leaving the routes' own
`crawlable` to the hosts the gateway chooses for.

## The whitelists are written by hand, and checked against the table only

`rules/ill.li/alias-paths-only.txt`, `rules/ffoni.com/api-scopes-only.txt` and
`rules/ffoni.com/cdn-prefixes-only.txt` spell each host's paths out by hand, and `mise run rules`
checks only that the API's list and the gateway's scopes name the same scopes. The new zones --
`monoflake.com`, `ixc.one`, `symlink.si` -- have no rules at all, and `symlink.si` is not yet a
domain anything answers.

A generated whitelist has two limits to fit inside: an expression is at most 4,096 characters, and
the Free plan allows a zone five custom rules. Every deployment of `ixc.one` is in one zone, so its
whitelist covers every service on every node in one expression.
