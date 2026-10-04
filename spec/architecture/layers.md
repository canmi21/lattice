# Three layers, and the library under them

This repository holds three layers of one system and the author's shared library under all of
them. Each becomes a repository of its own later; until then they share this one, laid out the way the
repositories will be, so that the split is a copy and not a reorganization. The plan, step by step,
is [../todo/milestones.md](../todo/milestones.md), F.

## Four places, and which way they lean

**A layer depends on the ones below it and never on one above.** From the bottom:

- **lib** is the author's own code that depends on nothing else of theirs: the design system,
  generic browser and server utilities, the addresses of their own sites and the world's addresses
  anyone could use. It is not a layer of the system, and it is under every layer of it.
- **infra** is what bootstraps the rest and so cannot be managed by it: host and keeper, which
  deploy each other, the panel over them, the meter, Caddy, the tunnel and the resolver.
- **platform** is the services infra runs for everything above: the gateway and `quota`, the CDN
  and the alias layer, storage and databases, the scheduler, the ledger, capture, probing,
  telemetry, and `apt`, the Linux machine's own capabilities offered as a service.
- **services** is what runs on the platform: the site and its API, the CMS and `local`, the status
  page, and the apexes' placeholder pages when they come.

The status page is a service and not the platform's, though it shows the platform: it is a page
built from the site's own libraries, and the probe and the schema it reads stay in the platform.

## The directory is the layer

```
lib/pkgs/         lib/crates/
infra/apps/       infra/libs/
platform/apps/    platform/libs/
services/apps/    services/libs/
```

A package's layer is the directory it sits in, and is written nowhere else, so the two cannot
disagree. **Until the split, `apps/` at the top holds the seven apps Cloudflare and Vercel build**
-- `aka`, `cdn`, `gateway`, `hook`, `quota`, `site` and `status` -- because their builds name that
directory; they carry no layer and move with the split, as do `contents/`, `data/` and `rules/`. Each layer keeps `apps/` for what is deployed and `libs/` for what is imported, as the
repository it becomes will at its top level. A layer is read for what it does, so a deployable
and a library are the split that matters there, whatever language each is in. `lib/` deploys
nothing and is read for what it publishes, so it splits by registry instead: `pkgs/` for npm,
`crates/` for crates.io. A package with a half in each -- `canmi`, `response` -- is two
directories of one name, and what both halves read, `response`'s `codes.json` and fixtures,
lives on the TypeScript side, which the Rust side reads, as `canmi`'s Rust is generated from its
TypeScript. `mise run layers`, which `verify` runs on every
change, reads the layer from the path and fails on a dependency that points up; a package not
moved yet has no layer and is not held.

## A scope says whose it is

- **`@monoflake/*` is infra and platform**: the system that bootstraps itself, named for the
  GitHub organization and the npm scope both layers will be published from.
- **`@canmi/*` is services and lib**: the author's own, on top of the system and under it.
- **A package's name is its scope and its directory's name**, unique within the scope. Where one
  concept lands in two layers of one scope, each is named for what it holds rather than given a
  layer prefix: the platform's addresses are `@monoflake/sdk`, infra's are `@monoflake/urls`.
- **A crate has no scope**, so its name is unique within the Cargo workspace and its layer is,
  again, its directory.
- **Every name sits under a scope the author owns**, published or not. An unscoped name, or one in
  a scope somebody else can register, is one a stranger can publish first and a misconfigured
  install will fetch.
- **The one unscoped name is `canmi`**, the author's own, the same on npm and on crates.io: the
  library's package of facts about them. It is theirs only once published, so its first version
  goes out when the library's repository does rather than waiting its turn; it has been in
  production all along.

## Who owns what

