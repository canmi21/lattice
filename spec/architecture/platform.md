# `canmi.app`: the platform, under one name

`canmi.app` is where the platform meets people: an account, a playground, a view of how it is
built. It is one name with many paths, served mostly from Workers; only what Cloudflare cannot
hold runs on the node. Its subdomains, `{label}.canmi.app`, are a different thing -- whole apps of
their own behind Access -- see [host.md](host.md), "One name inside, and a domain label outside".

## A path for what belongs together, a subdomain for what stands alone

- **`canmi.app/{scope}`** is for what is small, or what everything else leans on -- signing in, an
  account -- since one name shares one cookie, and a session is the platform's rather than an
  app's.
- **`{label}.canmi.app`** is for an app whose paths and cookies are its own and cannot be fenced --
  one written elsewhere -- or one large and independent enough to want a name, a mail client one
  day. They sit behind Access; the plan is for Access to become a list of what is let through,
  everything else refused.

## One name, many apps: SPA within a scope, MPA across

**A router Worker, `platform`, answers `canmi.app/*` and sends each path on by its first segment.**
`/` redirects to `canmi.net?ref=app` for now. A scope with an app of its own goes to that app --
a Worker by its binding, or an app on the node through the one VPC service, with its label as
`Host`. Everything else goes to the platform's core app. The table is generated from the scopes'
`service.toml`s, as the API gateway's is.

- **The core is one SvelteKit app** holding what belongs together and moves between itself
  constantly: the landing, and later signing in and the account. Within it, navigation is a
  single-page app's.
- **A scope that stands alone is its own SvelteKit app**, built with `paths.base` set to its path,
  so its pages and its hashed scripts and styles all live under `canmi.app/{scope}/` and it serves
  every one of them itself; nothing collects assets centrally. A playground is the shape of it:
  deployed wherever suits it, splitting its own paths as it likes, and free to break without
  touching anything else.
- **Between apps a navigation is a whole page, disguised.** One framework does not make one
  runtime: each app routes and hydrates itself, and mounting one inside another is a micro frontend
  this platform does not need. So a link to another scope loads it -- and every app shares the
  layout in `libs`, prerenders same-origin links on intent with Speculation Rules, and crosses with
  cross-document View Transitions, so the chrome stays put and the page changes as if it were one.
  How far each browser supports the last two, and the details of both, are to be worked out when
  the first two apps meet; a browser without them navigates plainly.

## Open

- What the core holds first, and the path the telemetry view takes.
- That the apex `canmi.app` stays outside Access while its subdomains are behind it.
