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

- **The console moves here from the platform**, as it is, `apps/console`, still deployed to Workers.
- **One app, two adapters**: Cloudflare's for the edge and Node's for a node, with the read layer
  under the pages swapped by build -- VPC bindings at the edge, its own host on a node.
- **The node's build takes over the panel's writes**, and infra's panel retires.
- **It is polished until the author runs the system from it**, before it is made for anybody else.
