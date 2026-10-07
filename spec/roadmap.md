# Roadmap

Where this repository is going, without the steps. What is decided and waiting is
[todo/todo.md](todo/todo.md), and what is open is [issues/issues.md](issues/issues.md); how the three
divide the work is the workspace's `spec/planning.md`.

- **Writing happens in the CMS, and the corpus becomes data.** What an author writes lives in the
  collection rather than in files, and git stops being where it is kept -- milestones A to C in
  [todo/milestones.md](todo/milestones.md).
- **The collection and the pipeline move to a machine that is always on**, and the CMS goes online
  behind accounts -- milestone group D.
- **Every service domain answers a page of its own** --
  [architecture/landing.md](architecture/landing.md).
- **The license surface leaves the site** for a shared page, once the platform's hosts are built --
  [issues/site.md](issues/site.md), "The license surface is eight addresses and one baked record".
- **The site becomes a consumer of the platform.** It came first and built its own storage, records
  and serving; what of that is good moves down into the platform, and the site keeps only what is
  its own -- the workspace's `spec/architecture/layers.md`, and platform's
  `spec/architecture/scheduling.md`.
- **One console runs the system, and it is this layer's.** The platform's console and infra's
  per-node panel become one app here: deployed on every node it shows that node alone and reads
  only its host, and deployed at the edge it is the whole fleet's -- later public, behind sign-in,
  with roles and several Cloudflare accounts to deploy through. The console moves here from the
  platform first, and the node's build replaces infra's panel once it does what the panel does --
  [issues/console.md](issues/console.md).
