# `cron`: every scheduled job on a node, in one place

`platform/apps/cron` calls the services on a node when their time comes. It does no work of its own: a job is
a service's route, and `cron` is what knows when to ask for it, what came of it, and when it last
did. Workers keep Cloudflare's own cron triggers; this is the node's.

## A job is declared by the service that does it

**A service lists its jobs in its `service.toml`**, beside what it answers, so a job and its route
change together:

```toml
[[schedules]]
name = "refresh"
cron = "0 4 * * *"      # or: every = "1m"
path = "/jobs/refresh"  # asked with POST, under the service's scope
catch_up = "once"       # a run missed while the node was down: "once" or "skip"
overlap = "skip"        # a run due while the last is still going: "skip" or "queue"
timeout = 300           # seconds before a run is called failed
```

- **Every time is UTC.** A cron expression is read in UTC, every instant `cron` keeps or answers is
  UTC, and the panel shows each in the reader's own zone.
- `every` takes seconds, minutes and hours (`30s`, `1m`, `6h`); `cron` takes the five-field form.
  Exactly one of the two.
- A service with jobs is reached one of two ways: through its `[api]` scope, or -- a service that
  answers on a Unix socket and on no port, as `apt` does -- on that socket, which host mounts into
  `cron` for that reason alone.

**`cron` answers on its own `[api]` scope, privately**: `GET /schedules` -- every job, its next
time and its last run -- and `POST /schedules/<service>/<name>/run` to run one now, which the panel
uses. Times are RFC 3339 in UTC.

**host gives `cron` the table**: whenever an app is deployed or removed, host writes every app's
schedules to `schedules.json` in `cron`'s directory, through a temporary file and a rename, as it
tells the meter which container is which. `cron` reads it again when it changes; it asks host for
nothing, and host's API stays the panel's alone.

```json
{
	"jobs": [
		{
			"service": "geo",
			"name": "refresh",
			"cron": "0 4 * * *",
			"every": null,
			"path": "/jobs/refresh",
			"catch_up": "once",
			"overlap": "skip",
			"timeout": 300,
			"reach": { "scope": "geo" }
		},
		{
			"service": "apt",
			"name": "update",
			"cron": "0 7 * * *",
			"every": null,
			"path": "/jobs/update",
			"catch_up": "once",
			"overlap": "skip",
			"timeout": 1800,
			"reach": { "socket": "/sockets/apt/apt.sock" }
		}
	]
}
```

`reach` is how `cron` asks: a scope through Caddy, or a socket at the path host mounted it at --
each socket service's data directory at `/sockets/<service>` in `cron`'s container. **When that set
of services changes, host redeploys `cron`** so its mounts follow: a socket service deployed after
`cron`, in the same CI run or later, is reached without anyone asking.

## A run is a request, and a task in the ledger

**At its time, `cron` asks `POST api.internal.ixc.one/<scope><path>` through Caddy** -- the private side,
which every container reaches -- or `POST <path>` on the service's socket, with the run's id in
`X-Task-Parent: cron:<id>`. A service that
records the work as a ledger task takes that as its `parent`, so the chain reads from the schedule
to everything the run set off.

**Every run is a ledger task of `cron`'s own**, kind `run`, its summary the job's service and name:
`queued` when it falls due, `running` when asked, `done` on a 2xx answer, `failed` on anything
else, on a timeout, or on no answer, with events for each step and the status and time taken. See
[ledger.md](ledger.md).

- **Missed runs**: on start, a job whose last run is older than its schedule allows runs once if
  it catches up, and waits for its next time if it skips. `cron` keeps each job's last run in its
  own SQLite, in its directory.
- **Overlap**: a run due while the last is still going is skipped, recorded as a skipped run, or
  queued behind it, as the job says.

## Seen in the panel

The panel's Schedules page lists every job -- its service, its schedule, when it runs next, how its
last run went, read from the ledger -- and runs one now. **Pausing a job is the repository's
change**, as every setting the panel changes is to be ([host.md](host.md), "One name inside, and a
domain label outside"): until the bot that writes it exists, a pause is `cron`'s own, held until
`cron` restarts, and shown as such.
