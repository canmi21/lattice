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
container, `/data/apps/gemini/` on the machine, `gemini.canmi.icu` privately and `gemini.canmi.app`
publicly. Nothing maps one spelling to another, so nothing can disagree.

- A name is a DNS label: lowercase letters, digits and hyphens.
- Apps from this repository and images from elsewhere share the one namespace.
- `host` and `keeper` are reserved for the two programs below, `agent` for what samples the
  machine ([agent.md](agent.md)), `api` for the API host, `gateway` for the Worker answering it
  publicly, and `caddy` and `cloudflared` because a container's name is the app's and those two
  already run.

`.icu` is private and `.app` is public, and what each admits is
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

- CI builds only the apps a push changed -- `.mise/tasks/deployable` reads the change against the
  crate graph -- for `linux/arm64`, each as its image archive beside its `service.toml`, and uploads
  them as artifacts of that workflow run. **Nothing is published**: no release, no package, no
  registry. This is one repository holding many apps, and a publishing ritual per app is exactly the
  cost that stops small apps being written. The build is `.mise/tasks/image`, the same one a local
  deploy runs, and CI checks the workspace out around this repository so the compiler is the one
  its `rust-toolchain.toml` names.
- When the run ends, **GitHub's webhook** tells a Worker, which checks the delivery's signature and
  passes the run's number on -- see [services.md](services.md), "Every node is the same node".
  There is no polling and no step in the workflow for it; the event says exactly which run ended,
  and that it succeeded.
- host asks GitHub about that run with a read-only token scoped to this repository's Actions, and
  **runs nothing unless the answer is this repository's deploy workflow, on `main`, finished and
  successful**; then downloads the artifact and checks it against the digest GitHub recorded. The
  notice is a hint, not an authority: a forged one can at worst redeploy what `main` already built.

**Rejected: verifying a Sigstore attestation of each archive.** An attestation proves an artifact came
from a given repository's workflow on a given ref, which is what matters when the artifact is taken
from somewhere else -- a registry, a mirror. Here it is taken from GitHub's API, for a named run whose
repository, workflow, branch, event and outcome that same API states, over the same TLS. Both prove
the same thing, and the attestation's half is a certificate chain, a transparency log and a trust
root to verify in Rust, the most intricate code on the path for no guarantee the run record lacks.

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

**An app's directory belongs to the user its image runs as.** host creates it as root, and an image
that runs as someone else -- which every image from this repository does, as 65532 -- could not
write to it. So before each version starts, host reads the image's `USER` and, when it is a number
other than root, gives the directory itself to that user and group; what is inside is left alone,
since it was written by the app. A user named rather than numbered would need the image's own user
table, which host does not read, and is left as root's.

**Every container has a memory ceiling, and no swap past it.** A declaration states `memory_mb` and
host gives 512 without one; the platform's own two containers get theirs the same way, and swap is
set equal to the limit, since a ceiling that can be exceeded into swap only makes the machine
slower. The containers host does not run -- Caddy, cloudflared, the images started by a compose
file -- carry theirs in that file. Each figure is the container's measured peak with room above it:
geo, measured at 290 MiB held and 130 more pushed into swap against a 512 limit it met sixty times,
has 768; host 256 and keeper 128 against peaks of 41 and 11; the rest 256.

### An image is built for speed, and for any node of its architecture

Every image compiles its binary with the `container` profile in the workspace's `Cargo.toml`: full
optimisation with fat LTO and one codegen unit, no debug information and no symbols. Speed is
chosen over size because a server pays for its binary on every request and for its bytes never;
the build is slower, and it runs on the Mac, where nobody is waiting on a request. No `target-cpu`
is set, so an image is not tied to the chip of the node it was first built for. The profile is its
own rather than `release`, which a local build of `local` would otherwise inherit and pay for.

**An image is the binary on `scratch` and nothing else.** Each program is linked statically against
musl, so it needs no C library from the image, and the image holds the binary and, for geo, its
data. musl's own allocator is slow under many small allocations, so every program sets mimalloc as
its allocator; without it the static binary would be the slower one. host and keeper make btrfs's
ioctls themselves rather than running `btrfs`, which is what let them leave Debian: there is no
`btrfs` in an empty image, and no command line to inject into once there is no command. The
target follows the platform being built, so the same Dockerfile serves an x86 node.

### The declaration is `service.toml`, beside the Dockerfile

