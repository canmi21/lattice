# Issues: the console

What [../architecture/console.md](../architecture/console.md) leaves open. The rules over an entry
are the index's; see [issues.md](issues.md).

## Where the console learns a node's facts

A node's tier, failure domain, expiry year and system are infra's, in its `nodes/nodes.toml`, and
the console needs them for the node table and each node's header. Today
`apps/console/src/lib/nodes/facts.ts` copies them by hand, so a node added or retired in infra
leaves the console wrong until somebody edits both. Each node's host could serve its own row, the
relay could carry the table with the snapshots, or the build could read the file from infra; each
moves where the fact is held, and none is chosen.

## Where display names come from once others deploy apps

The console's copy of every display name -- [../architecture/console.md](../architecture/console.md)
-- holds while every app is the author's and a test can read every declaration. An app a friend
deploys from their own repository is in no checkout beside this one, so its name has to reach the
console at run time: relay carrying `display_name` from host's apps, or a registry the platform
keeps of every app it deploys, Workers included. Undecided until accounts exist.

## A node's latency to the database's primary is measured nowhere

The author asked on 2026-10-09 for a row in a place's card on the overview's map: each node's
round trip, in milliseconds, to the node the platform's database is primary on. Nothing measures
it: no app in infra or the platform records a round trip between nodes, and the console learns
which node is primary only from the database's keepers, read through each node's host on the
database's own page. What deciding it involves:

- **Who measures**: each node's relay, which already holds a socket to every peer and could time a
  ping on it, or the meter, or a probe of the primary's port over the tailnet -- the last measures
  what an app would see, the first only the relay's own path.
- **Which primary**: the keepers' answer, read once per snapshot rather than per card, and what the
  row says while there is none.
- **How it reaches the console**: in the snapshot the relay passes on, as every other figure the
  card draws does, so the card reads it live without a request of its own.
