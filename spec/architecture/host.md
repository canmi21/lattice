# `host`: deploying to the machine at home

`apps/host` is a small deployment platform for the always-on machine on the home network -- the one
milestones D1 and D2 in [../todo/milestones.md](../todo/milestones.md) assume. An app in this
repository declares that it runs there the way another declares a Worker, and a push to `main` then
reaches it without anybody logging into the machine. Images somebody else publishes are not declared
here; they are managed from host's panel.

The machine has no inbound public address. It reaches out through a Cloudflare tunnel, and it is on
the tailnet. Everything below is shaped by that and by there being exactly one user.

## A deployment is immutable, and an alias points at one

The model is Vercel's. Each commit of an app is one container, started once and never changed; the
name a reader uses is a pointer to one of them. A release starts the new container, checks it, and
moves the pointer. A rollback moves the pointer back, which is why it is instant. A preview is a
deployment's own name, with no pointer involved.

How far a name reaches -- the LAN, the tailnet, or the public through the tunnel -- is a field of the
alias, not of the container.

## The machine pulls; nothing pushes into it

**Rejected: CI building, then SSH-ing in to run `docker compose`.** Two reasons, each sufficient. The
credential CI would hold is root on the machine and a way onto the tailnet, so any compromise of CI --
a poisoned dependency, a hostile action, a leaked secret -- is a compromise of the house. And a
compose file can ask for anything: `privileged`, the host's root as a volume, the Docker socket. A
channel that accepts one has no boundary to enforce.

So the direction is reversed, and trust is moved off the channel.

- CI builds only the apps a push changed, for `linux/arm64`, and pushes each to its own package on
  ghcr, tagged by commit. There is no release per app: this is one repository holding many, and a
  release ritual per app is exactly the cost that stops small apps being written.
- CI attests each image with GitHub's artifact attestation, which binds it to this repository, the
  workflow and the ref, keyless.
- CI then sends a notice -- app, commit, digest -- through the tunnel. There is no polling; the notice
  says exactly what is ready.
- **The notice is a hint, not an authority.** host pulls the digest itself and verifies the
  attestation came from this repository's workflow on `main` before anything runs. A forged notice
  can at worst redeploy a version `main` already signed.

A local deploy is `wrangler deploy`'s shape: built on the Mac, which is arm64 like the machine, and
handed over by a mise task through one interface that answers only on the LAN and the tailnet. What
admits it is the token below, not an attestation.

## What a deployment may ask for is host's decision

An app declares what it needs; host turns that into a container and decides which capabilities
exist at all. The shared network and nothing else, the app's own data directory and nothing else, no
`privileged`, no host network, no Docker socket, resource limits always. This translation is the
whole of what host adds over a compose file, and it is why a manifest declares rather than executes.

## One token, behind two doors

No account system: there is one user. Reaching the panel from the public goes through the tunnel
with Cloudflare Access in front. Behind that, and directly on the LAN and the tailnet, **one long API
token is required everywhere**. host holds the Docker socket, so its token is root on the machine,
and a device on the LAN without it gets nothing.

- It lives in this repository's `secrets.json`, so a mise task deploys without asking. On the
  machine it lives in host's own `.env` and is read back over SSH when forgotten. A browser keeps it
  as a saved password.
- **It never goes to GitHub.** CI holds only an Access service token for the notice endpoint, and
  that endpoint can do nothing but ask host to look. A compromise of CI must not be a compromise of
  the panel, or the reversal above bought nothing.

## host never updates itself; keeper updates host

An updater cannot be the thing it updates: a broken update leaves nothing running that could undo
it. So there are two programs, and each updates the other, never itself.

- **keeper** is small and rarely changes. It takes a new host digest, snapshots host's data
  directory, starts the new host beside the old one, checks it deeply -- it starts, reaches Docker,
  reaches Caddy, reads its own database -- then moves traffic and stops the old one. On any failure
  the old host keeps running and the snapshot is restored.
- **host** deploys everything else, keeper included, with the same start, check and swap.

**host rolls forward, not back.** keeper guards one failure only: a host that does not start.
Anything wrong with a host that does start is fixed by pushing the next host, because that update is
carried by keeper and never by the program that is broken. That is what lets keeper stay small
enough to read at once, and its stability comes from its size rather than from rules about it. CI
builds only what changed, so keeper's image moves only when keeper's code does.

**keeper has its own intake.** A notice for host goes to keeper directly, and keeper accepts a push
on the LAN. Routed through host, a broken host would stand between the fix and the machine.

**The snapshot is what makes a rollback carry state.** `/data` on the machine is btrfs, so a snapshot
is copy-on-write and costs nothing until something is written. A new host that migrated its database
and then failed to start is put back with the database it can read, so no migration has to be
written to be readable by the version before it.

**Rejected: two identical full instances, A active and B standby.** Two holders of the Docker socket
need a leader election, and the standby logic would live inside the program that changes most. The
variant where B catches up once A succeeds also discards the fallback at the moment a latent bug is
still invisible.

The first keeper and host are started by hand. Nothing earlier exists to start them.

## The control plane going down is not an outage

Containers are kept alive by dockerd's restart policy, and routes live in Caddy, not in host. So a
host or keeper that is down means nothing can be deployed, and nothing stops being served. Removing
images no deployment references is host's job, so the machine needs no tending.

## Open

- How a local build crosses the LAN interface: a registry push, or an image archive uploaded to host.
- How routes survive a Caddy restart: Caddy resuming its last configuration, or host reconciling
  them on start.
- Which app in this repository is the first to run there.
