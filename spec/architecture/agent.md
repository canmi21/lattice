# `agent`: what the machine is doing

`apps/agent` samples the machine at home every second -- processors, memory, temperatures, disks,
the network -- keeps what it sampled, and answers host, whose panel draws it. It is a process, not
an AI agent: the name is the one monitoring has always used for the small thing that runs on the
machine being watched. host itself stays out of this: it holds the Docker socket and the panel, and
a sampler that stalled or leaked inside it would take both down with it.

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
