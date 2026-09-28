# `ledger`: every task any service was asked to do

`apps/ledger` is the one record of the work the platform's services take on: a capture `shot`
queued, and later whatever a scheduled job, a conversion or an import runs. A service keeps what it
needs to do the work; the ledger keeps that it was asked, by whom, how it went, and keeps it for
good. It is written to by every service and read by the panel, so a task whose result is long gone
-- a picture rolled out of `shot`'s store -- is still a row somebody can find.

## A task, and the events that make it up

**The ledger's model is a task and the events inside it, in order.** A service's log lines lose
both: which task a line belongs to, and where among its lines it falls once several tasks interleave.
Here every event belongs to one task and carries its place in it.

A **task** is one thing a service was asked to do:

| Field                                   | What it is                                                           |
| --------------------------------------- | -------------------------------------------------------------------- |
| `service`, `id`                         | the service's name and its own id for the task                       |
| `kind`                                  | what was asked, in the service's words: `capture`                    |
| `state`                                 | `queued`, `running`, `done` or `failed`                              |
| `caller`                                | `public`, marked by the gateway, or `ours`                           |
| `parent`                                | the task that asked for this one, `{ service, id }`, when a task did |
| `asked_at`, `started_at`, `finished_at` | RFC 3339 instants, the last two once they happen                     |
| `summary`                               | a small JSON object the service chooses: for `shot`, the page's URL  |
| `detail`                                | why it failed, in the service's words, when it did                   |

An **event** is one step of a task, appended and never changed:

| Field                    | What it is                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `service`, `task`, `seq` | the task it belongs to, and its place there: a number that only grows within the task |
| `at`                     | when, an RFC 3339 instant                                                             |
| `stage`                  | the step, in the service's words: `resolving`, `loading`, `rendering`, `storing`      |
| `level`                  | `info`, `warn` or `error`                                                             |
| `message`                | one line for a person                                                                 |
| `data`                   | a small JSON object, when the step has figures worth keeping                          |

**Order is `seq`, never arrival.** The client numbers a task's events as the service makes them --
the moment in nanoseconds, or one past the task's last number when the clock has not moved on, so a
service restarted mid-history never reuses a number -- and so
a batch sent late, a retry, or two batches crossing change nothing about the order the ledger
answers with. A task's state changes are events too -- `queued`, `running`, `done`, `failed` as
stages -- and the task's row is kept in step with them in the same transaction.

**`parent` ties a chain together across services**: a scheduled job that asks `shot` for a capture
is the capture's parent, so one look follows the work from what started it to everything it
started.

## Pushed to, never asking

**A service tells the ledger; the ledger never asks a service.** `POST /events` takes a batch, each
item either a task -- its whole record, kept as the latest one sent -- or an event, kept once by its
`(service, task, seq)` so a batch sent twice is harmless. `PUT /tasks/{service}/{id}` stays for a
single task.

The ledger stamps a task's `updated_at` itself. **A later `asked_at` always replaces what is kept**:
it is the same task asked again, as `shot` asks a failed capture again under its id. Within one
asking, a record without a `finished_at`, or with an older one, does not replace one that has it,
so a late `running` cannot undo a `done`. An event of a later asking follows the earlier asking's
events in `seq`, since its numbers are later moments.

**Delivery is the service's to retry, and never its to wait on.** `libs/ledger` is the client every
Rust service uses: a task or an event is handed to it and the call returns at once; a background
task sends them in batches, and holds what could not be sent in a bounded queue, oldest dropped
first, trying again with backoff. A ledger that is down costs records, never a capture.

**It is reached through Caddy, as a scope that is never public**: services write to
`api.canmi.icu/ledger`, which every container reaches, since Caddy admits Docker's private range
there. Like every scope it is on `api.canmi.app` too, where Access stands in front and our Workers
reach it over VPC; it is not in the gateway's table, so the public never does. Nothing asks for a
token, as nothing on the private side does; host is the exception, and the ledger is not host.

## Read by the panel

`GET /tasks` lists tasks newest first, a page at a time -- each item carries its `cursor`, and
`before=<cursor>` of the last one asks for the next page, `limit` at most 500 -- narrowed by `service`, `state`, `kind`, `caller` or `parent`;
`GET /tasks/{service}/{id}` is one, with its events in `seq` order and the tasks it is the parent
of. The panel's Tasks page reads these: a list, and a task as a timeline -- each step, how long it
took, where it failed, what started it and what it started. The answer is always the envelope. A
query that does not read is forgiven rather than refused: a cursor that does not parse starts from
the top, a filter naming no known value matches nothing, and a limit out of range is brought into
it.

**The list is ours alone.** A record carries what somebody asked for -- a capture's URL is someone
else's browsing -- so no route of a public scope lists records; a public caller reads its own task
by the id it was given, from the service that made it.

## Kept for good, in SQLite

**Nothing is ever deleted, tasks or events.** A task is a few hundred bytes and an event less; a
year of captures at thousands a day, each a handful of events, is some hundreds of megabytes. The
ledger's SQLite is `ledger.db` in its own directory, WAL mode, a table of tasks keyed by `service`
and `id` and indexed by `updated_at`, and a table of events keyed by `service`, `task` and `seq`,
snapshotted with the directory before each deploy as every app's data is.

**It is written by one process, in batches**, which is what SQLite does best: every write reaches
the ledger over HTTP, so there is one writer however many services report, and a batch is one
transaction. It stays SQLite until writes outrun batching, several ledgers must write one history,
or questions over the whole history want what PostgreSQL does -- and then the ledger alone gets a
PostgreSQL of its own, per [services.md](services.md), "A service keeps its data in SQLite, in its
own directory". No service changes when it does, since none of them sees the ledger's storage.
