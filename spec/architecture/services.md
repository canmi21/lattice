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

This is a property of each service, not a limit of the platform. The `api` Worker keeps its state
in D1, which only Cloudflare reads well, so it has one placement until its storage moves. The `cdn`
reads R2, which has an S3 surface, so it can be placed off Cloudflare as it is.

## Every node is the same node

The VPS and the machine at home run the same four things: host, keeper, Caddy and cloudflared.
Neither opens an inbound port; public traffic reaches each through its own tunnel, and the nodes
reach each other on the tailnet. Each node's host deploys only what is placed on it.

The notice CI sends after a build reaches every node through one Worker. That Worker verifies the
OIDC token GitHub mints for each run -- which repository, which ref, which workflow -- and forwards
over Workers VPC. **So GitHub holds no secret at all**, and what the Worker forwards is still only a
hint: each host verifies the artifact's attestation itself.

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

## The order it is built in

The node at home first, proved end to end on the simplest service there is: `geo`, the offline
gazetteer that names where a photograph was taken, read-only and shipped with its data. Then the
VPS as a second node, then Workers as a placement with `api` and `cdn` declared in, then failover.
The declaration carries placements from the first service, so each step adds an implementation
rather than a field.

## Open

- Whether Workers VPC can address Caddy by hostname. Inferred, not yet verified.
- What still addresses the site's API at the root, and so how long the root keeps answering as
  `/site/` while it moves.
