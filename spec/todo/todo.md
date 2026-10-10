# Todo: what is decided and waiting

Work this repository has agreed to and not finished. Open questions are
[../issues/issues.md](../issues/issues.md) and the direction is [../roadmap.md](../roadmap.md); how the
three divide the work is the workspace's `spec/planning.md`. An entry names the work and where its
detail is written; it carries no argument of its own.

## The milestones

[milestones.md](milestones.md) is the agreed plan, in order. Waiting now:

- **Near**: A2, the records are imported; A5, article metadata leaves the text; B4, metadata has a
  surface; B5, images are managed.
- **Mid**: A7, one rid over every language; A8, reader state keyed by rid; B6, publishing from the
  CMS; B7, albums; B8, reader data has a surface; C0 to C5, storage and the boundary between roles.

The long-term group, D, is the direction rather than waiting work -- see [../roadmap.md](../roadmap.md).

## The service domains' pages

What [../architecture/landing.md](../architecture/landing.md) decides and is not built:

- **`symlink.si` leaves `apps/landing`** for a static site of its own on the CDN, proxied by
  Cloudflare, with the names laid over it as a Worker route. The host's side is the platform's, in
  platform's `spec/todo/todo.md`.
- **`monoflake.com` gets a site of its own**, and `monoflake.net` sends to it.
- **The records that send `ixc.one` and `il.lli.lil.ill.li` to `apps/landing`.**

## The console

In order, each when the one before it is done -- [../roadmap.md](../roadmap.md), "One console runs
the system, and it is this layer's":

- **The console is deployed by the platform's deployer**, once web is admitted -- platform's
  `spec/architecture/deployer.md`, "Admitting a repository".
- **It writes**: restart, deploy and roll back, by a path that lends a Worker no node's root token.
- **It shows the schedules and the tasks**: cron's jobs and the ledger's records, which infra's
  panel showed until it retired.
- **It is polished until the author runs the system from it**, before it is made for anybody else.

## The console's reads move to the backend

[../architecture/console.md](../architecture/console.md), "The console's server never waits on
data; it only draws", has the console's server read only what the platform's backend holds. These
still fan out across the nodes from the Worker, each to become one read of the nearest relay:

- **The fleet's readings**: `fleetNow` and `fleetSeries` on Nodes.
- **The database's primary**: `primaryOf`, which asks each node's proxy in turn.

## The console's facets

[../architecture/console.md](../architecture/console.md), "A component asks for its facet", is the
overview's. The rest follow it:

- **The routes still answered by name move under `/api/`**: `/state` and `/nearest`, the app
  page's `health`, and `/live`, whose socket is answered before any page and wants care.
- **Every other page's load reads facets**, the nodes lean wherever no events are drawn; the
  node's page, which draws them, keeps the whole.
- **The timeline's steps are written once and referred to after**: nodes, apps and sources named
  once and each step by number, its times as numbers; 308 KB and 42 KB compressed for a week on
  2026-10-10, read after the first paint.

## The console's depth

What the console's pages draw around today, each waiting on the service that holds the fact --
[../architecture/console.md](../architecture/console.md):

- **The meter reports a node's architecture** in its machine info; the console reads it from the
  kernel release meanwhile, and Alpine's `-virt` kernels give none.
- **The hook keeps every `workflow_run` event**, queued and in progress as well as completed, with
  the commit message, branch and actor, so the queue shows a run before any node sees it.
- **Host stamps each stage of a deploy**, not only the last one reached, so a run's timeline has a
  bar per stage.
- **Host records the repository an app was built from**, on the app and on each deploy event, so
  the console's scope of an app is a fact it reads rather than a list of names it keeps beside
  infra's and the platform's apps.
- **One list of the ranges**, `1h` to `30d`, in place of the three the pages carry, and run grouping
  moved out of `lib/server/` so the live panel stops keeping its own copy.
