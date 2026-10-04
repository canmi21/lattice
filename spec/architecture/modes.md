# One mode: this checkout is the real thing

This repository runs in one mode. Its servers run from this checkout, against this checkout's
`data/`, on the pinned ports. There was a second mode, the sandbox; the last section says why it
was retired.

## This checkout ranks as production

**This checkout is the real data.** A draft changed here is the draft, one deleted is gone, and a
publish publishes. A change made here ranks with a change made online, whoever makes it -- the
author, or an agent working beside them.

Code edited here reaches the running servers at once, which is what both parties want when they
are working on the same thing.

An agent that has to try something here tries it on a new, empty draft it made for the purpose
and deletes afterwards, and never deletes, rewrites or discards one of the author's. What leaves
the machine and stays there -- `publish`, `sync`, a deploy, `search`, `indexnow` -- is run when the
author asks for it and not as a step of something else.

## The sandbox is retired

**The sandbox was a second checkout of this repository with a fork of `data/`, on every port plus
100**, for building a feature without touching the author's drafts or the servers they were using.
It existed because the author's working servers and an agent's development servers both ran on
this machine, from one repository whose files they watched.

That stopped being true when what is deployed moved off this machine: the site and its API run on
Cloudflare, the status page on Vercel, and the platform's services on the node infra deploys. The
servers here are development servers, and nothing the author relies on is reloaded by an edit.
The editor has not moved yet and still runs here against the real collection; that was accepted
rather than kept the sandbox for. It went on 2026-10-04 with all of its parts: the `sandbox` task,
the port offset `@canmi/me` read from the environment, and the `outward` gate the publishing tasks
of all three repositories depended on.
