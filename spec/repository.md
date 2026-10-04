# The repository

The author's site and what is built around it: `site`, canmi.net and its API, a Worker Cloudflare
builds; `status`, the status page; `cms`, the editor; and `local`, the resident service that
compiles, publishes and keeps the corpus. `libs/` holds what they share -- the article renderer,
the compiler, the collection, the messages, the fonts -- and `contents/` and `data/` the corpus and
its records. Why the system is cut into this layer, the platform's and infra's, is
[architecture/layers.md](architecture/layers.md).

## `apps/` is deployed, `libs/` is imported

Every app has a directory under `apps/`, every library one under `libs/`. Nothing here runs on the
node any more: the site is a Worker, the status page a SvelteKit app Vercel builds and serves, and
the editor and `local` run on this machine, so this repository builds no image and has no deploy workflow of its own.

## The other repositories are named, never linked

The platform is `monoflake/platform` and infra `monoflake/infra`, each cloned beside this one in
the workspace. A rule of theirs is cited by name -- `platform's spec/architecture/services.md` --
and `refs` resolves it in that repository when it is cloned beside this one, so a renamed section
still fails here. A relative link across a repository resolves only while both are cloned side by
side, so a spec here never writes one. `mise run base` starts the platform's dev servers from its
checkout beside this one, and says so when it is not there.

**What the platform publishes is installed from npm**: `@monoflake/sdk` and `@monoflake/probe`, as
any consumer of theirs would. The two tests that held the platform's store to what `local` writes
moved here with the split, `apps/local/src/store-agreement.test.ts`: the store cannot read this
app, and this app reads the store as published.

**The site's API scope is granted by the platform.** The gateway routes it, and its declaration,
`apps/site/service.toml`, is copied into the platform's `apps/gateway/elsewhere/`; a change to the
site's API is made in both.

This repository is `canmi21/lattice` renamed, so its history and its stars stayed with the site.
The platform and infra continue the same history from the commit the three split at.
