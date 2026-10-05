# The service domains' pages

The platform's service domains are its hosts -- `ixc.one`, `symlink.si`, `ill.li`, `monoflake.com`
and `monoflake.net` -- and each apex is to answer a page saying what it is. The pages are this
layer's; the hosts, their records and their routes are the platform's -- see platform's
`spec/architecture/gateway.md`. What is still to be built is [../issues/issues.md](../issues/issues.md).

## `ixc.one` and `il.lli.lil.ill.li` share one app, on Netlify

`apps/landing` is that app, begun from the status page's shell: SvelteKit, rendered on Netlify's
Edge Functions rather than prerendered, as the site's Worker renders everything and leaves the rest
to `Cache-Control`; it tells the hosts apart by the request's own URL. `ill.li` was bought for the
joke -- a capital I and a small l are one stroke in any proportional face, so the name reads as a
row of lines -- and kept because it is shorter on screen than `t.co` or `t.me`; its page goes three
labels down to keep the joke.

**`il.lli.lil.ill.li` is a DNS-only `CNAME` to Netlify**, which issues its certificate: Cloudflare's
universal certificate covers one label under a zone and no deeper. `ixc.one` is a `CNAME` at the
apex, flattened and proxied by Cloudflare.

In development it answers on 26525, and a host is asked for as itself under `.localhost` --
`http://ixc.one.localhost:26525/` -- which every browser resolves to this machine, so the page tells
hosts apart as it will deployed.

## `symlink.si` is a site of its own on the CDN, with the names laid over it

**The apex is an independent static site, served from the CDN and proxied by Cloudflare.** The
names the alias layer answers stay on the same host, as a Worker route laid over the site: a path
that is a name reaches the gateway's Worker and everything else reaches the site. One host, one
overlay -- the site never knows about the names, and the names never wait on the site.

## `monoflake.com` is a site of its own, and `monoflake.net` sends to it

**`monoflake.com` is an independent site**, the platform's own page rather than a section of the
shared app. **`monoflake.net` redirects to `monoflake.com`**, the one address for both, never to the
site.

## Vercel holds the status page and nothing else

The status page is the one thing there, and the service domains' pages are not -- see
[status.md](status.md).
