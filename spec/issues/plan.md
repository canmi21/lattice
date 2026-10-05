# Issues: the plan

What the milestones in [../todo/milestones.md](../todo/milestones.md) leave open. The rules over
an entry are the index's; see [issues.md](issues.md).

## How a fixed page is edited, if at all

The homepage is imported and has no way in afterwards,
which is accepted for now: it has one permanent address rather than a chosen one, it belongs to no
collection, and what a reader sees there is its text plus components the site's router adds. That
makes it a different shape from an article rather than a simpler one, and it is worth designing
once the editor has settled rather than guessing alongside it. Blocks nothing; revisit after B4.

## How a one-shot command reads the collection

More than half the readers of the three record
files are Rust -- ten of `media.yaml`'s, six of `metadata.json`'s -- and `local` holds no line
that opens the collection's database, because B1 gave the authored database to the TypeScript
half so that its schema is declared once. Every one of those readers is a command that runs and
exits: `local alt`, `local image`, `local gc`. `local serve` is one subcommand beside them, not a
thing they can assume is up.

So there are four answers and none is free. A command spawns the other half and pays node's
startup every run. A command requires `serve` to be up, which changes what the command line
promises. Rust opens the file read-only, which is a second set of column names to drift. Or the
commands that read records move to the other half, away from the derivation they were written
for. Blocks the second half of A2, and C5 behind it.

## What `local` is called once it is not local

The name describes where it runs, and D2 moves it
to another machine while D4 puts its surface on the public internet. It is the right name for the
year it is true and a lie afterwards, so the rename belongs in D2 rather than being avoided now.
