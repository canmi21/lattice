# Databases: Postgres, as a driver beside an app

Our own services keep SQLite, one file each -- see [services.md](services.md). Some programs we
adopt rather than write keep nothing but Postgres; umami was why, and is not run any more -- see
[../analytics.md](../analytics.md) -- and a ClickHouse driver built for OpenPanel went with it. For
such a program a database is a capability an app declares, run the way
[objects.md](objects.md) runs Versity: **one driver image, a sidecar per app over the app's own
directory**. The driver is shared, the data never is.

## Declared by the app, run beside it

```toml
[postgres]
memory_mb = 192
```

**An app asks with `[postgres]` in its `service.toml`, and host runs `<app>-postgres` beside
it**, on the same terms as an objects sidecar:

- **The data is the app's**: the sidecar mounts `/data/apps/<app>/postgres/` and nothing else, so the snapshot a deploy takes holds the
  database, and a rollback with data puts it back.
- **It is on its app's network and no other**, reached by the app at the sidecar's name; no name
  is routed to it, and no other app is on it.
- **It lives and dies with its app** -- started before it and healthy within thirty seconds,
  stopped after it -- and an app that declares one while its driver is not deployed is refused.
- **It runs as the database's own user, never root**, over a directory host made and gave to that
  user before the first start, with a read-only root and the scratch paths the database writes as
  tmpfs. Its memory ceiling is the app's `memory_mb` for it, or the driver's default.
- **The app is handed the binding as its environment**, made once by host and kept in the app's
  `secret.env`, the sidecar given the same credentials as its owner:
  `DATABASE_URL`, `postgresql://<app>:<password>@<app>-postgres:5432/<app>`.
- **The password is made once and never rotated by host**: the URL in `secret.env` is the record
  of it, read back on every start, and a URL edited past reading fails the deploy rather than being
  replaced. Postgres takes its password only when it first makes the cluster, so a new one is set
  inside the database first and in the URL after.
- **A driver keeps its database's own port** -- 5432 -- outside the range an app's port is
  drawn from, since nothing but its app ever dials it.

The name `postgres` is reserved, and so is every `<app>-postgres`.

## The drivers

**`platform/apps/postgres` is the official `postgres` image at a pinned major and digest**, adopted rather
than rebuilt, with settings for a small instance: `shared_buffers` 32 MB, no parallel workers,
twenty connections. Deploying it recreates each app's sidecar on the new image, one at a time, and
a failure puts every one back -- as `objects` does. A new major is not a deploy: Postgres needs its
data upgraded between majors, so a new major is a new driver, `postgres18`, and an app moves when
it is ready.
