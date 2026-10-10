# Console: every node at once, served at the edge

The platform's view of itself: every node, and what CI is building. When the edge is down, a node is
reached over the tailnet instead, by SSH and a task that speaks host's API.

## The UI is at the edge, the data is the nodes'

**The console is a SvelteKit app rendered on Cloudflare, at the edge**, behind Access, so it is as
near the reader as Cloudflare is, and it holds no data. A page's first paint is rendered by the
Worker from what the nodes answer: the cluster from the nearest relay's `/state`, and a node's own
readings from its host's API, reached through that node's VPC binding at Caddy's door to host,
`infra.<suffix>`, with the read token. The Worker reads its bindings from `cloudflare:workers`, since SvelteKit's
`event.platform` is empty under its Cloudflare adapter, and runs with `nodejs_compat`, which
SvelteKit's server needs.

**The page and its live socket are one Worker on one host, `console.canmi.app`.** `/live`, `/state`
and `/nearest` are answered in the server hook before any page: the Worker picks the nearest node
from where Cloudflare says the reader is and hands the request to that node's relay by its VPC
binding, the next node when it fails. A response the hook returns itself leaves SvelteKit as it
was made, which a WebSocket's 101 must, and does: a browser saw the 101 on 2026-10-06. One host because Access sets its cookie per concrete
hostname and cannot set one ahead for a wildcard application's subdomains, and a WebSocket cannot
follow Access's redirect to get one: a page on one name could not open a socket on another --
https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/.

**What the console looks like -- its shell, its icons, how its styles are layered, its motion -- is [../console/design.md](../console/design.md).** What it remembers of a reader, and where, is [../console/state.md](../console/state.md). This file is what it does.

**The console is read whole, or in one of three scopes, the layers the workspace's
`spec/architecture/layers.md` draws.** `All` is the default and has no segment of its own -- `/`,
`/nodes`, `/apps` -- and shows everything together; the scopes narrow it: `Infra` -- host, keeper, Caddy and what else bootstraps
a node, and the nodes themselves -- then `Platform`, the services every layer above leans on, and
`Services`, what the author deploys on top. A scope is the address's first segment, so a link
keeps it, and every page shows what belongs to the scope it is read in; the nodes are infra's, and
shown under `Infra` and `All`. An app's scope is the layer whose repository built it. Rules come in two levels: the
shell's own a step fainter (`--color-line-faint`), the page's cards and tables at `--color-line`. A page says what it is in its
title and the facts beside it -- never a sentence about the page, under it or under a card. Its
`<title>` is the one name the page is about and nothing around it -- `Nodes`, `tyo`, `#123`, an
app's name -- with no product name and no separator: the console is behind Access and indexed by
nobody, so a title is for a reader picking out a tab, and the shortest name does that best. Its
icons are the `console` scope's marks, the API's own, followed for the browser as every page's are.

**Moving between pages never waits for a node.** A page's `load` returns at once: what it reads
from the nodes it returns as promises SvelteKit streams, and the page awaits each where it is
drawn, so a click shows the new page's layout, headings and cards in the same frame and each card
fills as its read lands. The server renders that layout whole -- the first response is the page,
never an empty shell -- and a chart that cannot be drawn on the server is drawn by the browser
inside a card the server already placed. A level's page in the sidebar is a link like any other and
obeys the same rule -- [../console/navigation.md](../console/navigation.md).

**The console's server never waits on data; it only draws.** It is stateless -- a Worker that keeps
nothing, restarts at any moment and loses nothing by it -- and everything it draws it asks, as the
request arrives, of one backend: the relay of the node nearest it, one hop over that node's VPC
binding, the console's own backend in all but where it runs. The backend is the platform's Rust, and
it holds the state: **every read the console's server makes is answered at once, from what that
backend already holds in memory** -- never fanned out across the nodes, never computed while the
console waits. A read the console needs and the backend cannot yet answer that way is the backend's
to hold, not the console's to gather. **So the document's own response is drawn filled**: a page's
load awaits its reads when the request is the browser's first, not a move -- `event.isDataRequest`
false -- and the browser takes over from the data in the page with no read of its own; on a move
between pages a read is streamed as above, since the browser holds most of it already. **A relay
counts as answering once its body is read whole**, not once its head arrives: a far relay that had
sent half of 450 KB of runs when the time ran out was read as nothing, and the overview said no
deploys, until 2026-10-10; now the next nearest is asked. The placeholders stay for a read that
fails or comes late, rarely seen but never removed. The reads that still fan out across the nodes
break this rule until they move, in [../todo/todo.md](../todo/todo.md), "The console's reads move to
the backend". Decided with the author on 2026-10-09.

