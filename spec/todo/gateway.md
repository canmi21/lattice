# Deferred: the gateway

Where the hosts are today against [the gateway](../architecture/gateway.md) they are moving to:
what has to change, and what is not yet decided. The order the work is done in is a milestone once
it is agreed, not an entry here.

The rules over an entry are the index's; see [todo.md](todo.md).

## The CDN and the alias layer still stamp their own lifetimes

Both stand behind the gateway now, which answers their hosts -- `cdn.ffoni.com` and `ill.li` --
their CORS, their host files and the path rule, and stamps what leaves them from their
declarations. Each still stamps its answers itself as well, in its `cache.ts`: the gateway writes
over it, but the CDN keeps derived pictures in its own cache by that stamp, so it is not idle
there. Whether the CDN's own cache reads its lifetime from the declaration instead, and the alias
layer's stamps go, is the cleanup pass's to settle.

## An apex answers nothing yet

`monoflake.com`, `monoflake.net`, `ixc.one` and `symlink.si` are service domains, and each apex is
to answer a placeholder page saying so. Until then `monoflake.com`, `monoflake.net` and `ixc.one`
have no apex record -- `www.ixc.one`'s redirect to its apex leads nowhere -- and `symlink.si`'s root
is the gateway's redirect to the site. `ill.li`'s apex keeps its redirect, so its page is on a host one
label down, named when it is built. Done in the cleanup pass, once the migration is.

## The whitelists are written by hand, and checked against the table only

`rules/ill.li/alias-paths-only.txt`, `rules/ffoni.com/api-scopes-only.txt` and
`rules/ffoni.com/cdn-prefixes-only.txt` spell each host's paths out by hand, and `mise run rules`
checks only that the API's list and the gateway's scopes name the same scopes. The new zones --
`monoflake.com`, `ixc.one`, `symlink.si` -- have no rules at all, and `symlink.si` is not yet a
domain anything answers.

A generated whitelist has two limits to fit inside: an expression is at most 4,096 characters, and
the Free plan allows a zone five custom rules. Every deployment of `ixc.one` is in one zone, so its
whitelist covers every service on every node in one expression.

## An application has no way to stand apart from the infrastructure it is built on

The gateway gives the service layer one place for its hosts, its files and its rules. The
application layer -- the site, the status page -- has none: each answers its own robots, its own
security.txt, its own canonical and its own mirrors by calling the libraries, and nothing says
which of its concerns are its own and which it only borrows from the platform.

**Undecided: what separates an application from the infrastructure**, so that the questions only
an application asks -- which of two hosts a page is indexed under, what a page's title is -- stay
with it, and none of the platform's leaks into it.

## A deployment's host is not checked against where the service runs

`geo-glo-cf.ixc.one` reads as geo on Cloudflare's Workers, and the gateway sends it to the node at
home, where geo runs, all the same: a profile's placement is read and not checked against the
service's declared placements, since every service has one placement today. Refusing a placement a
service is not at, and choosing among several where it is, come together with the gateway's choice
of where a request runs.
