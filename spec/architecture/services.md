# Services, where they run, and how they are reached

The deployment platform in [host.md](host.md) runs one machine. This file is the arrangement it is
one node of: what a service is, where it may be placed, and how a name reaches it. The Workers this
repository already deploys are services in it like any other.

## A service is what it is; a placement is where it runs

A service is declared once, by its name and its artifact -- a Worker bundle, a container image, or
both. Where it runs is a separate declaration, a list of placements: Cloudflare's Workers, the
public VPS, the machine at home. Moving a service, or adding a second place for it, edits that list
and nothing about the service.

## What a service stores decides how many places it can run

| What it keeps                      | Placements                               | For example                |
| ---------------------------------- | ---------------------------------------- | -------------------------- |
| nothing                            | any number                               | a pure transform           |
| read-only data, shipped with it    | any number that can hold it, not Workers | an IP lookup and its table |
| data that is written, in one place | one                                      | the album; the API over D1 |

This is a property of each service, not a limit of the platform. The site's API keeps its state
in D1, which only Cloudflare reads well, so it has one placement until its storage moves. The `cdn`
reads R2, which has an S3 surface, so it can be placed off Cloudflare as it is.

## Every node is the same node

The VPS and the machine at home run the same four things: host, keeper, Caddy and the tunnel.
Neither opens an inbound port; public traffic reaches each through its own tunnel, and the nodes
reach each other on the tailnet. Each node's host deploys only what is placed on it.

A finished build reaches every node through one Worker, `hook`, answering the `hook` scope of the
public API host. GitHub's webhook for workflow runs calls it when a run ends, signed with a secret
the two share; it checks the signature, keeps only a successful run of the deploy workflow on
`main`, and passes the run's number over Workers VPC to each node's host, and to keeper, which
alone deploys host. Workers VPC dials the node's Caddy by name and sends the fetch's hostname as the
`Host`, so one VPC service reaches every name Caddy answers. What the Worker forwards is only a
hint: each program asks GitHub about the run itself before it runs anything.

**Rejected: a step in the workflow calling the Worker with GitHub's OIDC token.** It holds no secret
at all, which the webhook does not match. It also fires before the run has ended, so a node would
have to reason about a run still going, and it puts a step in every build that exists to announce
it. The webhook's secret can only forge a hint the node then checks, which is the whole of what it
is worth to anybody.

## Cloudflare is the one entrance, and that is accepted

Every public request enters Cloudflare, so failing over between placements happens behind it: a
service whose first placement is a Worker falls back to the VPS and then to home, and one without a
Worker placement is fronted by a thin Worker doing the same. What this does not survive is
Cloudflare itself failing. That is accepted rather than engineered around: an outage there takes a
large share of the web with it, and reaching the VPS around Cloudflare would give up Access and the
edge in front of everything else.

What that edge refuses before any Worker runs -- scanners, and every path a host does not serve --
is [firewall.md](firewall.md).

## A domain says who can reach it, not what is behind it

> Being replaced by [gateway.md](gateway.md), which wins where the two differ.

| Name          | Who reaches it                                     | What goes there            |
| ------------- | -------------------------------------------------- | -------------------------- |
| `canmi.net`   | everyone                                           | the site, and nothing else |
| `*.canmi.app` | the author, from anywhere, through Access          | interfaces                 |
| `monoflake.com`, `monoflake.net`, `ixc.one`, `ill.li`, `symlink.si` | the public; whether a login is needed is per route | the gateway, and every API behind it |
| `*.canmi.icu` | the LAN and the tailnet only                       | everything, APIs included  |

**"The LAN" includes the node's own containers.** Caddy admits `.icu` from the sources host is told
in `PRIVATE_SOURCES`: the LAN, the tailnet, loopback, and Docker's private range, `172.16.0.0/12`.
The last is for an app reaching another app by its name -- `shot` capturing `infra.canmi.icu` -- whose request arrives from its container's address. It opens nothing a container could
not already reach: every container reaches the LAN directly, and host asks for its token on every
door regardless.

**`canmi.net` is the site's alone.** Interfaces were under `*.canmi.net` at first and moved to
`*.canmi.app`, so that the site's domain carries the site and nothing else. `canmi.app` was owned
and unused, which made it the one to take them.

