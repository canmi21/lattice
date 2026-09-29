# Databases: Postgres and ClickHouse, as drivers beside an app

Our own services keep SQLite, one file each -- see [services.md](services.md). Some programs we
adopt rather than write keep nothing but Postgres, or keep their events in ClickHouse: umami, and
later OpenPanel. For those a database is a capability an app declares, run the way
[objects.md](objects.md) runs Versity: **one driver image, a sidecar per app over the app's own
directory**. The driver is shared, the data never is.

## Declared by the app, run beside it

```toml
[postgres]
memory_mb = 192

[clickhouse]
memory_mb = 1536
```

**An app asks with `[postgres]` or `[clickhouse]` in its `service.toml`, and host runs
`<app>-postgres` or `<app>-clickhouse` beside it**, on the same terms as an objects sidecar:

- **The data is the app's**: the sidecar mounts `/data/apps/<app>/postgres/` or
  `/data/apps/<app>/clickhouse/` and nothing else, so the snapshot a deploy takes holds the
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
  - Postgres: `DATABASE_URL`, `postgresql://<app>:<password>@<app>-postgres:5432/<app>`.
  - ClickHouse: `CLICKHOUSE_URL`, `http://<app>:<password>@<app>-clickhouse:8123/<app>`.
- **The password is made once and never rotated by host**: the URL in `secret.env` is the record
  of it, read back on every start, and a URL edited past reading fails the deploy rather than being
  replaced. Postgres takes its password only when it first makes the cluster, so a new one is set
  inside the database first and in the URL after.
- **A driver keeps its database's own port** -- 5432, 8123 -- outside the range an app's port is
  drawn from, since nothing but its app ever dials it.

The names `postgres` and `clickhouse` are reserved, and so is every `<app>-postgres` and
`<app>-clickhouse`.

## The drivers

**`apps/postgres` is the official `postgres` image at a pinned major and digest**, adopted rather
than rebuilt, with settings for a small instance: `shared_buffers` 32 MB, no parallel workers,
twenty connections. Deploying it recreates each app's sidecar on the new image, one at a time, and
a failure puts every one back -- as `objects` does. A new major is not a deploy: Postgres needs its
data upgraded between majors, so a new major is a new driver, `postgres18`, and an app moves when
it is ready.

**`apps/clickhouse` is built here, from source**, because the node's RK3576 -- Cortex-A72 and A53
-- is ARMv8.0, ClickHouse's own arm64 build needs ARMv8.2 and dies on it with `SIGILL`, and the
build that does not, `aarch64v80compat`, is published for master alone, never for a release. Its
Dockerfile clones the newest stable release tag of ClickHouse and compiles the `clickhouse` target
alone with `NO_ARMV81_OR_HIGHER=1` -- no tests, nothing else -- into an image with that one
binary. CI builds it natively on its arm64 runner like any app, only when `apps/clickhouse`
changes, since a build takes hours; which release it built is in the image's labels and its
`clickhouse --version`.

## CI makes room first

**Every build job frees the runner's disk before it builds**: the hosted image carries toolchains
nothing here uses -- Android's SDK, .NET, GHC, CodeQL's bundle, cached images -- some tens of
gigabytes that a large compile needs and an ordinary image does not mind losing.

## Open

- **Redis and OpenPanel follow once ClickHouse runs on the node**, the same way: a `redis` driver,
  and OpenPanel an app declaring all three. See [analytics.md](../analytics.md), "Open".
