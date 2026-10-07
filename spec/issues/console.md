# Issues: the console

What [../roadmap.md](../roadmap.md), "One console runs the system, and it is this layer's", leaves
open. The rules over an entry are the index's; see [issues.md](issues.md).

## How a node runs an app this repository builds

Host deploys what a CI run of infra or the platform built, on a notice the hook fans out; nothing
here builds an image a node runs yet. The node's build of the console is the first, so whether
host takes artifacts from this repository's runs as it does from the other two, which grants it
holds, and how its declaration reaches host are undecided -- infra's `spec/architecture/host.md`.

## The node's sign-in, with nothing above it

Cloudflare Access guards the node's build as it guards the edge's until the platform's accounts
exist -- [../roadmap.md](../roadmap.md). After that, the node's build must still let somebody in
when the platform is down -- the workspace's `spec/architecture/layers.md`, "Four places, and which
way they lean" -- so it may offer the platform's accounts and must not need them. Which sign-in it
keeps then is undecided, and waits on the accounts.
