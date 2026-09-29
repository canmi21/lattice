# The firewall in front of every zone

Cloudflare's WAF runs before a Worker does, so a request it blocks costs nothing: no Worker
invocation, none of the Free plan's daily requests, nothing reaching the machine at home. The rules
live in `rules/`, and **git is their one source: a script syncs them to Cloudflare, one way**.
Nobody edits them in the dashboard, so the script never reads what is live: what changed is what
jj's diff of `rules/` says, and a sync replaces each zone's rules with the repository's whole.

## Where a rule lives

**`rules/` is the whole of every zone's firewall, and nothing else defines one.** Each zone is a
folder named for it, and its `zone.toml` lists the zone's rules in the order Cloudflare runs them:
each rule's name as the dashboard shows it, its phase, its action and everything the action takes
-- a redirect's status and target, a rate limit's figures. A rule's match expression, the one part
that grows, is a `.txt` file beside it; `rules/all/` holds the expressions every zone shares. A rule
carries no comment: it is its own reason. The shape is documented where it is read, in
`.mise/tasks/rules`, and this file names no rule and no figure: what a zone does is read in its
folder.

Three things hold across every zone, and a new rule keeps to them:

- **A blacklist everywhere**: what scanners ask every host for is refused before a Worker runs.
- **A whitelist where the paths are ours**: a host whose every path this repository serves refuses
  the rest, and lets `/.well-known/` through, where the standards put what every host answers.
  `*.canmi.app` has no whitelist: its names are other vendors' interfaces behind Access.
- **One rate cap per zone, a floor under the limits that know more**: counted by address at each
  Cloudflare location, set to catch a flood rather than a reader. A service's own limits -- the
  gateway's, Caddy's -- are the exact ones.

**Every host answers its own security.txt.** `libs/security` writes it -- RFC 9116's two required
fields, `Contact` and `Expires`, and the host's own `Canonical` -- with an expiry 180 days out,
stated per request so it never lapses, and the site, the gateway, the CDN and the alias layer each
answer `/.well-known/security.txt` from it. Every whitelist lets `/.well-known/` through, which the
gate checks. The address is `security@canmi.net`, forwarded by Cloudflare's Email Routing, so the
mailbox behind it can change without the file.

## How an expression is written

- `wildcard` is already case-insensitive -- `strict wildcard` is the case-sensitive one -- so a
  `lower()` in front of it changes nothing and costs length. `starts_with`, `ends_with`, `eq` and
  `in {...}` are case-sensitive, and a path they read is left as it came: a whitelist refusing
  `/Object/` is right, since no address here is spelled so.
- `http.request.uri.path.extension` is the path's last extension, lowercased and without its dot,
  and `""` for none, so one `in {...}` replaces a column of `ends_with`.
- `matches` (regular expressions) is a Business feature and is not used.
- An expression holds no comments and at most 4,096 characters. What a rule is for is this file.
- **A secret in an expression is `${NAME}`**, filled at sync from the environment mise decrypts
  the repository's secrets into -- the probe's token, `${PROBE_TOKEN}`, is the one today. Only a
  name the rules task knows may appear, which the check holds to; a sync refuses a zone whose
  secret is unset before it asks Cloudflare anything, and a dry run prints the name, never the
  value. See [probe.md](probe.md).

## Keeping them in step, and deploying them

`mise run rules` -- one of `verify`'s gates -- holds the files to Cloudflare's limits, to each
zone's `zone.toml`, and to what the apps serve: a public scope of the API host the rule would
refuse, or an extension among the site's routes and public files that it would, fails the check.

**`mise run rules sync [zone]` deploys them**, through Cloudflare's `cf` CLI: each phase of each zone
is sent whole, first to Cloudflare's own validation, and only if every one passes is each put as
the zone's entry point for that phase, replacing what was there. It is run by hand after a change
lands, and it is safe to run again. It authenticates with `CLOUDFLARE_ZONES_TOKEN`, decrypted from the
repository's secrets: one token for every script that works on the zones, scoped to all of them
and to zone-level permissions alone -- WAF and page rules to edit, cache to purge, and DNS,
settings, analytics and Workers routes to read. Anything the account holds beyond the zones would
be another token of its own. Without it the sync refuses rather than falling back to a broader
login, and the account's owner login is never used by a script.
