# The gateway: one entrance for every API

The gateway is infrastructure; the site and the status page are its consumers. Every API this
repository runs is reached through one Worker, `gateway`, and nothing else. What it adds is
everything a service would otherwise write again: where a request goes, CORS, how long an answer
is kept, whether a credential is needed, and the files every host answers for. A service is
business logic and one declaration the gateway reads.

This file is the arrangement being moved to. Where [services.md](services.md) and
[delivery.md](delivery.md) describe the hosts as they are today, this file wins; what is left to
do is listed in [../todo/gateway.md](../todo/gateway.md).

## The gateway is infrastructure, and pages are not

**A page is a consumer of the gateway, never behind it.** The site on `canmi.net` and the status
page are applications that call APIs; they keep their own hosts and their own Workers. What of
them is an API -- the site's `/site/` routes -- is a service like any other, and reaches the public
through the gateway. Mixing the two would let a page's concerns -- its titles, its hydration --
into the layer every API depends on.

**There is one gateway Worker.** The public API host, the CDN and the alias layer were three
Workers each repeating CORS, cache stamps, `robots.txt`, `security.txt`, `favicon.ico` and the
path rule. In the gateway they are written once; the CDN and the alias layer become services
behind it, reached by binding, with no route of their own.

## Every request is one address, written several ways

**The gateway reads every request into one tuple: the service, the version, where it runs, and
the path.** Each hostname the gateway answers is a profile: it says which parts of the tuple the
hostname gives, which the path gives, and which it fills in itself. The service sees only the
version and the path, and never which hostname or profile the request came by.

**The version goes to the service as part of the path, untouched.** A service handles its own
versions, routing `/v1/...` and, one day, `/v2/...` itself; the gateway reads the version only to
fill it in. A profile that pins one -- `cdn.monoflake.com` at `v3` -- puts `/v3` in front of the
path, so the CDN receives `/v3/object/...` whichever host was asked.

| Hostname                                  | The hostname gives                    | The path gives               |
| ----------------------------------------- | ------------------------------------- | ---------------------------- |
| `api.monoflake.com`                       | nothing                               | `/v{n}/{service}/{path}`     |
| `cdn.monoflake.com`                       | the service, `cdn`, at `v3`           | `/{path}`                    |
| `ill.li`                                  | the service, `alias`, at `v1`         | `/{rid}`, a short link       |
| `symlink.si`                              | `alias` at `v1`, under `/symlink`     | `/{path}`                    |
| `api-{region}-{provider}.ixc.one`         | where it runs                         | `/v{n}/{service}/{path}`     |
| `{service}-{region}-{provider}.ixc.one`   | the service, and where it runs        | `/v{n}/{path}`               |

**`monoflake.com` lets the gateway choose where a request runs; `ixc.one` names it.** The two are
the same services behind the same rules, so a caller may use either: the first is the address to
publish, the second the one to pin a node, debug one, or -- later -- for a client that has measured
which node is nearest and asks it directly. A page rendered on the server would use
`monoflake.com`, so that what it renders can always be reached.

**A profile is a row in a table, not code.** A new short host, or a new node, is one more row: the
hostname, what it fixes, the version it pins, and the path it puts in front, if any.
`symlink.si/{path}` reaches the alias layer as `/v1/symlink/{path}`; `ill.li/symlink/...` is then no
address at all, and `ill.li` carries short links alone.

## Hostnames are one label deep, spelled with hyphens

**A deployment is `{service}-{region}-{provider}.ixc.one`, not `{service}.{region}.{provider}`.**
Every name is then one label under `ixc.one`, which one wildcard certificate covers -- Cloudflare's
free certificate covers the apex and one level and no deeper, as does a wildcard certificate
anywhere, since no browser accepts a wildcard over two labels. More than the certificate, nearly
every system is built for one level of wildcard -- DNS records, tunnels, Access, routes -- so one
level is the shape that fits all of them. And it costs nothing here: the gateway splits a hostname
by its codes, not by DNS's levels, and every hostname is already its own key in every cache.

**A hostname is read from the right.** The last part is the provider and the one before it the
region, both short fixed codes; whatever is left is the service, hyphens and all.

### Providers are short codes, registered here

A provider is two or three lowercase letters, chosen once when the provider is first used and never
reused: `int` for our own machines, `cf` for Cloudflare, `vcl` for Vercel. A new provider is a row
added to the registry before anything is placed on it.

### Regions are where a deployment runs

A region is three lowercase letters: the IATA code of the airport nearest the machine, or, where
that says less, the city's own code or a datacenter's well-known one -- whichever the reader would
recognize first. A deployment that runs everywhere at once, as a Worker does, is `glo`.

