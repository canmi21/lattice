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

## Three layers of design, two of them shared

- **The foundation** -- color, type, spacing, motion, theme -- is shared in part. What both read
  is `@canmi/kit`'s, in lib, and each declares the rest of its own over it, as the console's
  stylesheet lays its ground, surface and wash over kit's palettes. A value two consumers declare
  alike moves down into kit; one only a consumer reads stays with it.
- **The neutral components**, the console's: menus, segmented controls, tabs, the hover hold, icon
  buttons. They move out of `apps/console` into a library under `libs/`, exported as source, so the
  console and space read the same files with nothing published between them. One that a project
  outside web needs moves on to `@canmi/ui` in lib.
- **The site's own components** stay in `apps/site`: they carry its style, and it is their one
  consumer.

Space's `/design` draws the first two from the code itself, never a picture of it.

## Defined once, rendered here, later

The docs and the specs are to be written where the work is -- a repository's `spec/` -- and read
from there at build time into pages, so one file is both the rule an agent follows and the page a
reader reads. Neither has a route yet; the design system comes first. What is open about it is
[../issues/space.md](../issues/space.md).
