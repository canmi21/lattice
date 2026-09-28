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

| What it keeps                         | Placements                                    | For example                 |
| ------------------------------------- | --------------------------------------------- | --------------------------- |
| nothing                               | any number                                    | a pure transform            |
| read-only data, shipped with it       | any number that can hold it, not Workers      | an IP lookup and its table  |
| data that is written, in one place    | one                                           | the album; the API over D1  |

This is a property of each service, not a limit of the platform. The site's API keeps its state
in D1, which only Cloudflare reads well, so it has one placement until its storage moves. The `cdn`
reads R2, which has an S3 surface, so it can be placed off Cloudflare as it is.

## Every node is the same node

The VPS and the machine at home run the same four things: host, keeper, Caddy and cloudflared.
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

## A domain says who can reach it, not what is behind it

| Name           | Who reaches it                                   | What goes there                     |
| -------------- | ------------------------------------------------ | ----------------------------------- |
| `canmi.net`    | everyone                                         | the site, and nothing else          |
| `*.canmi.app`  | the author, from anywhere, through Access        | interfaces                          |
| `ffoni.com`    | the public; whether a login is needed is per route | APIs                              |
| `*.canmi.icu`  | the LAN and the tailnet only                     | everything, APIs included           |

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

Every API is `api.canmi.icu/{scope}/...` privately and `api.ffoni.com/{scope}/...` publicly: one
path space, of which the public side is a subset. The scope is the service's name, so the site's own
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

**The public gateway is the Worker `gateway` in `apps/gateway`, on `api.ffoni.com`.** Its table is
`src/scopes.ts`, generated from every `service.toml` by `mise run scopes` and held to them by a
test, as is the binding list in its `wrangler.jsonc`. A scope on Workers is a service binding named
for the scope, and the request reaches it with the scope taken off and the declaration's `prefix`, if
it has one, put in front. A scope on a node goes over that
node's VPC service to its Caddy as `api.canmi.app`, where host renders the public scopes on the
tunnel's side and Caddy takes the scope off itself. `hook` is a scope like any other, with no route
of its own.

**A path with no scope is a 400, on both gateways.** Everything on the API host is under a scope, so
a request without one is malformed rather than looking for something missing; an unknown scope is a
404. There is no fallback to the root: what addressed the site's API there stopped working when it
moved to `/site/`, links in mail already sent included, and that was accepted rather than carried.

## The gateway holds what every API would otherwise repeat

**CORS and limits by address are the gateway's, per scope, and a service writes neither.** Which
origins may call a scope and how often one address may call which of its routes is a row in
`apps/gateway/src/policy.ts`; the service behind it is business logic and nothing else. A preflight
is answered at the gateway without reaching the service, and a scope with no origin policy gives a
browser no CORS at all. The policy lives in TypeScript rather than in `service.toml` because it
names origins, and every URL is declared once in libs/urls.

**A limit is a row in one format, wherever it is enforced.** It names methods and a path, so it can
be as narrow as one route, and one whose binding is missing refuses rather than letting everything
through; libs/limits is the format and its check. The gateway applies it to what reaches a scope
through the gateway. Routes that only a Worker's own pages call never pass the gateway, so that
Worker applies the same rows itself -- the site's are `libs/site-api/src/limits.ts`.

**A limit that is business logic stays with the service.** The read counter's per-article minute
does not refuse anyone -- the reader still gets the count, only the increment is withheld -- so it
is part of what `/read` means, and it stays in the site's API.

**The gateway is written with Hono**, for its CORS middleware and the one error envelope, which
every service here already answers in. It answers `/robots.txt` itself, keeping the whole host out
of an index.

**Development goes through the gateway too.** It binds the API's pinned port, so a caller reaches
every API at one address with the same CORS it will meet in production. Each service behind it runs
on its own, only when it is needed. One served by wrangler is found through wrangler's registry of
running sessions, under the name it registers -- a named environment suffixes it with `-dev`. The
site runs under Vite, which that registry does not see, so its binding in development is the word
`development` and the gateway asks the site's development address instead. One that is not running
answers as unavailable rather than taking the rest down.

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

## One door per node

**No container publishes a port.** Each app has a Docker network of its own that it shares with
Caddy and nothing else, so an app that is compromised cannot reach another around Caddy.
cloudflared reaches Caddy only, and Workers VPC reaches a node through Caddy too.

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
`libs/site-api`, and the site's `hooks.server.ts` hands it the requests that are its own before
SvelteKit reads a path as a page's. Two doors reach it:

- **The site's pages ask it on their own origin, under `/api/`.** During server rendering SvelteKit
  answers a same-origin `fetch` in-process, so rendering a page costs no request at all; in the
  browser it is the connection the page already has, with no CORS and no preflight. These routes
  are the site's own and nobody else's contract.
- **The public routes are the `site` scope of the API host.** The gateway binds the `site` Worker
  and sends it `/api/{route}` under the API host's name, which a request can carry only by coming
  through that binding: Cloudflare picks the Worker by the host. The Worker serves those names
  alone -- `PUBLIC_ROUTES` in `libs/site-api/src/routes.ts`, today `media` and `asset`, which the
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

**In development the records come off the disk.** The API reads the records tree through the
fetcher the store takes, which `wrangler dev` used to hand over as assets. The site's assets are its
own build and Vite runs in node, so the site reads the tree itself, in development only.

### The pages ask by contract, not by name

In production a page asks for a route at `/api/{address}`, twelve hex digits of a SHA-256 over the
route's name and its contract: the schemas its answer and request are read by, taken as data, and a
revision for whatever of its shape no schema describes. `libs/site-api/src/contracts.ts` holds the
contracts, and the site's build states every address to the pages and to the Worker in one
`define`, so the two agree by construction. Development asks by the route's name, and a production
Worker answers a name with a 404.

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
