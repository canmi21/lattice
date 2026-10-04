# Toolchain, as this repository uses it

The rules that follow the author rather than the project -- shell, secrets, version
control, tool versions, dependency policy, default stacks -- are the meta repository's.
What is here is what this repository alone decides.

One of those is worth naming here rather than leaving to be found, because it is reached for
before anybody goes looking: deletion is `trash` and never `rm`, directories included. The
workspace's `toolchain.md` gives it under "An agent deletes with `trash`, never with `rm`",
with the reason and the cost.

### Tokens are scoped to one bucket

An R2 API token is created for a single bucket, not for the account. The sync task runs
`rclone sync`, which deletes whatever the source does not have, so a token that can reach a
second bucket makes a mistyped remote destructive there too.

Scoping is the same move as leaving a private bucket unbound from any worker: the boundary
holds because the credential cannot cross it, not because whoever typed the command was
careful. Pulling data out of an old bucket therefore uses a separate read-only token -- read
access is all that job needs, and it cannot damage the only copy of anything.

This is visible in normal use: `rclone lsd r2:` returns 403 because listing buckets is an
account-level operation the token deliberately lacks. Naming the bucket works; enumerating
them does not.

## Workers answer on custom domains only

`workers_dev` and `preview_urls` are off everywhere. Every generated hostname is another route
to the same worker, reached without whatever sits in front of the custom domain, and nobody
watches those addresses. A route under a custom domain of our own is not a generated address, and
is allowed, but none is left. A more specific route wins over the domain's Worker only for a request
from outside: another Worker's `fetch` passing through a route does not run that route's Worker,
which is how the alias layer found `api.ffoni.com/site/*` answering it with nothing while the
gateway held the path by a route. A scope of the API host is reached by binding.

**The gateway declares its hosts in its `wrangler.jsonc`.** Attached in the dashboard,
`api.ffoni.com` was gone after a deploy that followed its move from the old API Worker -- the DNS
record went with it, and the first sign was the host not resolving. Declared, every deploy asserts
them, and a custom domain left out of the list is detached by the deploy, its DNS record with it.
The other Workers' domains are still the dashboard's, and move the same way if one goes.

**A zone that is the gateway's alone is one wildcard route; an apex is a custom domain.**
`monoflake.com`, `monoflake.net`, `ixc.one` and `ffoni.com` serve nothing but the gateway below
their apex, so each is `*.{zone}/*` over a proxied `*` record, and a host the profiles add needs no
change here or in the dashboard -- one the profiles do not know is refused by the gateway and its
whitelist. A route matches no apex, so `ill.li` and `symlink.si`, which are their apexes, are
custom domains. The wildcard record exists before the deploy that drops a custom domain on it,
since the explicit record goes with the domain and the wildcard is what answers after.

The cost is real and accepted: there is no URL to open between uploading a version and
promoting it, so a deploy is the first time the code meets production. What replaces that
check is `wrangler dev`, which runs the same code against the same bindings, plus the fact
that a worker with no route configured serves nothing until a domain is pointed at it by
hand.

That last point is what makes replacing a worker safe. A first deploy under a new name is
inert -- it creates the worker and attracts no traffic. Deploying over an existing worker of
the same name replaces it in place and keeps its routes and custom domains attached, so
replacing one never requires deleting it first. Nothing is deleted until whatever supersedes
it has been seen serving real traffic.

## Deploying is a consequence of pushing

Cloudflare builds from the connected repository, so a push is what ships. Nobody runs a deploy
by hand as the normal path, and an agent runs one neither by hand nor on request -- pushing is
the user's, and so is everything downstream of it.

The `deploy-*` tasks stay as a fallback for the case where the platform's build is broken or a
worker has to be created before its settings exist. Using one means production now holds
something no commit accounts for, which is worth doing knowingly and not by habit.

Two things follow from CI holding the build. It compiles what is in git and derives nothing --
see [workspace.md](architecture/workspace.md) -- and the toolchain has to be pinned in files CI can
read, because `mise.toml` is not one of them.

## Dev ports are pinned

Every dev server binds a fixed port and **fails when that port is taken**. Vite gets
`strictPort: true`; anything else refuses to fall back. Auto-incrementing to the next free
port is never acceptable.

The reason is not tidiness. A tool that drifts to the next port starts a second instance
silently, and a second instance of something that writes to `data/` means two processes
fetching and overwriting in the same directory. The port collision is the cheapest mutex
available -- the operating system provides it for free, and it fails loudly at the only moment
anyone can act on it.

One checkout runs one set, on the pinned numbers. The slot arithmetic that shifted every port
for a second checkout of this repository is gone with the arrangement it served, and one fixed
shift came back for a different one: the sandbox binds every number plus 100, from
`LATTICE_PORT_OFFSET`, which nothing else sets -- see
[architecture/modes.md](architecture/modes.md); what it
protected still holds, and more simply: `local` is the one process that writes `data/`, and a
second copy of it collides on `LOCAL_PORT`, which is the mutex doing its job.

