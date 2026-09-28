# `cron`: every scheduled job on a node, in one place

`apps/cron` calls the services on a node when their time comes. It does no work of its own: a job is
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
- A service with jobs has to have an `[api]` section, since a job is reached through it.

**host gives `cron` the table**: whenever an app is deployed or removed, host writes every app's
schedules to `schedules.json` in `cron`'s directory, through a temporary file and a rename, as it
tells the meter which container is which. `cron` reads it again when it changes; it asks host for
nothing, and host's API stays the panel's alone.

## A run is a request, and a task in the ledger

**At its time, `cron` asks `POST api.canmi.icu/<scope><path>` through Caddy** -- the private side,
which every container reaches -- with the run's id in `X-Task-Parent: cron:<id>`. A service that
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
