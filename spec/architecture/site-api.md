# The site's API

The routes the site's pages ask, and the public ones the platform's gateway reaches. It moved here
from the platform's `spec/architecture/services.md` with the split, since the API is the site's.

## The site's API runs in the site's Worker

The site's pages and its API are one Worker, `site`. The API's routes are a Hono app in
`apps/site/api`, and the site's `hooks.server.ts` hands it the requests that are its own before
SvelteKit reads a path as a page's. Two doors reach it:

- **The site's pages ask it on their own origin, under `/api/`.** During server rendering SvelteKit
  answers a same-origin `fetch` in-process, so rendering a page costs no request at all; in the
  browser it is the connection the page already has, with no CORS and no preflight. These routes
  are the site's own and nobody else's contract.
- **The public routes are the `site` scope of the API host.** The gateway binds the `site` Worker
  and sends it `/api/{route}` under the API host's name, which a request can carry only by coming
  through that binding: Cloudflare picks the Worker by the host. The Worker serves those names
  alone -- `PUBLIC_ROUTES` in `apps/site/api/src/contract/routes.ts`, today `media` and `asset`, which the
  alias layer reads. The declaration says where it answers with `[api] prefix = "/api"`; see platform's
  `spec/architecture/services.md`, "The site's API runs in the site's Worker".

**Why one Worker.** The pages and the API they call now build together, so what one expects the
other is -- an internal route can change shape without a window where a deployed page asks a
deployed API a question it no longer answers. That is also what lets the internal addresses be
generated at build time for both at once. And rendering reads the corpus through the API, so a
subrequest per record was the price of keeping them apart.

**What it costs, accepted.** The code rendering pages holds the database, the records bucket and
the limits, where a separate Worker kept them from it. The rule [data.md](data.md)'s two buckets exist for is
that no route or catch-all can reach what it should not; here the API is reached only at `/api/`
and the API host, both decided in one function, and the records bucket is still not the one the CDN
serves. The site's error reporting covers the API, which had a Sentry project of its own.

**The two runtimes stay apart in the type checker.** The site's program checks against the
browser's globals, and the API against workerd's, and the two disagree about `Response` and
streams. So the site imports `@canmi/site-api` through `src/boundary.d.ts`, the one thing it needs --
something that answers a request -- and the API's own tests hold the real app to that declaration;
see the workspace's `spec/code.md`, "A runtime's globals decide which program checks a file".

**It lives in the site, beside `src/` rather than inside it.** `apps/site/api` is the site's own code
and sits in the site's directory, as a package of its own because its type program is not the
site's: inside `src/` it would be checked against the browser's globals. Nor is it a SvelteKit
route -- a `+server.ts` is in `src/` too, and would give up the Hono app, the addresses by contract and
the limits the API answers through. It was `libs/site-api` for a while, which put the site's API
among code every app may take, and it is nobody's but the site's.

**It is named `api`, and the SvelteKit app stays at the site's root.** The half with no page is
the server's; the other half renders on the server as well -- its hooks, its SSR, the dispatch into
this one -- so calling it `client/` would say something false about it, and moving it would have
moved every path the site's tooling and its build configuration name for no gain but symmetry.

**In development the records come off the disk.** The API reads the records tree through the
fetcher the store takes, which `wrangler dev` used to hand over as assets. The site's assets are its
own build and Vite runs in node, so the site reads the tree itself, in development only.

### The pages ask by contract, not by name

In production a page asks for a route at `/api/{address}`, twelve hex digits of a SHA-256 over the
route's name and its contract: the schemas its answer and request are read by, taken as data, and a
revision for whatever of its shape no schema describes. `apps/site/api/src/contract/contracts.ts` holds the
contracts, and the site's build states every address to the pages and to the Worker in one
`define`, so the two agree by construction. A route has a shape as well -- `articles/{slug}/reads`,
`assets/{name*}`, in `SHAPES` beside the routes -- which puts the thing it is about in the path, as
the workspace's `spec/addresses.md` has every address do; a production page asks at the route's
address followed by the shape's placeholders, `/api/{address}/{slug}`, and the Worker reads the
values back into the parameters its handler takes. Development asks at the shape itself, and a
production Worker answers a shape with a 404.

**The address moves with the contract and with nothing else.** A deploy that leaves a route alone
leaves its address, and whatever cached it, alone. A deploy that changes it gives it a new address,
so a tab still open from before asks the old one and is told the route does not exist -- the answer
a removed route would get -- rather than reading an answer of a shape it no longer understands.
Hashing the build instead would have cost every open tab every route on every deploy.

**It is not access control.** The addresses are in the page's script for anyone to read. What it
buys is that the internal routes are nobody's contract: nothing outside the site can come to depend
on one, so it can change whenever the site does. The public routes keep their names on the API host,
which is where a promise is made.

This reversed a first arrangement, in which the API was a Worker of its own named `site-api`. Its
reason was the credential split above, and it was sound until the internal addresses were wanted
built together with the pages, which two Workers cannot do.
