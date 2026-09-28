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

- **The machine and each container**, from the meter, on its socket, which host mounts into
  `telemetry` as it mounts sockets into `cron`. See [meter.md](meter.md).
- **The services**, from host, which writes a snapshot into `telemetry`'s directory whenever an app
  is deployed -- each app's declaration, version, commit, when it was deployed and its recent
  history, with nothing the line above keeps private -- as it writes `schedules.json` for `cron`.
  `telemetry` never asks host's API, which stays the panel's.
- **The work**, from the ledger's counts, on its private scope: tasks per service and hour, and how
  they ended; never a task's summary or events.
- **The status**, from the probe's archive. See [probe.md](probe.md).

## The API

| Route                | Answer                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| `/machine`           | the machine's facts and its latest second                                 |
| `/machine/series`    | its history at the meter's three grains                                   |
| `/services`          | every service: version, state, when deployed, and what it uses now        |
| `/services/{name}`   | one service: its declaration, its history, its series                     |
| `/topology`          | the whole arrangement: services, scopes, labels, schedules, how they meet |
| `/activity`          | tasks per service and hour, and how they ended                            |
| `/status`            | the probe's latest round and its recent history                           |

**What moves is kept five seconds, and the rest a minute**: the gateway keeps an answer as long as
it says, so however many people look, the node is asked for the machine's latest second at most
once every five seconds, and for a service's history once a minute.
