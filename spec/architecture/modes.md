# Two modes: collaboration and sandbox

This repository is run in one of two modes, and they differ in what a change reaches, not in
what the code does. Both run the same servers from a checkout of the same repository; what
separates them is which checkout, which data and which ports.

|               | code                                          | data                                  | ports          |
| ------------- | --------------------------------------------- | ------------------------------------- | -------------- |
| collaboration | this checkout                                 | this checkout's `data/`               | the pinned set |
| sandbox       | a jj workspace at `/tmp/sandbox/lattice/code` | a fork at `/tmp/sandbox/lattice/data` | the set + 100  |

## Collaboration ranks as production

**Collaboration is the real thing.** It runs this checkout against the real `data/`: a draft
changed there is the draft, one deleted is gone, and a publish publishes. A change made in this
mode ranks with a change made online, whoever makes it -- the author, or an agent working
beside them.

It is the mode for working on the content, with whatever small change to the code that brings.
Code edited here reaches the running servers at once, which is what both parties want when they
are working on the same thing.

An agent that has to try something in this mode tries it on a new, empty draft it made for the
purpose and deletes afterwards, and never deletes, rewrites or discards one of the author's.

## The sandbox is disposable

**The sandbox is a copy to break.** It is the mode for building or changing a feature: the code is
its own working copy and the data is a fork, so nothing done there reaches the author's drafts,
the author's running servers or the internet. Anything may be made up in it; when it is broken it
is reset, not repaired.

- **One at a time, at fixed paths.** `/tmp/sandbox/lattice/code` and `/tmp/sandbox/lattice/data`.
  A second sandbox would need a second set of ports and a second name for everything, and nothing
  needs it.
- **It lives until the machine restarts, or until it is reset.** `/tmp` is emptied at boot, which
  is the end of it. macOS also clears what in `/tmp` has not been read for three days, so a
  sandbox left alone may be found half gone; starting one checks that it is whole and rebuilds it
  when it is not. `mise run sandbox reset` rebuilds it on purpose.
- **The code is a jj workspace.** It shares this repository and has a working copy of its own, so
  an edit made there is never seen by the collaboration servers. A commit made there is in the
  repository at once and reaches this checkout when the author moves to it -- never by itself.
  `data/` is outside the workspace's sparse patterns, so the fork sits where the checkout's own
  `data/` would, every path that walks up for `data/bucket` finds it, and jj never sees it.
- **The data is a fork of the whole of `data/`**, the author's uncommitted records included,
  because that is what the collaboration servers are reading. Taken with APFS clones, so it is
  instant and costs no space until something in it is written. The SQLite files are not cloned
  but snapshotted with `VACUUM INTO`: the collaboration `local` may be holding them open, and a
  database copied under a write-ahead log is a copy of half a transaction.
- **Its build output is its own.** `node_modules` and the Rust `target/` are the workspace's, so
  the first start after a restart compiles `local` from nothing. Sharing `target/` with this
  checkout would have two different sources overwriting one cache.
- **`/tmp/sandbox` stands in for the workspace root.** The formatter rules, the toolchain and the
  agent hooks are found by walking up from a project into the workspace, and `/tmp` is outside
  it. `/tmp/sandbox` holds a copy of each of its files and a link to each of its directories, so a
  command in the sandbox finds the same rules -- the commit check and the `rm` guard included --
  where it would have found them at home. Files are copied, never linked: oxfmt looking upward for
  its config passes over a link, and formatted the sandbox with its defaults while it was one. The
  mise config is copied without its monorepo table, whose roots are not there.

### Every port is shifted by one hundred

The sandbox binds the pinned set plus 100: the editor on 26618 rather than 26518, `local` on 26621. Both modes can run at once, and each set is still the mutex "Dev ports are pinned" in
[../toolchain.md](../toolchain.md) describes -- a second collaboration server collides with the
first, and so does a second sandbox. The browser keeps a page's storage by origin, so the
editor's buffers in the sandbox are not the author's either.

### It refuses what leaves the machine and stays there

Nothing done in the sandbox may persist anywhere but the fork. Mirroring to the buckets
(`publish`, `sync`), deploying a worker, writing the search index (`search`) and announcing URLs
(`indexnow`) refuse to run there: each depends on the hidden `outward` task, which fails when
`LATTICE_SANDBOX` is set, and `sync` checks it again itself because it is the gate and is run by
hand. `gc-assets` is not among them -- it deletes from the local tree, which here is the fork.

What leaves the machine and leaves nothing behind is allowed. A model call writes its answer
into the fork's records, which is the point of trying it; it costs what it costs anywhere, and is
announced as a paid operation is anywhere. Fetching a tweet or a repository is a read.

## Landing a change from the sandbox

Nothing is copied back. The sandbox is a workspace of this repository, so a commit made there is
in the repository the moment it is made, and landing it is moving two things: `main`, and then
the collaboration working copy. The first is part of finishing a task; the second is the moment
the change reaches the servers the author is using, and is taken as that.

**1. Commit in the sandbox, on top of `main`.** Commit as anywhere else, in small verified steps
(see the workspace's `spec/commits.md`). If `main` has moved since the sandbox was made -- the
author committed in collaboration -- rebase onto it before moving anything, and resolve and
re-check there:

```sh
cd /tmp/sandbox/lattice/code
jj rebase -b @ -d main        # the sandbox's commits onto the current main; conflicts stay here
mise run verify               # or the checks the change touches
```

**2. Move `main` to the sandbox's commit.** Still in the sandbox:

```sh
jj bookmark move main --to @-
```

jj refuses a move that is not forward, which is the check that nothing on `main` was dropped: a
refusal means step 1's rebase was skipped. The change is now on `main`, and the collaboration
checkout has not changed a byte.

**3. Bring the collaboration working copy onto it -- when the author says so.** From this
checkout:

```sh
cd ~/workspace/repos/lattice
jj rebase -s @ -d main        # the author's uncommitted edits, carried onto the new main
```

Its files change, and the running servers reload what Vite serves at once. That is the point of
asking first: the author may be mid-sentence in a draft, and their uncommitted edits are carried
across and may conflict, which jj records in the files rather than refusing. An agent does this
when the author asks for it; otherwise it names the command and stops at step 2.

What the reload does not reach is restarted by hand. `local` is a Rust binary run once, so a
change under `apps/local` needs its window stopped and `mise run base up` again, which restarts
an idle window. A change to the collection schema also needs `mise run collection` against the
real databases, which is a change to the real data and ranks as one.

**The data never lands.** A draft written in the sandbox, a record a model call filled in, a row
a test made -- none of it goes back, and nothing exists to carry it. What was worth keeping is
made again in collaboration, which is where the real version of it lives.

## The task decides the mode

Building or changing how something works is sandbox work, and an agent's browser drives the
sandbox's ports. Working on the content, or on code the author is changing alongside, is
collaboration work. When a task is both, the code is made in the sandbox and the content in
collaboration once the code has reached it.