A port both a TypeScript tool and a Rust binary need is declared in `mise.toml` under `[env]`,
not in `platform/libs/sdk`. The single-source rule asks for one place to edit, not one particular
file, and a TypeScript library cannot be read by a Rust process -- putting a cross-language
fact there would force the duplication the rule exists to prevent. URLs only the TypeScript
side resolves still belong in [workspace.md](architecture/workspace.md)'s URL map.

### They bind every interface, and the other two are reached through the site

`::` rather than a loopback address, in all three. Node leaves `IPV6_V6ONLY` off, so one value
covers both stacks and the loopback addresses inside them; `0.0.0.0` alone would drop `[::1]`,
which is what `localhost` resolves to first here. The site used to bind only `[::1]` and was
therefore unreachable to anything forcing IPv4, which nobody noticed because `localhost` picks
the address that worked.

Exposed on purpose: a layout is not finished until it has been seen on a phone, and a phone can
only reach this machine over the network. The port is still the mutex above -- what changes is
that somebody else on the same network can also reach a dev API, which writes the local D1 and
never the deployed one.

**In development the API, the alias layer and the CDN answer under the site, at `/api`, `/alias`
and `/cdn`.** The site's dev server proxies all three, stripping the prefix, so each worker still
sees the paths it serves and knows nothing about the arrangement. Production has three domains and no proxy; only development
collapses them, and only because there they are three processes on one machine.

That is what makes a phone work, and a runtime fix would not have. Fonts, avatars and the
OpenGraph card are rendered into the HTML by the worker before any script runs, so reading
`location.hostname` in the browser would have repaired the fetches and left every asset pointing
at the phone itself. A page served from this machine's address now asks that same address for
everything.

Two consequences worth stating. `platform/libs/sdk` returns paths rather than origins for those two in
development, so the Rust mirror does too -- the two languages still give one answer, which is what
that mirror is for. And `og:image` is a relative URL in development, which is invalid to a crawler
and reaches none; production is unaffected.

### A build reclaims the workerd the last one leaked

**The site build leaks a workerd every time it runs.** `@sveltejs/adapter-cloudflare` calls
`getPlatformProxy()` and never disposes it, so each `vite build` leaves one behind, parentless and
listening, with nothing left that would ever ask it to stop. An interrupted `vitest` leaks one the
same way, because `apps/site/api`'s D1 harness disposes its Miniflare in `afterAll` and a SIGKILL never
reaches it. The suites themselves leak nothing: a build alone leaves one and the whole suite leaves
none, which is how the two were told apart.

Reclaimed rather than prevented, because a leaked process can only be told from a live one once
its parent is gone -- which is after the run that made it. So
[`reap-workerd.ts`](../apps/site/scripts/reap-workerd.ts) runs at the start of the next build and
of the next test run, and on its own for the same job by hand.

Two are spared. One whose parent is alive belongs to whoever started it, which is every dev server
in the tmux session below. And one holding a pinned port is spared even with no parent, because
`wrangler dev` has workerd bind that port itself -- a wrangler that died leaves a page somebody
may still be reading, and closing it is not a build's business.

### Reaching the LAN from a browser that cannot

**`mise run reach [name]` answers on `http://localhost:26520` for `<name>.internal.ixc.one`**, host's
panel when no name is given. macOS asks before a program reaches the local network, and a browser
an agent drives, like node from mise, is refused; the system's own `ssh` and `curl` never are.
So [`reach.ts`](../infra/apps/host/scripts/reach.ts) has ssh carry the node's port 443 to a loopback
port and speaks to that alone, sending every request as the name would arrive: TLS with the name
as SNI and as `Host`, so Caddy routes it. Caddy's guard sees the node's own address, which is a
LAN one; a tunnel to the node's loopback is refused by the same guard, which is why the far end
is the LAN address.

Plain HTTP on this side, because localhost is a secure context: the session cookie's `Secure` is
kept and still sent. The port is `REACH_PORT` in `infra/libs/urls`, beside the pinned ones and outside
their map, since what answers there is not an app.

## The base session

`mise run base up` ensures a tmux session named `<basename>-dev` exists with a window per server,
each running that server's mise dev task. A window already running is left alone; one whose server
has exited is restarted.

**Every server is always on, `local` and the editor included, and `up` takes no argument.** The
editor was optional while it was the desktop client -- a window somebody used rather than a server
somebody called -- and that client is archived. What replaced it is a Vite server reading the
collection through `local`, so both are servers like the rest, and an opt-in for them only left
them to be started by hand outside the session, where nothing could see or stop them.

**It runs from the base checkout, and from the sandbox.** The base is the one checkout that runs
everything, on the numbers "Dev ports are pinned" above fixes, so a second checkout starting these
would collide rather than get a set of its own. The sandbox is the one exception, and runs the
same session under its own name on the shifted set -- see
[architecture/modes.md](architecture/modes.md). That collision is the mutex, which is the same
arrangement the ports themselves rely on.

