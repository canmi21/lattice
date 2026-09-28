# `agent`: what the machine is doing

`apps/agent` samples the machine at home every second -- processors, memory, temperatures, disks,
the network -- keeps what it sampled, and answers host, whose panel draws it. It is a process, not
an AI agent: the name is the one monitoring has always used for the small thing that runs on the
machine being watched. host itself stays out of this: it holds the Docker socket and the panel, and
a sampler that stalled or leaked inside it would take both down with it.

## Run beside the machine, not inside it

**A container, in a shape of its own that its name chooses: the observer.** It is sandboxed as any
app is -- no capabilities, a read-only root, its own directory, a memory ceiling -- with three
differences, and host gives them to the name `agent` and to nothing else:

- **No network.** Not even the app network Caddy shares; it is reached on its socket, below.
- **The machine's PIDs.** So PID 1 is the machine's, and its network namespace is the one the
  network counters are read from.
- **The machine's `/proc` and `/sys`, read-only, at `/host/proc` and `/host/sys`.** Its own `/sys`
  would not do: Docker masks `/sys/firmware`, where the board names itself. The image points the
  agent at the two with `AGENT_PROC` and `AGENT_SYS`.

It is built and deployed as geo is, from its `service.toml`, by CI and by host; being reserved,
the name cannot be taken by an app, and host is the only one that deploys it.

## Metrics

**A sample is flat: one number per named metric.** Keeping, summarizing and drawing are then the
same work whatever is measured, and a metric a later machine has, or lacks, is a name more or fewer
rather than a change of shape. Names are dotted, lowercase and spelled out.

| Metric                                      | Unit                 | From                               |
| ------------------------------------------- | -------------------- | ---------------------------------- |
| `cpu.usage`, `cpu.iowait`                   | percent of all ticks | `/proc/stat`                       |
| `cpu.core.<n>.usage`                        | percent of its ticks | `/proc/stat`                       |
| `cpu.core.<n>.frequency`                    | MHz                  | cpufreq's `scaling_cur_freq`       |
| `load.1`, `load.5`, `load.15`               | runnable tasks       | `/proc/loadavg`                    |
| `memory.used`, `memory.cached`, `swap.used` | bytes                | `/proc/meminfo`                    |
| `temperature.<zone>`                        | degrees Celsius      | `/sys/class/thermal`               |
| `network.received`, `network.sent`          | bytes per second     | `/proc/1/net/dev`                  |
| `disk.read`, `disk.written`                 | bytes per second     | `/proc/diskstats`                  |
| `storage.used`                              | bytes                | `statvfs` of the agent's directory |

- `memory.used` is total less available, which is what the kernel says can be had without
  swapping; `cached` is page cache plus buffers, shown beside it rather than subtracted twice.
- A zone is named by its type with `-thermal` dropped: `soc`, `gpu`, `bigcore0`.
- The network counts interfaces that leave the machine. Loopback, container veths, bridges and
  tunnels (`tailscale`, `tun`, `wg`) are left out, because each carries bytes a physical interface
  already counted or none that left. It is read through PID 1 because the agent has no network of
  its own and shares the machine's PIDs, so PID 1's namespace is the machine's.
- Disks are the devices under `/sys/block`, less `loop`, `ram` and `zram`: whole disks, so a
  partition's bytes are not counted twice.
- A rate is the counter's difference over the seconds between the two readings; a counter that went
  backwards was reset, and reads as zero rather than as a negative.

What does not change while the machine is up is read once, as its info: the board's model from the
device tree, the kernel release, the core count and each core's maximum frequency, total memory and
swap, and when it booted.

## Retention

**Three grains, rolling: a point a second for the last minute, a point a minute for the last hour,
and a point an hour for good.** The first two are memory and go with the process; the hours are one
SQLite file, `hours.db`, in the agent's directory, and nothing ever deletes from it. The hour is the
coarsest grain on disk, so a year is some twenty metrics times 8,760 rows, which is nothing.

- A minute or an hour point carries each metric's average, minimum and maximum, and how many
  samples it summarizes. The count is what lets two halves of one hour be merged by weight.
- Every sample goes into the open minute and the open hour directly, so an hour's average is over
  its seconds rather than an average of averages.
- An hour is written when a sample arrives in the next one. A stopping agent writes the hour still
  open, and the same hour's rows are merged rather than replaced when it is written again after the
  restart. A gap -- the machine off -- simply closes what was open.
- A series at the hour grain includes the open hour, so a chart reaches the present.
- A metric is asked for by name or by a dotted prefix of it: `cpu.core` is every core's usage and
  frequency. Asking for none is asking for all.

## Reached through a socket

**The agent has no network and no port. It answers HTTP on `agent.sock` in its own directory**,
which is `/data/apps/agent/agent.sock` on the machine, and host, which mounts `/data`, reads it
there. Nothing else can reach it, so it needs no token, and what it answers goes to the panel only
through host's API, behind host's session.

| Route                                       | Answers                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `GET /health`                               | success, once it is serving                                       |
| `GET /info`                                 | what does not change while the machine is up                      |
| `GET /now`                                  | `{ info, sample }`; `metrics_unavailable` before the first sample |
| `GET /series?grain=&metrics=&since=&until=` | points, oldest first                                              |

`grain` is `second`, `minute` or `hour`; `metrics` is names or prefixes separated by commas;
`since` and `until` are whole seconds since the epoch, `since` inclusive, both optional. Each point
is `{ at, values: { <metric>: { average, minimum, maximum, count } } }`, the same at every grain,
so a chart draws one shape.

**The panel reads it through host, at `/api/node/now` and `/api/node/series`,** which pass the
query on and the agent's answer back unchanged, behind host's session like every other `/api`
route. host finds the socket from the agent it deployed -- `/data/apps/agent/data/` and the file the
declaration names -- and answers `agent_unavailable` when none is deployed or nothing answers.

A tick runs on its own thread, on the second, and the socket is served beside it. SIGTERM ends the
serving, writes the open hour, and removes the socket; one left behind by a run that did not stop
is removed before binding.
