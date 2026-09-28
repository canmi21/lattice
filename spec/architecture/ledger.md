# `ledger`: every task any service was asked to do

`apps/ledger` is the one record of the work the platform's services take on: a capture `shot`
queued, and later whatever a scheduled job, a conversion or an import runs. A service keeps what it
needs to do the work; the ledger keeps that it was asked, by whom, how it went, and keeps it for
good. It is written to by every service and read by the panel, so a task whose result is long gone
-- a picture rolled out of `shot`'s store -- is still a row somebody can find.

## One service, pushed to, never asking

**A service tells the ledger; the ledger never asks a service.** Each change to a task is sent as
the task's whole record, `PUT /tasks/{service}/{id}`, and the ledger keeps the latest it was sent:
the write is an upsert, so sending the same record twice is harmless and states can arrive in any
order without a sequence to keep. A record is:

| Field                                   | What it is                                                           |
| --------------------------------------- | -------------------------------------------------------------------- |
| `service`, `id`                         | the path's two parts: the service's name and its own id for the task |
| `kind`                                  | what was asked, in the service's words: `capture`                    |
| `state`                                 | `queued`, `running`, `done` or `failed`                              |
| `caller`                                | `public`, marked by the gateway, or `ours`                           |
| `asked_at`, `started_at`, `finished_at` | RFC 3339 instants, the last two once they happen                     |
| `summary`                               | a small JSON object the service chooses: for `shot`, the page's URL  |
| `detail`                                | why it failed, in the service's words, when it did                   |

The ledger stamps `updated_at` itself. **A later `asked_at` always replaces what is kept**: it is
the same task asked again, as `shot` asks a failed capture again under its id. Within one asking,
a record without a `finished_at`, or with an older one, does not replace one that has it, so a late
`running` cannot undo a `done`.

**Delivery is the service's to retry, and never its to wait on.** `libs/ledger` is the client every
Rust service uses: a record is handed to it and the call returns at once; a background task sends
it, and holds what could not be sent in a bounded queue, oldest dropped first, trying again with
backoff. A ledger that is down costs records, never a capture.

**It is reached through Caddy, as a scope that is never public**: services write to
`api.canmi.icu/ledger`, which every container reaches, since Caddy admits Docker's private range
there. Like every scope it is on `api.canmi.app` too, where Access stands in front and our Workers
reach it over VPC; it is not in the gateway's table, so the public never does. Nothing asks for a
token, as nothing on the private side does; host is the exception, and the ledger is not host.

## Read by the panel

`GET /tasks` lists records newest first, a page at a time -- `before` an `updated_at` and `id`,
`limit` at most 500 -- narrowed by `service`, `state`, `kind` or `caller`; `GET /tasks/{service}/{id}`
is one. The panel's Tasks page reads these, and the answer is always the envelope. A query that
does not read is forgiven rather than refused: a cursor that does not parse starts from the top, a
filter naming no known value matches nothing, and a limit out of range is brought into it.

**The list is ours alone.** A record carries what somebody asked for -- a capture's URL is someone
else's browsing -- so no route of a public scope lists records; a public caller reads its own task
by the id it was given, from the service that made it.

## Kept for good

**No record is ever deleted.** A row is a few hundred bytes; a year of captures at thousands a day
is tens of megabytes. The ledger's SQLite is `ledger.db` in its own directory, WAL mode, one table
keyed by `service` and `id`, indexed by `updated_at`, and snapshotted with the directory before each
deploy as every app's data is.
