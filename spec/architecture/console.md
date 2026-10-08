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

**It is black and white, drawn with semantic names** -- ground, surface, line, text, good, warn,
danger and the series -- that a palette fills. The kit's `mono.css` paints the interface in light or
dark; the icon at the top bar's right edge, Tabler's filled brightness mark, switches the two,
mirrored in the dark so its filled half changes side, and keeps the choice in the kit's `theme`
cookie. Nord supplies the chart series alone, so data keeps its distinctions while the interface
remains monochrome. **Tabler is the console's icon family**, with 18 px navigation and theme icons,
16 px inline controls and 14 px compact state marks. Navigation has a lighter stroke; small state
marks have a heavier one. Its charts are drawn as SVG by the app itself with d3's scales and shapes,
so the server renders them whole: a chart library drawing on a canvas would paint nothing until the
browser ran it.

**The shell is three fixed regions, and only the page scrolls.** The sidebar runs down the whole
left edge with its rule, the top bar sits right of it alone, and the page between them is the one
scrolling element; the document itself never scrolls or bounces. Their sizes are in `rem`, so the
three keep their proportions as the reader's text size changes. The top bar carries the scope on its
left, the page's name at its center and the page's actions on its right -- creating something,
whatever comes later, then the zone every moment on the page is written in, then the light-and-dark
switch at the outside edge. The zone is the page's and not the account's, which is why it sits
beside the page's actions: it decides how every time and every chart is written, and a choice of
zone, when there is one, is what it becomes. The account sits at the foot of the sidebar, last, in a
region of its own. Who is signed in and through where -- the avatar, the name, the relay's country
-- is one button: the menu it opens waits on accounts, and the whole group raising on hover is what
says it opens one, with no icon to say it. Beside it, at the region's right edge, are two icons: a
merge, a link to the commit the console was built from -- by lib's `spec/web/build.md`, its short
hash on the link's hover -- and a bell for notifications, which waits on a feed of them as the menu
waits on accounts. Until the platform's accounts exist it shows the author, from `@canmi/me`'s
identity and their GitHub avatar through the CDN, so the region has its final shape before it has
anything to sign in to -- web's `spec/todo/milestones.md`, D3. The avatar sits on a neutral disc
until the picture arrives; a placeholder of its own is platform's `spec/issues/services.md`, "An
avatar has no placeholder a page can paint before it arrives".

**Whether the console is live is a dot on the avatar's corner and nothing else**: green while the
socket is up, red while it is down and the page polls, and quiet for the moment before the socket
has tried, so no load paints a red it is about to take back. It is ringed in the sidebar's ground,
as a presence dot is. How many nodes are heard is the pages' to say, not the shell's. Under the
name is the country of the relay the console is reached through, in full -- `Japan`,
`United States`. The commit is an icon rather than a line of text: the region holds two lines, and
a third fact written out made it a column of small type. No moment is shown, the build's or the
reader's. The relay is the node nearest the reader, worked out on the server from where Cloudflare
says they are without asking any node -- the order the Worker itself tries them in -- until the
socket has gone through one and names it.

**The zone in the top bar is the request's**, as every moment on the page is written in, and it is
written as its offset from UTC with a sign -- `UTC-4`, `UTC+5:30`, and UTC itself `UTC+0` -- so
every zone reads one way, never as a city's name or Intl's `GMT`; its name is on its hover.

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
inside a card the server already placed. A tab is a link like any other and obeys the same rule.

**A node is shown by its city, and its code is the key.** What the console writes for a node is a
display name, its city and its country -- `Tokyo, Japan`, `Raleigh, US`, the United States and the
United Kingdom written `US` and `UK`, and the country alone where the two are one name,
`Singapore`. A node in the European Union is its country and the union instead -- `Sweden, EU`,
`Belgium, EU` -- since its countries are too small for a city to say more. Several nodes may share
one; the
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

**Every time is written in the reader's zone**, which Cloudflare names on the request, set once in
the layout and read by every chart, so the server and the browser write the same text and the
page does not change as it wakes; a zone Intl does not know falls back to UTC. **The world map is
projected when the console is built**, flat and as a grid of dots, so neither the Worker nor the
browser carries a projection or a world's topology -- only the dots it drew. A globe is offered
beside it and loaded only when asked for, being WebGL the server cannot draw. On both, a node's mark
says how much it runs and how busy it is: its size says how much machine stands at its place -- the
memory of every node there together, up to 2 GiB, under 8, or 8 and more, so one large machine and many
small ones read alike -- its depth steps with the apps running on it from faint to solid, and a halo breathes around it faster as its CPU
climbs -- still when the reader asks for reduced motion. A node has two states on the map, and its whole mark takes the state's color: blue when it
is heard, red when it is gone. Late is not a state but a node between two snapshots, and is drawn
as heard. The
smallest step is two of the land's dots across, so a mark reads as part of the same grid. No line is drawn between nodes,
and no name: a node's code and figures appear in a card on hover. **A mark is a place, not a machine**: nodes in one
place -- Tokyo's three -- are one mark, its depth from the apps they run together, its breath from
the busiest of them, red if any is gone, and its card listing each node.

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

**What CI is building, what it built, and where each node is with it** are one view: a run queued,
building, built or failed on GitHub; then on each node, the artifact downloaded, loaded, started,
checked healthy, or failed at one of those, or skipped for its architecture or its placements. The
GitHub half comes from `hook`, which receives every run's events and today drops all but a
successful completion; the node half from host, which records each stage as it happens.
