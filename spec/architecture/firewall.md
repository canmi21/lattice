# The firewall in front of every zone

Cloudflare's WAF runs before a Worker does, so a request it blocks costs nothing: no Worker
invocation, none of the Free plan's daily requests, nothing reaching the machine at home. The rules
live in `rules/` as the expressions themselves, one file each, and are pasted into the dashboard by
hand. Nothing deploys them: the plan has no API for them worth the credential, and five rules per
zone are few enough to paste.

## One blacklist everywhere, and a whitelist where the paths are ours

| Rule              | File                                                                                 | Pasted into                             | Order |
| ----------------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ----- |
| Block Probes      | [rules/all/block-probes.txt](../../rules/all/block-probes.txt)                       | canmi.net, ffoni.com, ill.li, canmi.app | 1     |
| Security Contact  | [rules/canmi.app/security-redirect.txt](../../rules/canmi.app/security-redirect.txt) | canmi.app, as a redirect rule           | --    |
| Site Files Only   | [rules/canmi.net/site-files-only.txt](../../rules/canmi.net/site-files-only.txt)     | canmi.net                               | 2     |
| API Scopes Only   | [rules/ffoni.com/api-scopes-only.txt](../../rules/ffoni.com/api-scopes-only.txt)     | ffoni.com                               | 2     |
| CDN Prefixes Only | [rules/ffoni.com/cdn-prefixes-only.txt](../../rules/ffoni.com/cdn-prefixes-only.txt) | ffoni.com                               | 3     |
| Alias Paths Only  | [rules/ill.li/alias-paths-only.txt](../../rules/ill.li/alias-paths-only.txt)         | ill.li                                  | 2     |
| Rate Cap          | [rules/canmi.net/rate-cap.txt](../../rules/canmi.net/rate-cap.txt)                   | canmi.net, 150 in 10 s                  | --    |
| Rate Cap          | [rules/ill.li/rate-cap.txt](../../rules/ill.li/rate-cap.txt)                         | ill.li, 150 in 10 s                     | --    |
| Rate Cap          | [rules/canmi.app/rate-cap.txt](../../rules/canmi.app/rate-cap.txt)                   | canmi.app, 300 in 10 s                  | --    |
| Rate Cap          | [rules/ffoni.com/rate-cap.txt](../../rules/ffoni.com/rate-cap.txt)                   | ffoni.com, 50 in 10 s                   | --    |

**The folder is where a rule is pasted.** `rules/all/` goes into every zone and each other folder is
named for its zone, since a rule on this plan belongs to one zone; the name is `all` rather than
`*`, which Windows refuses in a file name and a shell expands. Every rule blocks, and the title in
the table is the name it is given in the dashboard.

**Every host answers its own security.txt.** `libs/security` writes it -- RFC 9116's two required
fields, `Contact` and `Expires`, and the host's own `Canonical` -- with an expiry 180 days out,
stated per request so it never lapses, and the site, the gateway, the CDN and the alias layer each
answer `/.well-known/security.txt` from it. Every whitelist lets `/.well-known/` through, which the
gate checks. The address is `security@canmi.net`, forwarded by Cloudflare's Email Routing, so the
mailbox behind it can change without the file.

**canmi.app redirects, for now.** Its names are interfaces behind Access, several of them another
vendor's, and none of them ours to add a path to. So the zone's redirect rule, Security Contact,
sends the path to the site's with a static 301 to `https://canmi.net/.well-known/security.txt`, the
query not kept; redirect rules run before the WAF and before Access. When the apex serves a page of
its own it answers the file itself, and a whitelist for it lets `/.well-known/` through like the
rest.

**Block Probes is the same file in every zone.** It refuses what scanners ask every host for -- the
paths of WordPress and phpMyAdmin, version control and credential files, package manifests, source
maps, anything but ports 80 and 443 -- and nothing a site here would serve. Rules are per zone on
this plan, so "shared" means pasted four times; the file is the one copy.

**A whitelist names exactly what its host answers, and refuses the rest.** The site by extension:
a page has none, and it serves `css`, `js`, `json`, `md`, `txt`, `xml`, `xsl` and its `ico`, its
images and fonts coming from the CDN. The API host by scope, the CDN by its prefixes and the alias
layer by its two shapes of address -- each already answers anything else with a 4xx from its
Worker, and the rule moves that answer in front of the Worker. Every whitelist names its host, so
it does nothing to the zone's other names.

**`*.canmi.app` has the blacklist and no whitelist.** Its names are interfaces, several of them
another vendor's -- the router, the NAS -- whose files nobody here chose, and Access stands in
front of all of them already. `*.canmi.icu` has neither: it is not proxied, so Cloudflare never
sees it.

**Rate Cap is each zone's one rate limiting rule, set to what the zone serves.** The plan allows one
a zone, counting by IP over 10 seconds and blocking for 10, and its expression may read only the
path and whether the client is a verified bot, never the host. Verified crawlers are never counted.
A cache hit is counted like any other request, and several readers can share one address behind a
carrier's NAT, so the figures catch floods rather than readers:

- **canmi.net, 150.** A page's scripts and styles are immutable and cached after the first visit, so
  reading costs a few requests a page.
- **ill.li, 150.** An article's pictures are asked for through the alias layer, dozens a page.
- **canmi.app, 300.** One person, through Access, behind interfaces -- the router's, the NAS's -- that
  ask for a great deal at once.
- **ffoni.com, 50, on every scoped path but the CDN's.** The zone holds the API host and the CDN,
  and the path is the only way to tell them apart. Every path two segments deep is counted, so a
  new scope is counted without being named. The CDN's groups -- `/object/`, `/derive/`, `/proxy/`
  -- are left out, since a page of photographs is a hundred requests, but not its old `/github/`,
  a redirect only old links reach; and so is `/hook/`, GitHub's, rare and from addresses GitHub
  shares. The rule is a floor against floods, not a limit on use: each scope's own limit is the
  gateway's, `geo` sixty a minute and `shot` three captures a minute, and fifty in ten seconds
  leaves room for a page asking several scopes at once, or a caller asking after a capture. What
  it leaves out is held by `mise run rules` to the CDN's groups and the webhook.

## How an expression is written

- `wildcard` is already case-insensitive -- `strict wildcard` is the case-sensitive one -- so a
  `lower()` in front of it changes nothing and costs length. `starts_with`, `ends_with`, `eq` and
  `in {...}` are case-sensitive, and a path they read is left as it came: a whitelist refusing
  `/Object/` is right, since no address here is spelled so.
- `http.request.uri.path.extension` is the path's last extension, lowercased and without its dot,
  and `""` for none, so one `in {...}` replaces a column of `ends_with`.
- `matches` (regular expressions) is a Business feature and is not used.
- An expression holds no comments and at most 4,096 characters. What a rule is for is this file.

## Keeping them in step

`mise run rules` -- one of `verify`'s gates -- holds the files to Cloudflare's limits, to this
table, and to what the apps serve: a public scope of the API host the rule would refuse, or an
extension among the site's routes and public files that it would, fails the check. A change to a
file in `rules/` is not live until it is pasted; **the agent that changes one tells the user which
rule to paste into which zone**, since nothing else will.