**An interface is reached by a subdomain, and an API by a path.** An interface assumes it is served
from the root -- asset paths written absolute, cookies set on `/` -- and breaks under a prefix. An
API's client takes a base URL and does not care.

`*.canmi.app` is a wildcard in the tunnel and in Access both, so a name there is public and behind a
login in the same moment. A browser carries the Access cookie and needs no change to the app. A
program cannot, which is why an application serving its panel and its API on one route needs no
splitting: on `.app` its API is unusable to anything but the author's browser, and a program the
author runs reaches the API over `.icu`.

`*.canmi.icu` resolves in public DNS to the machine's LAN address, which answers nobody outside the
house. The machine advertises that one address, as a `/32`, as a tailnet route, so a device on the
tailnet reaches it from anywhere under the same name. **The answer DNS gives never changes; what
changes is whether the address is reachable.** So there is no DNS server of our own and no split
DNS, which the alternative -- the tailnet answering its own address for the name -- would need.

## One API host, scoped by path

> Being replaced by [gateway.md](gateway.md), which wins where the two differ.

Every API is `api.canmi.icu/{scope}/...` privately and `api.monoflake.com/v{n}/{scope}/...`
publicly, the private side retiring in favor of the public names -- see
[gateway.md](gateway.md). One path space, of which the public side is a subset. The scope is the service's name, so the site's own
API is `/site/` and gemini's is `/gemini/`. A new API is a row in a table, never a new domain.

The gateway strips the scope, forwards, and decides per scope what the service never has to:
whether the scope exists publicly at all, and whether it is anonymous there or needs a credential.
**A service behind it does no authentication of its own, and that is safe only because nothing
reaches a service except through the gateway** -- see "One door per node" below. A service placed
on Workers has no route and no `workers.dev` address of its own; the gateway reaches it by a
binding.

**Two gateways read one table.** The public one is a Worker, which reaches Worker services by
binding and everything else over Workers VPC, and is where the failover above lives. The private one
is Caddy on the node. Both are rendered from the one declaration, since two tables written by hand
are two readings of one format and would come to disagree silently -- the case the workspace's
`code.md` warns about.

**The public gateway is the Worker `gateway` in `apps/gateway`, on every hostname
[gateway.md](gateway.md) lists.** Its table is
`src/scopes.ts`, generated from every `service.toml` by `mise run scopes` and held to them by a
test, as is the binding list in its `wrangler.jsonc`. A scope on Workers is a service binding named
for the scope, and the request reaches it with the scope taken off and the declaration's `prefix`, if
it has one, put in front. A scope on a node goes over that
node's VPC service to its Caddy as `api.canmi.app`, where host renders the public scopes on the
tunnel's side and Caddy takes the scope off itself. `hook` is a scope like any other, with no route
of its own.

**A path with no scope is a 400, on both gateways.** Everything on the API host is under a scope, so
a request without one is malformed rather than looking for something missing; an unknown scope is a 404. The host's own address, `/`, is the one exception: it is somebody typing it, and the public
gateway sends them to the site with a 301 and `?ref=api` for the analytics. There is no fallback to the root: what addressed the site's API there stopped working when it
moved to `/site/`, links in mail already sent included, and that was accepted rather than carried.

## The gateway holds what every API would otherwise repeat

> Being replaced by [gateway.md](gateway.md), which wins where the two differ.

**CORS and limits by address are the gateway's, per scope, and a service writes neither.** Which
origins may call a scope and how often one address may call which of its routes is a row in
`apps/gateway/src/policy.ts`; the service behind it is business logic and nothing else. A preflight
is answered at the gateway without reaching the service, and a scope with no origin policy gives a
browser no CORS at all. The policy lives in TypeScript rather than in `service.toml` because it
names origins, and every URL is declared once in libs/urls.

**A parameter the public may not send is refused at the gateway.** A policy lists query parameters
it forbids, and a request carrying one is answered `403 forbidden_parameter` before it is counted
against a limit or reaches the service: what a service offers our own callers alone -- `shot`'s
`internal` -- is closed where the public comes in, and tested there.