An app states what it needs in `apps/<name>/service.toml` and ships it with its image. host is a
program deployed apart from the file it reads, so the file carries a `version` and host refuses one
it does not know before reading anything else, while a key it does not know is ignored -- see the
workspace's `json.md`. What the keys are is [manifest.rs](../../libs/deploy/src/manifest.rs); host
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
- **It never goes to GitHub.** The one secret GitHub holds is the webhook's, and what it signs can
  do nothing but ask host to look at a run it will check for itself. A compromise of CI must not be
  a compromise of the panel, or the reversal above bought nothing.

## host never updates itself; keeper updates host

An updater cannot be the thing it updates: a broken update leaves nothing running that could undo
it. So there are two programs, and each updates the other, never itself.

- **keeper** is small and rarely changes. It deploys host by the same stop, snapshot, start and check
  as any app -- one procedure, in `libs/deploy`, that both programs call -- against host's
  `/health`, which answers only once host reads its own database and reaches Docker. On failure it
  puts the previous host back.
- **host** deploys everything else, keeper included.

**The platform's shape is chosen by name, never by a declaration.** host and keeper run privileged,
with the Docker socket and the whole of `/data`; `agent` runs as an observer, which
[agent.md](agent.md) describes; and every other app runs as the section on what a deployment may
ask for describes. Which shape a container gets is decided by the program deploying it from the
app's name -- `host`, `keeper` and `agent`, and only those -- so no `service.toml` can ask for the
platform's reach. host deploys keeper and the agent; keeper deploys host. Both start from the one `.env` in host's directory, which is why the token has
one home on the machine.

**keeper keeps no state.** Every container carries the version it runs in a label, so keeper reads
what host runs back from Docker; a host started by hand carries none, and the declaration keeper was
just sent stands in for it beside the image it really runs. Each program removes old images only of
what it deploys -- host of the apps and keeper, keeper of host -- so neither can remove the other's
way back.

**host rolls forward, not back.** keeper guards one failure only: a host that does not start.
Anything wrong with a host that does start is fixed by pushing the next host, because that update is
carried by keeper and never by the program that is broken. That is what lets keeper stay small
enough to read at once, and its stability comes from its size rather than from rules about it. CI
builds only what changed, so keeper's image moves only when keeper's code does.

**keeper has its own intake.** `mise run host deploy host` goes to `keeper.canmi.icu`, never to
host, and a notice about a run that built host goes to keeper too. Routed through host, a broken
host would stand between the fix and the machine. keeper's interface is private to the LAN and the
tailnet; on the tunnel's side it answers `/notice` and nothing else, since that is the path the
Worker reaches it by, and a request there can only ask it to look at a run.

**A run that built host is keeper's first, and host's only after.** The notice reaches both at once,
and the first run that built both acted on it at once: host replaced keeper while keeper was
fetching the new host, and the host it was about to put in place never arrived. So host leaves such
a run alone, and keeper, once host is replaced -- or put back, if the new one failed -- passes the
run on to host marked as done with host. The rest of the run, keeper included, is then deployed by
the host that run built.

It is reached through Caddy like everything else, which was chosen over binding keeper's port to the
machine's address directly. The cost is that a Caddy that is down makes keeper unreachable too;
accepted, because Caddy starts from the file host last wrote and fails independently of host, so
the case keeper exists for -- a broken host -- leaves Caddy standing.

**Rejected: two identical full instances, A active and B standby.** Two holders of the Docker socket
need a leader election, and the standby logic would live inside the program that changes most. The
variant where B catches up once A succeeds also discards the fallback at the moment a latent bug is
still invisible.

The first host is started by hand, from its `docker-compose.yml`, since nothing earlier exists to
start it. keeper is never started by hand: the first one is deployed by host.

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
is not a container -- the NAS behind `nas.canmi.app` is one. host renders it complete, writes it to
the file Caddy starts from, and then loads the same bytes through Caddy's admin API. Never a partial
patch, never Caddy's own autosave, never `--resume`. A full render is cheap, and one derivation means
the state host shows is the state being served.

**The file is what keeps this section true.** Pushed alone, a Caddy that restarts before host --
after a reboot, say -- would start empty and serve nothing until host came up. The file is written
by host and is the same bytes it pushes, so it is not a second record, and Caddy recovers alone.

The Caddyfile is retired with this. What it held by hand is entries in host.