| Place    | apps                                                                                                      | libs                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| lib      | --                                                                                                        | canmi, ui, kit, web, response, geocode -- see below                                            |
| infra    | host, keeper, panel, meter, caddy, tunnel, resolver                                                       | deploy, urls                                                                                   |
| platform | gateway, quota, cdn, aka, hook, geo, objects, postgres, ledger, cron, apt, shot, probe, telemetry, gemini | limits, cache, security, robots, symlink, store, artifacts, imgsrc, ledger, status-schema, sdk |
| services | site and its API, cms, local, status                                                                      | prose, compile, collection, messages, social, hints, fonts                                     |

`geocode` takes `geo`'s address lookup in beside the coordinate one, and is published as
`whereabouts`: one crate answering where something is, each lookup behind a feature,
the data directory the caller's. Fetching the data stays in `geo`, an operational choice and not a
library's.

## The library is five packages, split by what installing one brings

The fourteen libraries that are the author's own become five packages, each part behind a subpath
of its own -- `@canmi/kit/motion`, `canmi/urls`. They are cut where a consumer's cost changes:
what a package drags in, where it can run, and whether a Rust crate has to move in step with it.

| Package           | Holds                                                               | Brings          | Runs              | Rust       |
| ----------------- | ------------------------------------------------------------------- | --------------- | ----------------- | ---------- |
| `canmi`           | the author's addresses, their identity, the languages they write in | nothing         | anywhere          | `canmi`    |
| `@canmi/kit`      | theme, tokens, motion, behavior, units: the design foundation       | svelte, StyleX  | a browser, Svelte | --         |
| `@canmi/ui`       | primitives and svg-canvas: what is composed from it                 | --              | a browser         | --         |
| `@canmi/web`      | compat, referer and sentry: running a SvelteKit app in public       | core-js, Sentry | a SvelteKit app   | --         |
| `@canmi/response` | the answer envelope's TypeScript half                               | nothing         | anywhere          | `response` |

`canmi` is what the platform reads when it needs the author's sites, so it carries no dependency a
Worker would mind. `web` is the heaviest and the least shared, so a page that only wants the design
does not install Sentry. `response` shares `codes.json` and its fixtures with the crate, so the two
publish together under one semver; the dated packages could not say a break in it.

The fourteen become five in the move itself, not later, so every import that names one changes
once, in the same pass that changes the infra and platform packages' scope.

## Addresses are split by who owns the name

The one map `libs/urls` was is three packages. An address goes with whoever owns the name, not
with whoever reads it: `canmi.net` is the author's even where the platform probes it, and
`api.monoflake.com` is the platform's even where the site calls it.