### The gateway keeps answers a while

**A read from nobody in particular is answered from the gateway's cache when it can be**, so a
repeat costs the node nothing: kept in the Cache API of the Cloudflare location that answered, by
the full address, and looked up before any limit is counted. Only GET is kept, and HEAD is answered
from what GET kept; a request carrying `Authorization` or a cookie, and an answer setting one, are
never kept.

- **The service's `Cache-Control` is the word when it says anything.** `no-store`, `no-cache` and
  `private` keep nothing -- `shot`'s answers about a capture say `no-store` -- and a `max-age` or
  `s-maxage` is kept that long, as `shot`'s pictures are for fifteen minutes.
- **Otherwise the scope's policy says, and five minutes for a success and a failure alike when it
  does not.** `geo` keeps a success for a day, since an address changes only with the gazetteer; a
  scope may keep nothing at all.
- **The gateway's own failure to reach a service is kept thirty seconds**, so a node back from a
  restart is not reported down for five minutes more.
- Every answer says which it was, `x-gateway-cache: hit` or `miss`. A refusal the gateway makes
  itself -- a forbidden parameter, a limit -- is never kept.

### The gateway marks what it passes on

**Every request the gateway forwards carries `x-gateway: public`, set over whatever the caller
sent.** The public reaches a node's services through the gateway and nowhere else, so a request
without the mark came from the LAN, the tailnet or one of our Workers over VPC -- the three callers
that ask `api.canmi.icu` or `api.canmi.app` directly. A service that treats our own calls
differently reads the mark rather than an address; it cannot be forged from outside, because the
gateway overwrites it. It is the second lock behind a forbidden parameter, not a replacement for it.

### A limit is declared once and kept in three places

**How often one subject may call a route is a row in the service's `service.toml`, and no service
counts anything itself.** A service stays business logic; three layers outside it keep the row, each
a check on the others:

1. **Cloudflare's WAF**, one rate rule a zone -- [firewall.md](firewall.md), "Rate Cap" -- is the
   floor under everything: coarse, by path alone, counted per Cloudflare location, and only ever
   meeting a flood.
2. **[`quota`](quota.md)** keeps each row exactly, as a bucket -- a burst at once and a steady rate
   after it -- in one count per service, route and subject, whatever host or version the call was
   spelled with. Each gateway asks it for what enters there, and a Worker asks it for the routes its
   own pages call. One that fails lets the call through, with the WAF beneath it.
3. **Caddy on the node** keeps the same rows again, for what the gateway forwards and nothing else:
   a request carrying its mark, counted by the visitor's address that Caddy takes from
   `Cf-Connecting-IP`, which it believes from the tunnel alone. It is there for the moment `quota`
   fails and lets a call through, as a sliding window at the most a bucket ever admits in it. The
   LAN, the tailnet and our own Workers meet no limit here. host renders one zone a row into the
   tunnel's side, named as `quota`'s keys are without the subject, and a refusal is the envelope's
   `rate_limited` with `Retry-After` and `no-store`, so the gateway neither keeps it nor takes it
   for an unreachable node.

```toml
[[api.limits]]
methods = ["GET", "HEAD"]
path = "/address"      # as the service sees it, after the version
count = 60             # room comes back at 60 calls
seconds = 60           #   in 60 seconds, 1 to 86400
burst = 20             # at most 20 at once; `count` when left out
```

The gateway's table carries the rows, generated from every `service.toml` as its scopes are; host
reads the same files. A row a node cannot count is refused when the service is deployed, and so is
a call two rows of one subject would cover; rows of different subjects stack, each counting
the call. See [quota.md](quota.md). The site's
own routes, which its pages call without the gateway, are rows in the same format, counted by the
same service.

**A limit is a row in one format, wherever it is enforced.** It names methods and a path, so it can
be as narrow as one route; libs/limits is the format, its check and the bucket's arithmetic. The
gateway applies it to what reaches a service through the gateway. Routes that only a Worker's own
pages call never pass the gateway, so that Worker asks `quota` with the same rows itself -- the
site's are `apps/site/server/src/contract/limits.ts`.

