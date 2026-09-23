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
watches those addresses.

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
for a second checkout of this repository is gone with the arrangement it served; what it
protected still holds, and more simply: `local` is the one process that writes `data/`, and a
second copy of it collides on `LOCAL_PORT`, which is the mutex doing its job.

A port both a TypeScript tool and a Rust binary need is declared in `mise.toml` under `[env]`,
not in `libs/urls`. The single-source rule asks for one place to edit, not one particular
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

Two consequences worth stating. `libs/urls` returns paths rather than origins for those two in
development, so the Rust mirror does too -- the two languages still give one answer, which is what
that mirror is for. And `og:image` is a relative URL in development, which is invalid to a crawler
and reaches none; production is unaffected.

### A build reclaims the workerd the last one leaked

**The site build leaks a workerd every time it runs.** `@sveltejs/adapter-cloudflare` calls
`getPlatformProxy()` and never disposes it, so each `vite build` leaves one behind, parentless and
listening, with nothing left that would ever ask it to stop. An interrupted `vitest` leaks one the
same way, because `apps/api`'s D1 harness disposes its Miniflare in `afterAll` and a SIGKILL never
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

## The base session

`mise run base up` ensures a tmux session named `<basename>-dev` exists with a window per server,
each running that server's mise dev task. A window already running is left alone; one whose server
has exited is restarted. It took an argument once, for the desktop client -- a window somebody
used rather than a server somebody called -- and that client is archived.

**It runs from the base checkout only.** The base is the one checkout that runs everything, on
the numbers "Dev ports are pinned" above fixes, so a second checkout starting these would
collide rather than get a set of its own. That collision is the mutex, which is the same
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
Only the site pays this cost, which is why only the site's manifest looks inconsistent.
