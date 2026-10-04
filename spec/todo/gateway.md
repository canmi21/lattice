# Deferred: the gateway

Where the hosts are today against [the gateway](../architecture/gateway.md) they are moving to:
what has to change, and what is not yet decided. The order the work is done in is a milestone once
it is agreed, not an entry here.

The rules over an entry are the index's; see [todo.md](todo.md).

## Three Workers answer for the public, each with the rules the gateway is to hold once

`gateway` answers `api.ffoni.com`, `cdn` answers `cdn.ffoni.com` and `aka` answers `ill.li`, each
on a custom domain of its own ([gateway's](../../apps/gateway/wrangler.jsonc)). Each repeats what
the new design puts in one place:

- CORS: the gateway's per scope in [policy.ts](../../apps/gateway/src/policy.ts); the CDN and the
  alias layer answer `*` to every origin from their own middleware.
- Lifetimes: the gateway keeps an answer five minutes, success or failure alike, unless the scope
  or the service says otherwise, and thirty seconds when the service could not be reached
  ([cache.ts](../../apps/gateway/src/cache.ts)); the CDN derives its stamp from whether the path is
  content addressed ([cdn's cache.ts](../../apps/cdn/src/cache.ts)); the alias layer stamps a
  resolution, a refusal and a blip three ways ([aka's cache.ts](../../apps/aka/src/cache.ts)).
- `robots.txt`, `security.txt` and `favicon.ico`: each Worker answers its own, keyed by service in
  `@canmi/robots` and `@canmi/security`, where the new design keys them by hostname.
- The path rule: each of the three mounts `normalizedLocation` itself.

The CDN's and the alias layer's routes -- `/object`, `/derive`, `/proxy/github`, the legacy
`/github/*`, `/symlink/...`, the five-character rids -- move behind the gateway unchanged, reached
by binding, and their custom domains go.

## No hostname reads as a profile, and nothing is versioned

The gateway reads one form, `/{scope}/{path}` on one host. There is no profile table, no reading of
a hostname from the right, no registry of providers or regions, and no `/v{n}/` in any path. Every
service is `v1` from the start except the CDN at `v3` and the alias layer at `v1`.

Decided: the gateway forwards the version in the path, and a service routes on it; see the
gateway's spec.

## The policy is split between a service's file and the gateway's

Limits are in each `service.toml`; CORS, forbidden parameters, the public paths, allowed headers and
lifetimes are in the gateway's `policy.ts`, written in TypeScript because an origin is a URL and
every URL is declared once in `libs/urls`. The new design has the service declare and the gateway
enforce.

Decided: all of it goes into `service.toml`, CORS by service code; see the gateway's spec.

Decided: the shape in the gateway's spec, "The declaration".

## A lifetime is one number for a success and one for a failure

The gateway's `Lifetime` is `{ success, failure }`. The new design declares three per route: an
answer, a refusal about the request itself, and the service failing or being unreachable -- the
distinction the alias layer already makes by hand.

Decided: fifteen minutes for a success and five for a failure when nothing is declared.

Decided: four kinds, named, nested under success and failure; see the gateway's spec.

Decided: `fulfilled`, `redirected`, `rejected` and `faulted`; see the gateway's spec.

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

## What each new host tells a crawler is not written

`@canmi/robots` and `@canmi/security` have a policy and a note per service. The new hosts --
`api.monoflake.com`, `cdn.monoflake.com`, each `ixc.one` deployment -- have none yet, and a
deployment's own host is a second address for the same answers, which an index should not take as a
second copy.

## The whitelists are written by hand, and checked against the table only

`rules/ill.li/alias-paths-only.txt`, `rules/ffoni.com/api-scopes-only.txt` and
`rules/ffoni.com/cdn-prefixes-only.txt` spell each host's paths out by hand, and `mise run rules`
checks only that the API's list and the gateway's scopes name the same scopes. The new zones --
`monoflake.com`, `ixc.one`, `symlink.si` -- have no rules at all, and `symlink.si` is not yet a
domain anything answers.

A generated whitelist has two limits to fit inside: an expression is at most 4,096 characters, and
the Free plan allows a zone five custom rules. Every deployment of `ixc.one` is in one zone, so its
whitelist covers every service on every node in one expression.

## Some routes name a thing in the query

The workspace's `spec/addresses.md` puts a thing's identity in the path and only what adjusts it in
the query, and a `GET` changes nothing. These routes, read once and not yet studied one by one, do
not:

| Today                                  | By the rule                                  |
| -------------------------------------- | -------------------------------------------- |
| shot `GET /status?task={id}`           | `GET /tasks/{id}`                            |
| shot `GET /capture?url=...`, which starts a capture | `POST /tasks`                   |
| probe `/results?check={id}&since&until` | `/checks/{id}/results?since&until`          |
| site `/article?slug=`                  | `/articles/{slug}`                           |
| site `/source?slug=`                   | `/articles/{slug}/source`                    |
| site `/like?slug=`, `/read?slug=`      | `/articles/{slug}/likes`, `/articles/{slug}/reads` |
| site `/media?resource=`                | `/media/{rid}`                               |

`/asset?name=` is not yet read. Each row is checked again when E4 takes it -- what the parameter
really is, and every caller -- and the service and its callers move in one change.