**A limit that is business logic stays with the service.** The read counter's per-article minute
does not refuse anyone -- the reader still gets the count, only the increment is withheld -- so it
is part of what `/read` means, and it stays in the site's API.

**A free service is limited at every gateway, the house's included.** `geo` is a public scope: any
page may call `api.monoflake.com/v1/geo/address`, and one address may ask sixty times a minute -- it
answers from memory, so the limit keeps a crawler off the machine at home rather than paying for an
answer. Our own callers use the same names and meet the same rows, counted by the gateway they
entered: the internal one for the LAN, once it answers -- see [quota.md](quota.md). Only the
private side, `api.canmi.icu`, counts nothing, and it retires.

**The gateway is written with Hono**, for its CORS middleware and the one error envelope, which
every service here already answers in. It answers `/robots.txt` itself, keeping the host out of an
index but for the site's scope -- see [robots.md](robots.md).

**Development goes through the gateway too.** It binds the API's pinned port, so a caller reaches
every API at one address with the same CORS it will meet in production. Each service behind it runs
on its own, only when it is needed. One served by wrangler is found through wrangler's registry of
running sessions, under the name it registers -- a named environment suffixes it with `-dev`. The
site runs under Vite, which that registry does not see, so its binding in development is the word
`development` and the gateway asks the site's development address instead. One that is not running
answers as unavailable rather than taking the rest down.

## Every answer is one envelope

Every API here, in TypeScript or in Rust, answers in one shape: `{ "status": "success", "data": ... }`
or `{ "status": "error", "code": ..., "message": ... }`. `libs/response` is both halves -- `src/index.ts`
and the `response` crate -- and both read the one catalogue of codes, `codes.json`, and are tested
against the same fixtures, so the two languages cannot drift apart. A success carries what the route
answers and nothing else; there is nothing to say about a call that worked. A body that is the
thing itself -- an image, a file, a redirect -- is not wrapped.

**A failure carries a code and a message, both always.** The code is for a program: ours, lowercase
with underscores, and not the HTTP status, which the response already has. The message is for a
person: one line of English, objective, short without being curt, opening with a capital and ending
without a stop. Each code has a default message in the catalogue, so a refusal names its code and a
moment with something more exact to say -- a port and who holds it -- says it instead.

**A code is one of four families.** `no_such_*` for something asked for by a name or an id that
does not exist, `invalid_*` for a request that is malformed, `*_unavailable` for something that
could not be reached or read at this moment, and `forbidden_*` for a request that is well formed and
refused to this caller -- a 403, where `invalid_*` is a 400. `rate_limited` is the one code outside
them.

**What faces the public says nothing about the inside.** A message a stranger can read names no
path, no internal error and no secret; a failure inside is logged in full and answered with its
code's own message. host and keeper are reached from the LAN and the tailnet alone, so theirs may
say exactly what went wrong.

## Names in an API are spelled out

A path segment may be a short word -- `geo`, `cdn`, `aka` -- but a query parameter and a JSON key are
written in full: `latitude`, not `lat`; `resource`, not `rid`. One concept has one name wherever it
appears, in a parameter, a body and an answer alike. An identifier this spec defines, `slug` or
`cid`, is its own full name. `rid` stays the term inside the code and the storage keys, where it is
defined; outside, it is `resource`. A page's own query is the exception, read by people and short -- `?lang=`,
`?ref=` -- and a page asks its API with the full names; see the workspace's spec/addresses.md.

## A service keeps its data in SQLite, in its own directory

**Every service that stores anything embeds SQLite, in its own data directory, in WAL mode.** It
is what makes a deploy's snapshot and a rollback with data whole: the app's subvolume holds all of
its data, and stopping the app stops every write to it. A shared database server would put an
app's data outside its subvolume, where a snapshot of the app no longer covers it -- file-level
copies of one database in a cluster cannot be restored alone -- and would be one more resident
every service waits on and falls with.

A service that one day needs what SQLite cannot give -- several processes or machines writing one
dataset, heavy concurrent writes, a feature only PostgreSQL has -- gets a PostgreSQL of its own, in
its own subvolume and stopped with it, never one shared by all. Nothing here needs it yet.

## A service keeps one port

