# `telemetry`: the platform, shown to anyone

The platform's code is public, and so is what it is doing: which services run, at which versions,
how the machine under them is, how much work they take on. `apps/telemetry` gathers that into one
public, read-only API, which a page under `canmi.app` draws for anyone who wants to see how it is
built. It answers on the `telemetry` scope of the public API host, through the gateway, with its
caching and its limits.

## What is public, and what is not

**The line is git.** What the repository already says is public, since the source is: every
service, its version and commit, its declaration -- memory ceiling, scopes, labels, schedules --
and the topology they make. So is what the node measures of itself: the machine's metrics, each
container's, and how many tasks each service took on and how they ended.

**What never reached the repository stays private**: every secret and token, every environment
value, Cloudflare's own settings, and anything somebody sent -- a task's contents, such as the page
a capture was of, and every log line. Private addresses stay private too, since they are the node's
wiring rather than its design.

## Where it comes from

`telemetry` asks nothing that could change anything, and reaches each source the way the platform
already does:

- **The machine and each container**, from the meter, on its socket. telemetry's shape is
  `Reporter`: sandboxed like any app, on its own network, plus the meter's directory bound at
  `/sockets/meter`, as `cron`'s shape binds the sockets it calls. See [meter.md](meter.md),
  "Reached through a socket".
- **The services**, from host, which writes `services.json` into `telemetry`'s directory, as it
  writes `schedules.json` for `cron`: at start, and whenever an app is deployed, rolled back,
  stopped or started. `telemetry` never asks host's API, which stays the panel's.
- **The work**, from the ledger's counts, `GET /counts` on its private scope: tasks per service and
  hour, and how they ended; never a task's summary or events. See [ledger.md](ledger.md), "Counted
  for telemetry".
- **The status**, from the probe's archive, once the probe runs. See [probe.md](probe.md).

## `services.json`, what host tells

```json
{
	"written_at": "2026-09-28T23:00:00Z",
	"apps": [
		{
			"name": "shot",
			"image": "…",
			"deployed_at": "2026-09-28T22:40:00Z",
			"held": false,
			"declaration": { "version": 1, "name": "shot", "placements": ["home"], "container": {} },
			"history": [
				{
					"action": "deploy",
					"source": { "kind": "run", "run": 1234, "commit": "…" },
					"image": "…",
					"outcome": "succeeded",
					"started_at": "…",
					"finished_at": "…"
				}
			]
		}
	]
}
```

- **`declaration` is the app's `service.toml` whole**, since every line of it is in git; nothing
  host adds to it -- an environment, a path on the machine, an address -- is written.
- **`history` is the app's latest twenty rows**, newest first, each without its `detail` and its
  snapshot's name: why a deploy failed is in the words of whatever failed, which may name what is
  private.
- It is written whole to a temporary file and renamed over the last, so `telemetry` never reads
  half of one, and is read again whenever it changes.

## The service

`apps/telemetry` is a Rust service on port `19570` -- Sputnik sent the first telemetry in 1957 --
answering on the `telemetry` scope, public, every answer the envelope. It keeps nothing of its
own: each answer is built from the three sources as they stand, and a source that cannot be read
leaves its part `null` rather than failing the rest.

## The API

| Route              | Answer                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| `/machine`         | the machine's facts and its latest second                                 |
| `/machine/series`  | its history at the meter's three grains                                   |
| `/services`        | every service: version, state, when deployed, and what it uses now        |
| `/services/{name}` | one service: its declaration, its history, its series                     |
| `/topology`        | the whole arrangement: services, scopes, labels, schedules, how they meet |
| `/activity`        | tasks per service and hour, and how they ended                            |
| `/status`          | the probe's latest round and its recent history                           |

**What moves is kept five seconds, and the rest a minute**: the gateway keeps an answer as long as
it says, so however many people look, the node is asked for the machine's latest second at most
once every five seconds, and for a service's history once a minute.

Each answer says so in `Cache-Control: public, max-age=5` or `max-age=60`: `/machine` and
`/services` the first, the rest the second. `/machine` reads the meter's `/now`;
`/machine/series` and a service's series pass `grain`, `since` and `until` on to its `/series`
and `/containers/series`, with the metrics chosen here rather than by the caller. `/topology` is
drawn from `services.json` alone; `/activity` takes `hours`, 1 to 168 and 24 when absent.
