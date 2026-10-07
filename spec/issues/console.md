# Issues: the console

What [../roadmap.md](../roadmap.md), "One console runs the system, and it is this layer's", leaves
open. The rules over an entry are the index's; see [issues.md](issues.md).

## How a node runs an app this repository builds

Host deploys what a CI run of infra or the platform built, on a notice the hook fans out; nothing
here builds an image a node runs yet. The node's build of the console is the first, so whether
host takes artifacts from this repository's runs as it does from the other two, which grants it
holds, and how its declaration reaches host are undecided -- infra's `spec/architecture/host.md`.

## One codebase, two builds

The edge's build runs on Workers and reaches the nodes through VPC bindings; the node's build runs
in a container and reaches its own host directly. Whether that is one SvelteKit app with two
adapters and a read layer swapped underneath, or a shared library with two thin apps, is undecided,
and decides how much of the edge's code the node's build carries.

## The node's sign-in, with nothing above it

The node's build replaces infra's panel, which keeps a sign-in of its own so a node is reachable
when the platform is down -- the workspace's `spec/architecture/layers.md`, "Four places, and which
way they lean". The node's build must keep that: it may offer the platform's accounts and must not
need them. Which sign-in it keeps, and how the panel's writes -- restart, deploy, roll back -- move
across before the panel retires, are undecided.

## The public console

Sign-in, roles, and several Cloudflare accounts to deploy through are the edge's build later, once
it is public. Who the roles are, where accounts and their tokens are kept -- the platform, never the
page -- and what Access in front of it becomes then are undecided.