Every service has a port of five digits, chosen for it and never shared: the same number inside its
container, on a machine where it is published, and in development. `geo` answers on 23440, after the
latitude of the tropics. A port like 8080 is everybody's default, so it says nothing about what is
listening, and two services left on their defaults are a collision waiting for a second container.

**The range is 10000 to 32767.** Below it are the well-known and commonly defaulted ports; above it
begins the range Linux hands out as the source port of outgoing connections, where a listener can
now and then find its number already taken by one of them.

A service states its port in `service.toml`, and host refuses a second app declaring one already
held, so the numbers stay distinct without a list anybody has to keep.

**The one exception has no network at all, and answers on a socket instead.** A container states
`port` or `socket`, exactly one: `socket` is a file name in the app's own directory, so the
declaration has to mount one with `[data]`, and it cannot declare `[api]` or `[interface]`, since
Caddy has no port to reach. host checks its health on that socket. Only the meter is shaped to run
without a network, see [meter.md](meter.md).

## One door per node

**No container publishes a port.** Each app has a Docker network of its own that it shares with
Caddy and nothing else, so an app that is compromised cannot reach another around Caddy.
The tunnel reaches Caddy only, and Workers VPC reaches a node through Caddy too.

**A node has one VPC service, `home`, and it points at Caddy.** A Worker binds it as `HOME` and
names what it wants as `Host` -- `api.canmi.app` for an API, `gemini.canmi.app` for gemini -- so a
new service a Worker needs is never a new VPC service in the dashboard. What a Worker can reach is
decided here rather than there: it is the tunnel's side of Caddy, which host renders from every
`service.toml` -- every label, since the tunnel's side is the whole of `.app`; what the public
reaches of it is Access's to say, and of the API the gateway's table. Caddy
cannot tell a Worker's request from a visitor's, since both arrive from the tunnel; the visitor is
the one Access stops first, at Cloudflare. The VPC service's HTTPS port is never used: Caddy's
tunnel side answers plain HTTP on 80.

This is a single entrance, not zero trust, and the difference is worth knowing: `.icu` admits by
where a request comes from, `.app` by who sent it. For one person that is the right trade. host is
the exception: it is root on its machine, so it asks for its token even on the LAN.

## A Workers placement is deployed by Cloudflare, not by host

Workers are built by Cloudflare's own Git integration: it watches this repository, filtered to the
paths each Worker and the libraries it imports live under, and deploys on a push that touches them.
That is already the shape this file wants -- the platform pulls, and GitHub holds no secret -- so
host does not run `wrangler` and holds no Cloudflare token for it. What a Workers placement adds
here is the declaration, not a second way to deploy.

**The placement is named `workers`, and a service placed there alone declares no container.** Its
`service.toml` holds the name, the placements and, for an API, the `[api]` table; `[container]` is
required only of a service a node runs. An image is built for an app whose directory holds a
`Dockerfile` beside its declaration, so a Worker's declaration never reaches the image build, and no
host is ever sent one. `site`, `cdn`, `aka` and `hook` are declared this way.

## The site's API runs in the site's Worker

The site's pages and its API are one Worker, `site`. The API's routes are a Hono app in
`apps/site/server`, and the site's `hooks.server.ts` hands it the requests that are its own before
SvelteKit reads a path as a page's. Two doors reach it:

- **The site's pages ask it on their own origin, under `/api/`.** During server rendering SvelteKit
  answers a same-origin `fetch` in-process, so rendering a page costs no request at all; in the
  browser it is the connection the page already has, with no CORS and no preflight. These routes
  are the site's own and nobody else's contract.
- **The public routes are the `site` scope of the API host.** The gateway binds the `site` Worker
  and sends it `/api/{route}` under the API host's name, which a request can carry only by coming
  through that binding: Cloudflare picks the Worker by the host. The Worker serves those names
  alone -- `PUBLIC_ROUTES` in `apps/site/server/src/contract/routes.ts`, today `media` and `asset`, which the
  alias layer reads. The declaration says where it answers with `[api] prefix = "/api"`, which only
  a Workers placement may carry, since a node's Caddy forwards a scope to a container's root.

