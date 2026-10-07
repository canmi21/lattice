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
- **One console runs the system, and it is this layer's.** The platform's console moves here and
  runs at the edge alone; infra's per-node panel retires, and a node keeps only host's API. Writes
  the panel did -- restart, deploy, roll back -- go to a task on the author's machine over the
  tailnet first and to the console later, by a path that never holds a node's root token in a
  Worker. When the edge is down, a node is reached over the tailnet, by SSH and that task, which
  need nothing above infra. It is made for the author first, and for anybody else only once the
  author runs everything from it; Cloudflare Access guards it until the platform's accounts exist,
  and retires when they do -- [todo/todo.md](todo/todo.md), "The console".