**A route to a device that speaks only TLS is reached over TLS, unverified.** The UniFi router
answers on HTTPS alone, under a certificate it signed itself, and its route is written
`https://10.10.10.1`. Caddy connects over TLS and does not check that certificate: the only way to
check it would be to pin it, and a device that makes itself a new one on an update would then stop
answering with nothing to say why. The hop is the LAN, between two machines in the same house, so
what verification would guard against is not on the path.

Such a device also believes it is at its own address. UniFi refuses a WebSocket whose `Origin` is not
its own, so every live view of its interface failed behind the proxy while the pages themselves
loaded. Caddy therefore rewrites `Origin` for these routes -- but only an `Origin` that is exactly
the name it is served under, which becomes the device's own. Any other origin reaches the device
unchanged, so the check the device makes against another site opening its socket in the author's
browser still stands; it is translated, never switched off.

**A name may send its root elsewhere.** An application whose interface lives under a path -- gemini's
panel is under `/admin` -- is given a `home`, and a request for exactly `/` is redirected there with a
307 while every other path reaches the application untouched. Caddy sends the root to `home` and no
further; where the application goes from there is its own. It is a redirect and not a rewrite: the
browser then asks for the paths the interface expects, and an API under `/v1/` never meets it. A
`home` has to stay on its own name -- `//` and `/\` are another site to a browser -- or the name
becomes an open redirect.

**Every name is compressed at Caddy, and no app compresses for itself.** Each route host renders
encodes its answer with zstd or gzip, whichever the client prefers; an answer that arrives already
encoded is passed through. Compression is a property of the edge of the node, like TLS, so it is
configured once there rather than in every app and every vendor's image.

**Caddy's admin endpoint is a unix socket, never a port.** Every app shares a network with Caddy,
so an admin port would let any app rewrite every route. The socket sits in a directory only Caddy
and host mount.

**A Caddy container that is recreated, not restarted, comes back attached to no app's network.**
host attaches it to all of them again whenever it starts and whenever it is asked to reapply, so the
remedy is one request rather than a list of commands.

## The panel is host's own

host serves its panel itself, on its own names: a SvelteKit application exported as static files,
copied into host's image and served beside the API, so there is no second service, no origin to
cross and no CORS. It is written in `apps/host/panel/`, its components named in lowercase like every
file.

**It is styled as the site is, in the site's three layers, and colored as nothing else here is.**
Tailwind in the markup for where a thing sits, StyleX for what it looks like, a `<style>` block
for what carries no class -- [css/layers.md](css/layers.md) decides which is which, and the build
and development arrangements there are copied rather than re-derived. Its colors are Nord's, one
theme and dark, with no light twin: the sixteen are declared under their own names in `panel.css`,
what the panel means by each is declared beside them, and a surface in `src/lib/style/` reads the
meaning. They are its own rather than `libs/tokens`', which is the site's. Icons are Lucide's, and
what moves -- a page arriving, the sidebar's marker crossing to the next page -- moves on
`@canmi/motion`'s timing, as the editor's panels do.

**Its charts are d3's arithmetic and Svelte's drawing.** d3's scale, shape and array modules
compute the axes, the paths and the point nearest the pointer; the SVG is written in the component,
so it follows the component's state like any other markup and nothing reaches into the DOM behind
Svelte's back. The rest of d3 -- selections, transitions, its axis generator -- is not taken: each
would draw on its own, and the motion is `@canmi/motion`'s. A chart of bytes ticks in binary
units, and a series breaks where points are missing rather than drawing across the gap.

**It is laid out for a desktop.** A sidebar and a page beside it, the page's width following the
window; a phone is not refused and not designed for.

**Pages are prerendered and filled in the browser; nothing renders on a server.** Every page of
fixed address -- the list of apps, the routes -- is exported as a shell of its own, and a page whose
address holds a name, `/apps/geo`, is answered with the fallback shell, `200.html`. Its addresses
are ordinary paths; the first version chose its page by the hash, which read as `/#/apps/geo` and
went the moment the panel had a router of its own.

**Everything the panel asks is under `/api/`, and every other path is the panel's.** Its pages and
host's API would otherwise share `/apps/geo`. `/health` and `/notice` stay at the root, where
keeper, the hook and Caddy already reach them and no page will ever be.

**Its build is SvelteKit's, as SvelteKit lays it out.** The files under `_app/immutable/` are named
by their hash and host serves them for a year; the pages and `_app/version.json` are never cached.
The image builds it in a stage of its own, on the Node major the workspace pins, installing the pnpm
the repository names.