tmux is a machine tool rather than a mise one, for the reason the workspace's `toolchain.md`
gives about that distinction generally.

### A window runs a shell and the dev task is typed into it

Each window is opened on the default shell and sent `mise run dev-<app>` as keystrokes, rather
than being given the command as the window's own process. A window whose process is the server
dies with the server, which leaves nothing to read afterwards and nothing to restart into; a shell
outlives it, and the window's foreground command is then the evidence of whether the server is
still there. That is the whole of how `up` tells a running window from an idle one, and it is what
makes running `up` twice safe rather than merely harmless.

What it costs is that a server's exit is silent until somebody asks. `base status` is the asking.
Nothing here supervises anything, and a window reading `idle` is the report a supervisor would
have made.

## A package at two majors is a warning unless it is allowed

**Out of date is judged by the newest copy the workspace holds, not by each package's.** `update
--dry-run` asks pnpm what is outdated and what every package holds directly, and calls a package
behind only when its newest copy anywhere here is older than the registry's latest. One already on
the latest somewhere while another package keeps an older major is not behind: it is two majors at
once, which is reported apart, as a warning.

**`versions.toml` allows a pair, with the reason.** Its `[several]` names each package that may
hold two majors and why, as a transition somebody chose; the report then lists it without the
warning, and `update --major` crosses only what the report calls behind, so an allowed pair is
never collapsed by it. A line the workspace no longer needs -- one major left -- is reported for
removal. `.mise/tasks/outdated` is the report.

## The site holds TypeScript 6 and 7 at once, on purpose

`apps/site` declares `typescript` at 6 and `@typescript/native` as an npm alias for 7. That pair
is not a stale pin half-way through an upgrade. `svelte-check` needs both installed and refuses
to start with only one, which is the arrangement Microsoft documented for running the native
compiler alongside the one the editor tooling still reads.

**So `typescript` in that manifest is a floor, not a lag.** Raising it to 7 collapses the pair and
`check-site` stops before it type checks anything, reporting a missing TypeScript 6 rather than
anything about the code. A dependency update crossing that major has broken the task, not fixed a
pin, and the repair is to put the 6 back rather than to chase the error into `svelte-check`.

The root manifest carries 7 in both slots and is right to: nothing there runs `svelte-check`.
Every other package that does -- `apps/cms`, `infra/apps/panel`, `apps/status`, `libs/prose`,
`libs/social` -- holds `typescript` at 6 for the same reason, reaching 7 through the root, so
`outdated` listing 7 for each of them is this floor and not an upgrade waiting. `versions.toml`
allows the pair, so the report says so rather than warning.

## verify runs what a change reaches

**`mise run verify` checks the gates a change can affect, not the whole repository.** The
repository holds a site, three Workers, a CMS and a growing set of Rust services, and a change to one
of them used to compile, lint and test every other: an edit to a stylesheet built every crate, and
geo's gazetteer was fetched and tested on a machine where nothing of geo had moved. The Rust target
directory grew with each of those builds. So what a change touched decides what runs.

What it touched is the working copy's own change -- what is about to be committed -- or, with
`--since REV`, everything after that revision. `--all` runs every gate, and so does `mise run
audit`, which asks about the whole tree by definition. `--dry-run` prints the choice; `--files`
names files to ask about without changing them. [The script](../.mise/tasks/verify) is the
mapping, and these are the rules it keeps:

- **Four gates always run** -- secrets, references, comment lengths, the published shape. Each is
  whole-tree and takes seconds, and a reference can break from anywhere.
- **A Rust change reaches its crate and every crate that depends on it**, read from
  `cargo metadata` rather than listed, and clippy and the tests run over those alone. A test that
  reads another crate's file through `include_str!` depends on it without its manifest saying so;
  those paths are read out of the source, so changing geo's `service.toml` tests host and
  `infra/libs/deploy` too. `Cargo.lock`, the workspace manifest and the toolchain file reach every crate.
- **A TypeScript, Svelte or style change reaches its package and every package that imports it**,
  read from the `workspace:` dependencies. Any of them runs the three whole-program gates -- the
  type check, the linter, the test suite -- and a package with gates of its own runs them only when
  it is reached: the site's checks when the site or anything under it moved, the editor's when the
  editor did. Articles and tracked records are read rather than imported, so they reach the site.
- **A change to the gates reaches every gate.** `mise.toml` and `.mise/tasks/` are how everything
  is checked, so a change there is checked against everything.

**What the graph cannot see is named, and kept short.** The one entry today is the Rust mirror of
the URL map: it is `.rs`, and its only check is a TypeScript test. A dependency the graph misses is
a gate that silently does not run, which is the failure `code.md` in the workspace describes, so a
second such entry is worth a structural fix before it is worth a line in the list.