| Code  | Where                                         | So a deployment there is      |
| ----- | --------------------------------------------- | ----------------------------- |
| `rdu` | the machine at home, by Raleigh-Durham's airport | `api-rdu-int.ixc.one`, `geo-rdu-int.ixc.one` |
| `glo` | Cloudflare's Workers, everywhere              | `api-glo-cf.ixc.one`          |

## A version is in the path, and it moves only on a break

**Every API path starts with `/v{n}/`.** Every service starts at `v1` -- except the CDN, which
starts at `v3`, and the alias layer at `v1`, because the CDN has already been rebuilt twice and
saying so is the honest number.

**A version moves only when its input stops being a superset of the last.** If everything the old
version accepted is still accepted and answered as before, a change is an extension, however
large, and the version stays. A version moves when some request the old one accepted would now be
refused or answered differently. What the old version does after a break -- keep answering through
a compatibility layer, or answer with a status that tells the client to upgrade -- is decided when
the first break comes.

**A short host pins its version, and never follows the latest.** `cdn.monoflake.com` is `v3` and
`ill.li` is `v1` until somebody changes that row on purpose. Their addresses are written into
articles, mail and other people's pages, which outlive any version; following the latest would
break every one of them on the day a version moves. A caller that wants a newer version asks for it
by path, on `api.monoflake.com`.

## What a service declares, and what the gateway does with it

**A service declares; the gateway enforces.** The declaration is the service's `service.toml`,
which the gateway's table is generated from, and nothing about a service's contract is written in
the gateway. For the service and, where it differs, for each of its paths, it says who may call it
from a browser, how long a success and a failure are kept, whether a crawler may fetch it, and what
limits it by address. The service itself sees a request that has already been checked, with the
version and the path, and writes none of it.

**A route names who may call it by service code, never by origin.** `cors` is `public`, for any
origin, or a list of the codes of the services whose pages may call it -- `["site", "status"]` --
which the gateway reads against `libs/urls` for their origins. A page moving to another host is
then one change in `libs/urls`, and no declaration names a URL.

**Every field is declared for the service, and may be declared again for any one of its paths.**
CORS, lifetimes, crawling and, later, credentials are all route-level: a service's defaults say
what its paths get, a route says what it gets instead, and the nearest declaration wins.

**A lifetime is declared for four kinds of answer, named rather than numbered.** A success is a
`2xx` or a `3xx`, a failure a `4xx` or a `5xx` -- the request's fault, or the service's, an answer
that never came counting as the service's. Each has a name, nested under success and failure, so a
route can keep a redirect apart from what it points at, and a blip apart from a refusal that holds
until the next publication:

| Class | Name                 | What it says                                       |
| ----- | -------------------- | -------------------------------------------------- |
| `2xx` | `success.fulfilled`  | the request was met                                |
| `3xx` | `success.redirected` | the answer is elsewhere                            |
| `4xx` | `failure.rejected`   | the request was at fault                           |
| `5xx` | `failure.faulted`    | the service was at fault, or never answered        |

A lifetime is written `"30s"`, `"15m"`, `"1h"` or `"1d"`; `"immutable"` is a year and says the
bytes will not change; `"none"` keeps nothing.

**What nobody declares falls to one default: a success is kept fifteen minutes, a failure five.**

### The declaration

`[api.defaults]` holds what every path of the service gets; each `[[api.routes]]` names a `path`
and what it gets instead. Each field is looked up on the route, then the service's defaults, then
the gateway's own, field by field, so a route that names one lifetime inherits the other three.

```toml
[api.defaults]
crawlable = false

[api.defaults.cors]
origins = "public"            # or service codes: ["site", "status"]
methods = ["GET", "HEAD"]     # the default when absent
headers = []                  # request headers allowed beside Content-Type

[api.defaults.cache.success]
fulfilled = "15m"
redirected = "15m"

[api.defaults.cache.failure]
rejected = "5m"
faulted = "none"

[[api.routes]]
path = "/v1/symlink/*"

[api.routes.cache.success]
redirected = "1h"
```

- **`cors` absent is no browser at all.** `origins` is `"public"` or a list of service codes,
  `methods` defaults to `GET` and `HEAD`, `headers` to none beyond `Content-Type`.
- **A path is exact, or a prefix ending in `/*`.** The more specific wins -- exact over prefix, the
  longer prefix over the shorter -- whatever the order they are written in; two routes as specific
  as each other are an error when the table is generated.
- **`auth` is reserved.** It takes `"none"` alone until there are accounts.

### The table is built, not read at run time

