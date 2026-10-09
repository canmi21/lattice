# Console navigation: one tree of levels

Where a reader can be in the console and how the shell says it. What the shell looks like is
[design.md](design.md); what the console does is [../architecture/console.md](../architecture/console.md).
Decided with the author on 2026-10-09, when the sidebar's sections, one table each filtered by
scope, stopped fitting layers whose things are not alike.

## Every place is a level of one tree

**The console is a tree of levels, and the shell is drawn from the level being read.** At the root
is a view -- All, or one of the three layers of the workspace's `spec/architecture/layers.md` --
and inside it the things that view holds, each a level of its own with its own pages: a node, an
app. One answer, `levelOf` in `apps/console/src/lib/levels.ts`, gives the level's pages, the way
back up and the trail, and the sidebar, the top bar's trail, the switcher and the `<title>` are
all read from it, so none of them works out where the reader is by itself.

```
All, Infra, Platform, Services   Overview, Nodes (Infra and All), Deployments, Apps, Events
  a node                         Overview, Apps, Events, Disk
  an app                         Overview, Usage, Deploy history
```

**Entering a level replaces the sidebar with it.** The sidebar lists the pages of the level being
read and no other: inside a node it is that node's pages, headed by the way back -- a chevron and
the list it was entered from, `Nodes` -- then the node's name with its code beside it. A level is
never unfolded under its parent's entry, since a tree three deep has no room to indent. The top
bar's trail is the same path written out, `Nodes / Tokyo, Japan tyo / Disk`, each step but the last
a link, and the level's first page is left out of it, as an address's root is.

**A record with one page is not a level.** A run opened from Deployments has a page and nothing
under it, so it keeps the level it was opened from, its section held open, and the trail names
it: `Deployments / #42`. It becomes a level when it has pages of its own.

**A level's pages are addresses.** A node's and an app's are in the query, `?tab=`, beside the span
the page is drawn over, so a page can be linked and the span carries from page to page; the root's
are paths, as before. A page never draws its level's pages a second time as tabs.

## What waits

**A platform service gets pages of its own** -- a database's replicas and backups, the gateway's
routes -- once the shell and the pages it has are drawn as they should be; until then every app,
a service of the platform's included, is the same three pages. The tree has room for them: a
service is a level whose pages are its own.