**The panel signs in with the token, once.** The first visit asks for it; host answers with a
cookie holding it, `HttpOnly`, `Secure` and `SameSite=Strict`, for thirty days, and every request
after carries that.
The API takes the cookie or an `Authorization` header alike, so scripts and keeper are unchanged.
The token is asked for on every door, the LAN's included; from the public, Access stands in front
as well.

**The first version covers the apps of this repository.** Images from elsewhere, notifications and
a second node come after it.

### What host keeps, and where

host's state is three SQLite files by what they hold, since a file costs nothing and one per
subject keeps each small, separately inspectable and separately backed up: `apps.db`, what runs
now and what is held stopped; `routes.db`, the names that reach something host does not run; and
`history.db`, every event. They sit in host's own data directory. A single `host.db` from before
the split is read into them once and renamed aside.

**Every event is kept, and none is pruned.** A deploy, a redeploy, a rollback of either kind, a
start, a stop, a restart and a deploy skipped are each a row: which app, what started it -- a CI run
and its commit, an upload, or the panel -- the image, when it started and ended, how it ended, and
why when it failed, with the logs of the failure. The panel pages through them fifty at a time, the
newest first, as far back as they go.

**Every line an app writes is kept.** Docker does not rotate the logs of a container host runs, and
before a container is replaced its whole log is written to `/data/logs/<app>/`, one file per
version it ran, since removing the container would otherwise remove its log. The panel shows the
running container's recent lines and every archived file. Clearing them out is a later decision,
made when the disk says so.

### An app's environment is two files, and the panel shows one

Configuration and secrets are both environment variables, given to the container when it starts,
and both edited in the panel. They are two files in the app's own directory, outside what its
container mounts, readable by root alone:

- `config.env` is configuration: the panel shows every key and value.
- `secret.env` is secrets: the panel shows that a key exists, and never its value. Reading one is
  done over SSH.

They sit in the app's subvolume, so the snapshot a deploy takes holds them, and a failed deploy put
back puts the environment back with the code. A change applies when the container is next started
from its version: the panel says so, and a redeploy does it.

### What the panel can do to an app

- **Redeploy** runs the current version again, as a deploy: snapshot, start, check, and the version
  before put back if the check fails.
- **Roll back** runs the previous version instead, keeping the data and the environment as they are
  now. It is the ordinary way back from a bad version.
- **Roll back with data** does the same and also restores the snapshot taken before the current
  version was deployed, so the data and the environment are as they were then. Everything written
  since is lost, so it is shown as the dangerous one. It is offered while that snapshot is among the
  ones kept.
- **Start, stop and restart** act on the container as it is.

Every one of them is confirmed twice. host does none of them to itself: it cannot stop or replace the
program answering the request, and keeper is the one that replaces host.

**A stop holds until a start.** A stopped app stays stopped through a reboot -- Docker's own
restart policy does that -- and through a deploy: while it is held, a CI run that built it is recorded
as skipped rather than started. A start runs the version it was stopped at; a redeploy, a rollback
or an upload is a choice to run something, and ends the hold.

## Trying host on this machine

**A node is a privileged `docker:dind` container with a btrfs file mounted at `/data`.** host needs
btrfs for every app's directory and Docker Desktop has none it will share: a path inside its VM is
refused as a bind source, and one under `/var` is taken for the Mac's `/private/var`. Inside a dind
container the paths are Linux's own, so host binds what it would bind on the machine:

1. Format a file as btrfs in a throwaway container, into a named volume: `truncate -s 4G`, then
   `mkfs.btrfs`.
2. Start `docker:dind` privileged with that volume and host's port published, and inside it
   `mount -o loop` the file at `/data`.
3. `docker exec -i ... docker load` host's and the apps' archives from `mise run image`, and start
   host inside it as the compose file does, with a token of its own; Caddy's absence is logged and
   ignored.
4. Deploy through its API as `mise run host deploy` would, and point the panel at it:
   `PANEL_API=http://localhost:11011 pnpm run dev` in `apps/host/panel`.

A copy of the machine's three databases, read over SSH, gives the panel the real apps and history to
draw; `docker cp` cannot see into the btrfs mount, so they go in through `docker exec -i`.

## Open

What is still undecided about placing services here is listed in [services.md](services.md).