`mise run scopes` reads every `service.toml`, holds each to a schema -- an unknown field, a service
code nobody declares, a lifetime it cannot read and two routes as specific as each other all fail
it -- and writes the gateway's table as `apps/gateway/src/scopes.ts`, lifetimes in seconds and
routes in the order they are matched. The gateway reads nothing else at run time, and a test holds
the committed table to the declarations. A Worker cannot read the repository, and a store it read
at run time would be state that drifts from the code and is checked only once it is live; a change
to a declaration is a commit either way, and Cloudflare rebuilds the gateway on it.

**Onboarding a service is a declaration, never gateway code.** Its `service.toml`, `mise run
scopes`, and for a Worker the binding in the gateway's `wrangler.jsonc`, which a test checks.
host's reader of the same file ignores what it does not know, so the gateway's fields cost the
nodes nothing.

**Whether a crawler may fetch a path is declared with it.** The gateway writes each hostname's
`robots.txt` from what the routes reachable on that host say -- the CDN may let its objects be
indexed while the rest of the API is not.

**A consumer is not behind the gateway, and keeps calling the libraries.** The site's routes are
its own and unlike any API's, so the site, and the status page, still answer their own
`robots.txt` and `security.txt` from `@canmi/robots` and `@canmi/security`. That is one entry point
called twice, not the rules written twice.

**An answer's lifetime is declared per route, and a success and a failure are declared apart.**
One lifetime for every answer -- five minutes, success or failure -- is too coarse: some failures
are facts that hold until the next publication, and some are a blip that must not be kept at all.
A route says how long each of these is kept: an answer, a refusal about the request itself, and
the service failing or being unreachable.

**Whether an object can be read is the route's to say, not the object's.** Objects are content
addressed and stored once, so a content id says what the bytes are and nothing about who may have
them. A route that serves an object to anyone answers `public, immutable`; a route that serves it
on some condition is kept by that route's own rule. When accounts exist, the condition is a
credential; until then every route is public.

## Every host's files and firewall are derived

**A domain is the application layer's or the service layer's.** `canmi.net`, `canmi.app` and the
status page's hosts are applications, configured each as itself. Every hostname bound to the
gateway is the service layer's, and nothing about it is written by hand: what it answers is the
profile table and the declarations, and everything a host says about itself follows from those.

**What a hostname serves is known exactly, so each host's files are its own.** The gateway knows,
for every hostname, which paths are an address there: the profile's fixed parts and every route of
the services it reaches. From that one set it writes the host's `robots.txt` -- a path allowed where
its route is `crawlable`, refused otherwise -- its `/.well-known/security.txt`, its `/favicon.ico`,
and the redirect of a path to its one spelling. No two hosts answer the same file unless they serve
the same paths.

**The firewall's whitelist is generated from the same set, and synced by the same script.** A
service-layer zone's rules in `rules/` -- which paths each of its hosts lets through to a Worker at
all -- are written by `mise run scopes` beside the table, never by hand, so the WAF refuses exactly
what the gateway would and opens nothing wider. `mise run rules sync` sends them to Cloudflare as it
does every zone's today. An application-layer zone's rules stay written by hand. See
[firewall.md](firewall.md).

## Where a request goes

**A service runs on Workers or on a node, and the gateway merges them into one set of routes.** A
service on Workers is reached by binding; a service on a node is reached through Cloudflare Tunnel.
Choosing among several placements of one service -- by load, by distance -- is the gateway's later,
and the reason `monoflake.com` does not name one.

**There is one entrance, and the private side goes.** Our own callers use the same hostnames the
public does, `api.monoflake.com` and the `ixc.one` names, rather than a private host of their own;
until the LAN answers those names, a call from the house goes out through the Tunnel and back. The
private side [services.md](services.md) describes -- `api.canmi.icu/{scope}/...`, through Caddy --
is retired once every caller has moved, rather than being given versions of its own.

**Inside the house, the same names will answer locally, under the same rules.** The LAN's DNS will
answer the gateway's hostnames with a gateway of its own on the node -- Caddy and a service that
works with it -- reading the same table the Worker reads. The two are one gateway deployed twice:
CORS, lifetimes, crawling and, later, credentials are enforced alike on both, so a service never
knows, and never needs to know, which side reached it.

**Telling our own callers from the public stays as it is until there are accounts.** What a
service offers only to our own callers is told today by which side reached it. When the account
system issues tokens, a `system` user's token will say the same thing, and the two may be unified
then.

## A domain leaves without a redirect

**A domain being retired is a profile that proxies, not one that redirects.** `cdn.ffoni.com` and
`api.ffoni.com` stay bound to the gateway, as profiles that read their old addresses into the new
tuple and answer as the new hosts would. A link to them keeps working, unchanged, with no 301 for
a client to follow or a cache to remember. Once every caller here has moved, the rows are deleted
and the domain goes quiet; `ffoni.com` is then released.
