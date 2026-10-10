# Issues: space

What [../architecture/space.md](../architecture/space.md) leaves open. The rules over an entry are
the index's; see [issues.md](issues.md).

## Where the specs come from, and which of them are public

Specs live in every repository -- the workspace's own and each one under `repos/` -- while space is
web's and CI checks out web alone. Reading them at build time needs a way across: each repository
publishing its specs as an artifact, CI checking out the others, or a copy kept in web. And a spec
holds private facts beside public ones -- the sha network is one -- so what is published has to be
chosen file by file, by a mark a file opts in with rather than a list of what to leave out.