**Why one Worker.** The pages and the API they call now build together, so what one expects the
other is -- an internal route can change shape without a window where a deployed page asks a
deployed API a question it no longer answers. That is also what lets the internal addresses be
generated at build time for both at once. And rendering reads the corpus through the API, so a
subrequest per record was the price of keeping them apart.

**What it costs, accepted.** The code rendering pages holds the database, the records bucket and
the limits, where a separate Worker kept them from it. The rule data.md's two buckets exist for is
that no route or catch-all can reach what it should not; here the API is reached only at `/api/`
and the API host, both decided in one function, and the records bucket is still not the one the CDN
serves. The site's error reporting covers the API, which had a Sentry project of its own.

**The two runtimes stay apart in the type checker.** The site's program checks against the
browser's globals, and the API against workerd's, and the two disagree about `Response` and
streams. So the site imports `@canmi/site-api` through `src/boundary.d.ts`, the one thing it needs --
something that answers a request -- and the API's own tests hold the real app to that declaration;
see workspace.md, "A runtime's globals decide which program checks a file".

**It lives in the site, beside `src/` rather than inside it.** `apps/site/server` is the site's own code
and sits in the site's directory, as a package of its own because its type program is not the
site's: inside `src/` it would be checked against the browser's globals. Nor is it a SvelteKit
route -- a `+server.ts` is in `src/` too, and would give up the Hono app, the addresses by contract and
the limits the API answers through. It was `libs/site-api` for a while, which put the site's API
among code every app may take, and it is nobody's but the site's.

**It is named `server`, and the SvelteKit app stays at the site's root.** The half with no page is
the server's; the other half renders on the server as well -- its hooks, its SSR, the dispatch into
this one -- so calling it `client/` would say something false about it, and moving it would have
moved every path the site's tooling and its build configuration name for no gain but symmetry.

**In development the records come off the disk.** The API reads the records tree through the
fetcher the store takes, which `wrangler dev` used to hand over as assets. The site's assets are its
own build and Vite runs in node, so the site reads the tree itself, in development only.

### The pages ask by contract, not by name

In production a page asks for a route at `/api/{address}`, twelve hex digits of a SHA-256 over the
route's name and its contract: the schemas its answer and request are read by, taken as data, and a
revision for whatever of its shape no schema describes. `apps/site/server/src/contract/contracts.ts` holds the
contracts, and the site's build states every address to the pages and to the Worker in one
`define`, so the two agree by construction. A route has a shape as well -- `articles/{slug}/reads`,
`assets/{name*}`, in `SHAPES` beside the routes -- which puts the thing it is about in the path, as
the workspace's `spec/addresses.md` has every address do; a production page asks at the route's
address followed by the shape's placeholders, `/api/{address}/{slug}`, and the Worker reads the
values back into the parameters its handler takes. Development asks at the shape itself, and a
production Worker answers a shape with a 404.

**The address moves with the contract and with nothing else.** A deploy that leaves a route alone
leaves its address, and whatever cached it, alone. A deploy that changes it gives it a new address,
so a tab still open from before asks the old one and is told the route does not exist -- the answer
a removed route would get -- rather than reading an answer of a shape it no longer understands.
Hashing the build instead would have cost every open tab every route on every deploy.

**It is not access control.** The addresses are in the page's script for anyone to read. What it
buys is that the internal routes are nobody's contract: nothing outside the site can come to depend
on one, so it can change whenever the site does. The public routes keep their names on the API host,
which is where a promise is made.

This reversed a first arrangement, in which the API was a Worker of its own named `site-api`. Its
reason was the credential split above, and it was sound until the internal addresses were wanted
built together with the pages, which two Workers cannot do.

## The order it is built in

The node at home first, proved end to end on the simplest service there is: `geo`, the offline
gazetteer that names where a photograph was taken, read-only and shipped with its data. Then the
Workers as a placement, with the site, `cdn`, `aka` and `hook` declared in, and the API host scoped
by path in front of them; then the VPS as a second node, then failover. Workers came before the VPS
because two placements -- `workers` and `home` -- are enough to prove the declaration, and neither
needs a machine that does not exist yet. The declaration carries placements from the first service,
so each step adds an implementation rather than a field.
