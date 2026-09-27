# `host`: deploying to the machine at home

`apps/host` is a small deployment platform for the always-on machine on the home network -- the one
milestones D1 and D2 in [../todo/milestones.md](../todo/milestones.md) assume. An app in this
repository declares that it runs there the way another declares a Worker, and a push to `main` then
reaches it without anybody logging into the machine. Images somebody else publishes are not declared
here; they are managed from host's panel.

The machine has no inbound public address. It reaches out through a Cloudflare tunnel, and it is on
the tailnet. Everything below is shaped by that and by there being exactly one user. Which services
are placed on it, and how names and APIs reach them, is [services.md](services.md).

## One name, everywhere

An app has one name, and every place it appears is that name: `gemini` is the app in host, the
container, `/data/apps/gemini/` on the machine, `gemini.canmi.icu` privately and `gemini.canmi.net`
publicly. Nothing maps one spelling to another, so nothing can disagree.

- A name is a DNS label: lowercase letters, digits and hyphens.
- Apps from this repository and images from elsewhere share the one namespace.
- `host` and `keeper` are reserved for the two programs below, `api` for the API host, and
  `caddy` and `cloudflared` because a container's name is the app's and those two already run.

`.icu` is private and `.net` is public, and what each admits is
[services.md](services.md), "A domain says who can reach it, not what is behind it".

## One version runs, and a failed deploy puts the last one back

**Each app runs exactly one container.** A deploy stops it, snapshots its directory, starts the new
image and checks it. If the check fails, the directory is put back from the snapshot and the
previous image is started again. A deploy costs a few seconds of the app being down, which one user
accepts; what it buys is that two versions never write the same data at once.

**Rejected: Vercel's model of immutable deployments behind a moving alias.** It runs old and new side
by side, which is what makes its rollback instant and its releases gapless. Both are worth something
to many users sharing a service. Here they cost two copies of every app, and two processes over one
SQLite file, to save a pause nobody else sees.

The snapshot is taken after the container stops, so it is never of a database halfway through a
write. `/data` is btrfs and **each app's directory is its own subvolume**, so the snapshot is atomic,
covers exactly that app, and costs nothing until something is written. The directory is therefore
created with `btrfs subvolume create`, never `mkdir`: a plain directory cannot be snapshotted alone.

**Two rollbacks, and only one restores data.** A deploy that fails its check restores the snapshot,
since the new version may already have changed the data. Going back to an older version days later
starts the older image on the current data, since restoring would erase everything written since. The
second is a choice offered, never a default.

host keeps the previous image of every app and the last few snapshots, and removes the rest. Nothing
else on the machine needs tending.

## The machine pulls; nothing pushes into it

**Rejected: CI building, then SSH-ing in to run `docker compose`.** Two reasons, each sufficient. The
credential CI would hold is root on the machine and a way onto the tailnet, so any compromise of CI --
a poisoned dependency, a hostile action, a leaked secret -- is a compromise of the house. And a
compose file can ask for anything: `privileged`, the host's root as a volume, the Docker socket. A
channel that accepts one has no boundary to enforce.

So the direction is reversed, and trust is moved off the channel.

- CI builds only the apps a push changed, for `linux/arm64`, as an image archive, and uploads it as
  an artifact of that workflow run. **Nothing is published**: no release, no package, no registry.
  This is one repository holding many apps, and a publishing ritual per app is exactly the cost that
  stops small apps being written.
- CI attests the archive with GitHub's artifact attestation, which binds it to this repository, the
  workflow and the ref, keyless. The attestation lives in GitHub's attestation API and is not a
  publication either.
- CI then sends a notice naming the app and the commit, through a Worker that verifies GitHub's
  OIDC token for the run -- see [services.md](services.md), "Every node is the same node". There is
  no polling; the notice says exactly what is ready.
- host finds the run by the commit, downloads the artifact with a read-only token scoped to this
  repository's Actions, and **verifies the attestation came from this repository's workflow on
  `main` before anything runs**. The notice is a hint, not an authority: a forged one can at worst
  redeploy a version `main` already signed.

An artifact expires after its retention period. That does not matter to a deploy, since the image is
on the machine once loaded, and a rollback uses the image host kept.

A local deploy is `wrangler deploy`'s shape: built on the Mac, which is arm64 like the machine, into
the same archive, and uploaded by a mise task to an interface that answers only on the LAN and the
tailnet. What admits it is the token below, not an attestation. So there is one artifact format with
two sources, and no registry anywhere.

## What a deployment may ask for is host's decision

An app declares what it needs; host turns that into a container and decides which capabilities exist
at all. A network of its own shared with Caddy alone, the app's own directory and nothing else, no
`privileged`, no host network, no Docker socket, resource limits always. This translation is the
whole of what host adds over a compose file, and it is why a manifest declares rather than executes.

