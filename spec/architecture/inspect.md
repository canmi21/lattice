# Inspect: what the node is, asked of host

An agent working on the platform used to answer its questions over SSH: which containers run, on
which networks, with which mounts; what a directory holds; whether the kernel killed something.
**host answers them instead, read-only, on its API, behind its token**, and SSH is kept for the
day that API is what broke. The same answers are what the panel's pages draw -- its file manager,
its view of containers -- and what `mise run infra` prints, so each is built once, in host, the one
program with the Docker socket and the whole of `/data`.

## What is answered

Each is its own module in host, under `/api/inspect/`, and each is read-only:

| Route                        | Answer                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `containers`                 | every container on the machine, whoever started it: state, image, networks and addresses, mounts, memory ceiling, restarts, and whether the kernel killed it for memory |
| `networks`                   | every Docker network and who is on it                                                          |
| `disk`                       | each filesystem's use, every app's subvolume and its size, and the snapshots kept              |
| `files/<app>[/<path>]`       | a directory under an app's own, listed: each entry's name, kind, size and modification time -- never a file's contents |
| `kernel`                     | the kernel's recent memory kills and other events worth an alarm, from its log                 |

**No route takes anything that becomes a command, and none writes.** A path under `files/` is
resolved inside the app's directory and refused if it would leave it. What changes the node stays
with the actions host already has -- deploy, restart, and the rest -- and a question that needs
more is answered by a new read-only module, never by running something on request.

## An app's environment is asked where it is kept

The environment is not an inspect route: it is `/api/apps/<app>/environment`, which answers every
variable's **name and type** -- `config` or `secret` -- with a `config` value and never a
`secret`'s, and takes a new value for either by `PUT`. What the panel shows, what the CLI prints,
and what a change writes are that one route. See [host.md](host.md), "An app's environment is two
files, and the panel shows one".

## `mise run infra`

`mise run infra <what> [app] [path]` asks the panel's address with the token mise decrypts, and
prints the answer as a table: `mise run infra containers`, `mise run infra files geo`,
`mise run infra env shot`. It is how an agent reads the node, and it is the first thing reached
for, before SSH.
