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