### The declaration is `service.toml`, beside the Dockerfile

An app states what it needs in `apps/<name>/service.toml` and ships it with its image. host is a
program deployed apart from the file it reads, so the file carries a `version` and host refuses one
it does not know before reading anything else, while a key it does not know is ignored -- see the
workspace's `json.md`. What the keys are is [manifest.rs](../../apps/host/src/manifest.rs); host
reads geo's own file in its tests, so the reader and a real declaration cannot drift apart.

An upload is written to disk whole before anything is stopped, so a transfer cut short never leaves
an app down.

## One token, behind two doors

No account system: there is one user. Reaching the panel from the public goes through the tunnel
with Cloudflare Access in front. Behind that, and directly on the LAN and the tailnet, **one long
API token is required everywhere** -- the one exception to the apps behind Caddy authenticating
nothing. host holds the Docker socket, so its token is root on the machine, and a device on the LAN
without it gets nothing.

- It lives in this repository's `secrets.json`, so a mise task deploys without asking. On the
  machine it lives in host's own `.env` and is read back over SSH when forgotten. A browser keeps it
  as a saved password.
- **It never goes to GitHub**, and neither does anything else: CI's notice is admitted by the OIDC
  token GitHub mints per run, and can do nothing but ask host to look. A compromise of CI must not
  be a compromise of the panel, or the reversal above bought nothing.

## host never updates itself; keeper updates host

An updater cannot be the thing it updates: a broken update leaves nothing running that could undo
it. So there are two programs, and each updates the other, never itself.

- **keeper** is small and rarely changes. It deploys host by the same stop, snapshot, start and check
  as any app, with a deeper check -- host starts, reaches Docker, reaches Caddy, reads its own
  database -- and on failure puts the previous host back.
- **host** deploys everything else, keeper included.

**host rolls forward, not back.** keeper guards one failure only: a host that does not start.
Anything wrong with a host that does start is fixed by pushing the next host, because that update is
carried by keeper and never by the program that is broken. That is what lets keeper stay small
enough to read at once, and its stability comes from its size rather than from rules about it. CI
builds only what changed, so keeper's image moves only when keeper's code does.

**keeper has its own intake.** A notice for host goes to keeper directly, and keeper accepts an upload
on the LAN. Routed through host, a broken host would stand between the fix and the machine.

**Rejected: two identical full instances, A active and B standby.** Two holders of the Docker socket
need a leader election, and the standby logic would live inside the program that changes most. The
variant where B catches up once A succeeds also discards the fallback at the moment a latent bug is
still invisible.

The first keeper and host are started by hand. Nothing earlier exists to start them.

## The control plane going down is not an outage

Containers are kept alive by dockerd's restart policy, and routes live in Caddy, not in host. So a
host or keeper that is down means nothing can be deployed, and nothing stops being served.

**A node's Docker starts only once `/data` is mounted.** Every container binds a path under it, and
Docker started without it creates those paths empty on the root disk: Caddy comes up with no
configuration, host with a new database, and every app on nothing, all of it looking like a clean
start. `/data` keeps `nofail` in fstab, so a node with a failed disk still boots and answers ssh,
and a drop-in gives the Docker unit `RequiresMountsFor=/data`, so it waits for the mount and does
not start without it. Nothing needs starting in order beyond that: every container restarts on its
own policy, and Caddy starts from the file host last wrote whether or not host is up yet.

### host renders all of Caddy, and Caddy remembers nothing

Caddy's whole configuration is derived from host's state: every app, every name, every upstream that
is not a container -- the NAS behind `nas.canmi.net` is one. host renders it complete, writes it to
the file Caddy starts from, and then loads the same bytes through Caddy's admin API. Never a partial
patch, never Caddy's own autosave, never `--resume`. A full render is cheap, and one derivation means
the state host shows is the state being served.

**The file is what keeps this section true.** Pushed alone, a Caddy that restarts before host --
after a reboot, say -- would start empty and serve nothing until host came up. The file is written
by host and is the same bytes it pushes, so it is not a second record, and Caddy recovers alone.

The Caddyfile is retired with this. What it held by hand is entries in host.

**Caddy's admin endpoint is a unix socket, never a port.** Every app shares a network with Caddy,
so an admin port would let any app rewrite every route. The socket sits in a directory only Caddy
and host mount.

**A Caddy container that is recreated, not restarted, comes back attached to no app's network.**
host attaches it to all of them again whenever it starts and whenever it is asked to reapply, so the
remedy is one request rather than a list of commands.

## Open

What is still undecided about placing services here is listed in [services.md](services.md).