**A node is shown by its city, and its code is the key.** What the console writes for a node is a
display name, its city and its country, written whole -- `Tokyo, Japan`, `Raleigh, United States`,
and the country alone where the two are one name, `Singapore`. A node in the European Union is its
country and the union instead -- `Sweden, European Union`, `Belgium, European Union` -- since its
countries are too small for a city to say more. **Each name has a short form beside it** --
`Raleigh, US`, `Sweden, EU`, the United States, the United Kingdom and the union written `US`, `UK`
and `EU` -- kept for a place too narrow for the whole, and used only where the author has said one
is; none has yet, as of 2026-10-09, when the short form stopped being what the console writes.
Several nodes may share one; the
three-letter code is the one unique name, written small beside the city where two must be told
apart, in a link, and in the address. A service is shown by its display name the same way, its
code name small beside it, in a link and in the address; the display name is `display_name` in the
service's `service.toml`, infra's `spec/architecture/host.md`, "One name inside, and a domain label
outside". The console keeps a copy of every display name beside its
scope lists, so the server writes it in the first response, for a Worker no host reports and for an
event of an app since removed; a test compares the copy with the declarations wherever infra's and
platform's checkouts sit beside this one. A display name the copy lacks is written as the code name.

**A figure is drawn before it is written.** A share of something -- memory, storage, CPU, a disk --
is a small ring or bar filled to the share, the figure beside it short, and the full sentence
(`975.5 MiB of 23.4 GiB`) on hover; a table cell never carries a sentence a glance cannot read.

**The server computes in UTC and every time is written in the reader's zone**, by its IANA name.
The name comes from the `timezone` cookie the browser keeps ([../console/state.md](../console/state.md),
"Kept, and where"), else from the zone Cloudflare names on the request, else UTC; a name Intl does
not know is passed over. It is set once in the layout and read by every chart, table, tip and day
bucket, each moment in the offset its zone had then, so the server and the browser write the same
text and the page does not change as it wakes. Decided with the author on 2026-10-10. **The world map is
projected when the console is built**, flat and as a grid of dots, so neither the Worker nor the
browser carries a projection or a world's topology -- only the dots it drew. A globe is offered
beside it, the same dots turned round by the browser on a canvas and loaded only when asked for --
[../console/overview.md](../console/overview.md), "The globe is the flat map turned round". On both,
a node's mark says how much it runs and how busy it is: its size says how much machine stands at its
place -- the memory of every node there together, up to 2 GiB, under 8, or 8 and more, so one large
machine and many small ones read alike -- its depth steps with the apps running on it from faint to
solid, and a halo breathes around it faster as its CPU climbs -- still when the reader asks for
reduced motion. **A node has three states on the map, the relay's `state` and never the browser's
clock**, and its whole mark takes the state's color: blue when it is heard -- `live`, and `late`, a
node between two snapshots -- amber when it said it is leaving -- `upgrading` or `restarting`, back
within its `within` -- and red when it is gone. `waiting`, a peer a relay just started has not heard
yet, is drawn neutral and never red. A place takes the worst of its nodes, gone over leaving over
waiting over heard. The card says `Upgrading` or `Restarting` where it said the uptime, `Waiting`
for a peer not yet heard and `Not heard` for gone alone; the line at the top names only gone nodes
as not heard and counts a node leaving apart, at warn, and the Nodes figure counts live and late as
heard, a node leaving not -- platform's `spec/architecture/relay.md`, "A node says it is leaving
before it goes". Decided with the author on 2026-10-09. The smallest step is two of the land's dots
across, so a mark reads as part of the same grid. No line is drawn between nodes, and no name: a
node's code and figures appear in a card on hover. **A mark is a place, not a machine**: nodes in
one place -- Tokyo's three -- are one mark, its depth from the apps they run together, its breath
from the busiest of them, red if any is gone, and its card listing each node.