| Package           | Rust        | Holds                                                                                                                                                                     |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canmi`           | `canmi`     | the author's sites and identity; the world's addresses -- GitHub, the registries, SPDX, the social bases, analytics and fonts; the path and loopback functions            |
| `@monoflake/sdk`  | `monoflake` | the API host on both sides, the gateway's names, the CDN, the alias hosts, `canmi.app`, the ledger, cron and capture, the status page's doors, the platform's own mirrors |
| `@monoflake/urls` | --          | the panel, keeper, host's own address and the private suffix                                                                                                              |

The sdk composes the three into the one map everything above infra reads, so a caller asks one
place and the Rust mirror keeps its names; infra reads `canmi` and its own package directly, since
it may not read the platform's. Each repository generates its Rust half from its own TypeScript, as `mise run urls` does here, so
an address is written once and never across a repository boundary. The generator knows nothing of
the system and moves into the library with it.

## What the package graph cannot see

A dependency through an address or a name written into code is invisible to `package.json` and
`Cargo.toml`, and four point up today. Once the addresses split, the second and third become
imports of `@monoflake/sdk` from infra, which `layers` sees and carries in its `EXCEPTIONS`; the
first and fourth stay names only this list holds. **Both lists are empty before the repositories
split**; each is fixed by the declaration pattern
`service.toml` already uses -- the layer above says what it is, the one below reads the saying.

1. host knows the platform's apps by name: `OWN`, `TAKEN`, `RESERVED`, and a `Shape` each for
   `cron`, `apt`, `telemetry`, `objects`, `postgres` and the gateway.
2. host renders Caddy's routes and the resolver from the platform's `GATEWAY_*`.
3. The panel reads `cron`'s and the ledger's addresses to show them.
4. The deploy crate reads `URLS.source`, which is this repository's address and will be each
   repository's own.

## The repositories it becomes

| Repository           | Holds                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `canmi21/web`        | services: this repository, renamed, so its stars stay with the site they came for                             |
| `monoflake/infra`    | infra                                                                                                         |
| `monoflake/platform` | platform                                                                                                      |
| `canmi21/lib`        | lib: the `axum-governor` repository renamed, its stars kept, made a monorepo of every package of the author's |

The library's repository publishes the five packages above and the crates `canmi`, `response`,
`axum-governor` and `whereabouts`. The author's account keeps two monorepos, `lib` and `web`; a
desktop application keeps a repository of its own, as rdm and still do, and reads `canmi` and
`monoflake`.

**History is shared, not rewritten.** The three repositories continue from the same commit, each
deleting what is not its own, so every signed commit keeps its signature. GitHub counts a commit on
its author date and by repository, so the history before the split shows three times on the
contribution graph and nothing lands on the day of the split; the history was judged worth more.

**The order is layers, the library, then the split.** Everything but the seven apps above moved
here first, beneath them: their builds name only their own directories, so they kept deploying
throughout. They move at the split, when the repositories they build from change anyway and each
build is pointed once. The library's repository is ready before the
split, because the split moves `lib/` into it.

## Versions

- **A package the author mostly consumes is dated**: `canmi` in both languages, `@canmi/kit`,
  `@canmi/ui`, `@canmi/web`, `@monoflake/sdk` and `monoflake`, `@monoflake/urls`. The version is the UTC day, `2026.10.4` -- never zero-padded,
  which semver forbids -- published after the day ends when the package's tree changed since its
  last release tag. A build within the day is `-next.N` on the `next` tag. `^` spans a whole year
  of dated versions, so a consumer pins one exactly and `update` moves it.
- **A package meant for strangers is semver**: `response` in both languages, `axum-governor`,
  `whereabouts`. The level
  is read from the Conventional Commits since the last release by release-plz, and
  cargo-semver-checks catches a break the commits did not mark.

## A package is named for what it is, and published once it has proved itself

**A new package is named for what it does, with no thought for which names a registry has free.**
It runs here first, deployed on our own machines and used in production, for as long as the author
judges it needs to. Publishing is a decision the author makes and not a milestone: it comes once
the package has run in production long enough to be trusted and the status page shows that to
anyone. Then, and not before, a public name is chosen against what the registries hold, the
package is moved into the library's repository under it, and published.

**A semver package's first published version is 1.0.0**, whatever it was called before. It has
been in production by then, which is what 1.0.0 says; a 0.x would only defer a judgment of when it
is stable that no rule can make, and a major number is cheap afterwards.

- `geocode` will be published as `whereabouts`, the name already chosen, when the author decides.
- `response` is the author's own, already run here, and is redone over the published one as 2.0.0.
- `axum-governor` is published and stays as it is; it only changes repository.

## Publishing

- **npm**: `pnpm pack`, which rewrites `workspace:` and `catalog:` into versions, then `npm
publish` of the tarball by npm 11.5.1 or later, through trusted publishing. `pnpm publish` does
  not reach npm's OIDC exchange.
- **crates.io**: trusted publishing through `rust-lang/crates-io-auth-action`.
- **The first version of each is published by hand**, because both registries attach a trusted
  publisher only to a package that exists. A first version carries real code -- `canmi`'s is the
  author's addresses -- since crates.io removes a crate that only holds a name.
- **Across repositories during development** a dependency comes from Verdaccio, as a local
  prerelease `-local.N` so it never shares a version with the registry's copy, and a crate through
  `[patch]` in a `.cargo/config.toml`.

Until the split this repository publishes nothing, and [workspace.md](workspace.md), "A package
here has no version", holds.
