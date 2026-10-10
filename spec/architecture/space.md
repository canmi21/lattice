# Space: canmi.app's paths, in one app until each grows

`apps/space` answers `canmi.app`, the apex, which until now only redirected to the site because
nothing was there. Space is a concept rather than a product: the paths it holds -- `/design` now,
`/docs` and `/specs` later -- are each a part that would one day stand alone, and they share one SvelteKit
app and one Worker while they are small. A part that grows becomes an app of its own, built with
`paths.base` set to its path, and a router in front sends each path on -- the shape platform's
`spec/architecture/platform.md`, "One name, many apps: SPA within a scope, MPA across", already
describes. Until then, space is
the core app that document names.

## Everything here is public

The apex is outside Access, and every part of space is meant to be read by anybody: the design
system as a site of its own, and the docs and the specs once they are written for readers. Nothing
in space signs anybody in.

## Rendered on request, prerendered by choice

**Every page is rendered in the Worker; a page whose content a build already knows says
`export const prerender = true`** and is served from the assets instead, with no Worker running.
The choice is per route and never per app, so the app is never locked out of either.

Rendering on request is the default because the console's short edge cache does for a dynamic page
what a static build does for a fixed one -- spec/architecture/console.md, "The console's server
never waits on data; it only draws" -- and because a part such as an API tester may one day draw
around a reader's credentials, which no static build can.

**A response drawn around a reader is never cached**, at the edge or anywhere: only what is the
same for every reader goes into the Cache API, and a reader's credentials stay in the request that
carries them.

## The design system: three layers, and a style across them

What space's `/design` shows, drawn from the code itself and never a picture of it:

- **Primitives** are headless: what a control does, its keys, its focus and what assistive
  technology is told, drawing nothing. There is one set, and every component stands on it.
- **Components** bind a primitive and draw it, taking its accessibility with it. They are the
  units an interface is made of.
- **An interface** is components put together: a sidebar, a top bar, a page. It is an app's own.

**A style is two things, kept apart.** Its colors are values given to one contract of semantic
names -- lib's `spec/design/styles.md` holds the names and how one is made -- and light and dark are
two sets of values under it. Its components are a family, and a second family exists only where the
structure differs, never where only the colors do. A component reads the contract's names and no
color of its own, so one family takes any palette. An app picks a family and a palette, and
declares over them what is its alone.

**The console and space are the first on it**, with one style, mono, and they are moved a step at
a time, the console looking as it did after every step. **Only what the console has polished is
taken**: the sidebar with its account, the top bar, and the overview's map and timeline. A token or
a component the rest of the console uses is not the system's until that part is polished too.

**A component space needs and nothing has is made in space first**, used there as it is, and only
then split into its layers and moved into the system, which space then reads it back from. The site and the CMS each keep a style of their own until there is time to
move them -- [../issues/site.md](../issues/site.md) and [../issues/cms.md](../issues/cms.md).

## Defined once, rendered here, later

The docs and the specs are to be written where the work is -- a repository's `spec/` -- and read
from there at build time into pages, so one file is both the rule an agent follows and the page a
reader reads. Neither has a route yet; the design system comes first. What is open about it is
[../issues/space.md](../issues/space.md).