**Developing it reads the real nodes.** Each node's binding is declared `remote`, so `vite dev`
reaches the same VPC services the deployed Worker does, with the read token in a `.dev.vars` written
from infra's sops file and never printed -- `mise run //repos/web:dev-console` writes it when
missing. Vite keeps every WebSocket upgrade for its own reload, so in development alone a plugin
takes `/live`, admits only the dev server's own `localhost` origin, and joins the browser to the
nearest relay's socket; none of it is in the build.

**It reads, and does not write, at first.** Each node's host gains a read-only token, good for its
`GET` routes alone, and that is the token the console's path carries; a host token is root on its
machine, and seven of them in one Worker would make the Worker root on all seven. Restarting,
deploying and rolling back are `mise run node` over the tailnet until writes have a path of their
own.

**It depends on the platform and a node does not**, which is the arrangement the workspace's
`spec/architecture/layers.md` allows: a node is reached over the tailnet when the console is not.

**What an app answers is read through its node's host.** A container's own health is on its
node's network or its socket, which the console cannot reach, so host asks it -- `GET
/api/apps/<app>/health`, with the read token -- and the console shows what came back. The platform's
database is the first read so: which node is primary, each standby's lag, and whether backing up
has stopped, which is how a database that is up and not backed up is seen without being asked
for -- platform's `spec/architecture/databases.md`, "The container is Postgres and a keeper of it".
Each app's `rollout` is shown beside it, as what a reader sees during one: a restart, no gap, or a
deploy by hand -- infra's `spec/architecture/host.md`, "An app chooses how it is rolled out, and
keeping nothing earns a gapless one".

**Errors go to Sentry, and development sends nothing.** The console reports to a Sentry project of
its own, its DSN beside the site's and the status page's in `@canmi/me/urls` -- public by
construction, since the browser bundle carries it -- and through `@canmi/web/sentry`, as they do:
`initClient` in the browser, `serverHandles` in the Worker, and Sentry's own Vite plugin in the
build. In development Sentry is loaded and initialized as in production, so what breaks under it
breaks here first, but its transport drops every event, so nothing is sent. `/live`, `/state` and
`/nearest` are answered before Sentry's handles, since a socket's 101 must leave the hook as it was
made and nothing may wrap it first; an error on those three is the relay's to report, not the
console's. Source maps are not uploaded yet: the console's Worker is packaged by the web
repository's workflow and deployed by the platform's deployer, and neither holds a Sentry token, so
the build emits none.

## Live, through the nearest node

**A reader's browser holds one WebSocket, to the node nearest it, and the nodes hold connections to
each other**, so whichever node a reader reached has everything as it happens. That is the relay's
mesh carrying live state beside its log -- platform's `spec/architecture/relay.md` -- and it needs what the relay's
first step needs, a port on the tailnet. **Workers VPC carries the WebSocket**: the console's Worker
hands the upgrade to the nearest node's binding and gets the relay's 101 back, seen from a browser
on 2026-10-06. While the socket is down the page polls `/state`.

## The pipeline

**What is deploying now is every act in progress, not only CI's**: the Now card groups a run's
steps under the run, and an act by hand -- a redeploy, a rollback, a start or stop, an upload, or
keeper's recreate of host -- under its node, each saying what it is; the latest failures take both
alike. A run is one way a node changes, and the operator watching a rollout by hand saw nothing
until 2026-10-08.

**A run took as long as its placements that did work**: from the first start to the last finish of
those that succeeded or failed, never a skip. A skip -- placed elsewhere, built again by a later
run, unchanged -- ends the moment host writes it, and host writes it whenever it reaches the run: a
node that missed a run's notice and caught up a day later stretched five runs of a 17-second deploy
to 24 hours each, and the overview's p95 with them, on 2026-10-09.

**What CI is building, what it built, and where each node is with it** are one view: a run queued,
building, built or failed on GitHub; then on each node, the artifact downloaded, loaded, started,
checked healthy, or failed at one of those, or skipped for its architecture or its placements. The
GitHub half comes from `hook`, which receives every run's events and today drops all but a
successful completion; the node half from host, which records each stage as it happens.
