# Long-running tasks

`local` is a resident process because it holds the schedule and answers the editor; see
[local.md](architecture/local.md). This is how the work it schedules is described, kept from
colliding with itself, and observed.

## The catalogue is data, and it is complete before the runner

Every operation that takes more than an instant is declared in
[task/mod.rs](../apps/local/src/task/mod.rs): what it is, whether it asks a model, what it reads,
what it writes, and which tasks must have run first. Nothing there runs anything.

Splitting the description from the execution is what lets the catalogue be finished first. A GUI
listing what exists, a scheduler ordering it, and a person asking how much a full run would cost
are all answerable now, against seventeen entries, rather than after seventeen operations have
been rewritten. Adding an entry makes a task **known**, not runnable.

Reads and writes name **records**, not paths. Two tasks contend when they mutate the same records,
and stating it that way leaves the file layout free to move without the catalogue following it.

`after` is declared and nothing reads it. The dependency is a fact about the task, so it belongs
beside the task rather than inside whatever eventually orders them. It is tested even though it is
unused: an edge naming a task that does not exist would otherwise stay invisible until a scheduler
deadlocked or silently skipped work, long after anyone remembers writing it. Declaring edges early
is only safe because the test holds them.

**One kind of subcommand is deliberately absent, and it is decided by what the command leaves
behind rather than by how it is invoked.** A second category stood here -- hand-run operations
whose input is a person's argument, covering `captions`, `invalidate` and `twitter` -- and it did
not survive its own test. Taking an argument was the only thing those three shared, and `local
captions` is catalogued now while still taking two of them.

**Commands that write no record** -- `overview`, `articles`, `derived`, `check`, `port`, `tasks`,
`runs` and `twitter`. Listing them would put eight entries in every task view that can never be
watched, waited on, or scheduled, and none of them can collide with anything: `conflicts_with`
intersects `writes`, and theirs is empty. This list was called "instant reads", which was never
true of `local twitter` -- it waits on somebody else's network and is the slowest read here. Being
instant was not the reason and never had been; writing nothing is.

That leaves the rule the rest of the commands are held to: **a command that takes more than an
instant and writes a record is catalogued, whatever it takes on the command line.** `local captions`
is where that was settled. It takes a clip and a track path, so there is no set of tracks to fan
out over -- a clip and its track do not arrive on the same day, and often the track never arrives
-- but it writes `PublicCaptions`, `PublicMeta` and `Manifest`, and the sweep writes all three.
Its entry is `Items::Whole`: one clip and one track is a unit that cannot be divided, so a second
runner can only stand aside, which is the same shape `segments` and `licenses` have and not the
per-item fan-out `image` and `video` need. `after` names `video`, because the clip has to be in
the library and the excerpt the track is cut to is written into `data/record/media.yaml` by that import.

`local invalidate` is the one command the corrected rule leaves without a home; the section below
records it rather than closing it.

## A published kind has one record, and the sweep declares every one of them

`local gc` walks the whole content-addressed space under `data/bucket/objects`, the fetched icons
under `data/source/favicon`, rewrites `data/record/metadata.json` without the entries it drops, and
behind `--segments` drops translations for paragraphs an article no longer contains. Each of those
is a record, and the rule over them has three parts.

**One kind, one record.** `PublicCaptions` names every caption track and nothing else names one. A
second name for one store is two locks guarding half a thing each.

**This used to read "one tree", and the trees are gone.** Objects are filed by content id alone
now, so `PublicImage`, `PublicVideo`, `PublicCaptions`, `PublicOpengraph` and `PublicLicense` all
denote the same directory. That is not a lock that stopped working, for two reasons worth stating
because neither is obvious: two writers can only collide on a key when they are writing identical
bytes, since the key _is_ the hash of them; and the one task that deletes takes every record, so
nothing writes beside a sweep. What the names partition is who writes what, not which directory
they write into.

**A task declares every record it writes**, including the ones it rewrites on the way past. The
merged manifest and the sidecar under `meta/` are written for every asset published, so `Manifest`
and `PublicMeta` belong to `local image` and `local video` as much as `PublicImage` does. That is the
rule `local video` and `data/record/media.yaml` state below, reaching the published side of the tree.

**The sweep runs twice before it deletes anything.** `local gc` records what it found unnamed and
when; a later run deletes only what has been unnamed for an hour, because a root cached five
minutes ago may still name it. The pending list is a record like any other and is declared as one.
See [architecture/artifacts.md](architecture/artifacts.md), "An object is swept an hour after
nothing names it".

**The sweep comes after everything whose output it can delete.** That is tested as an invariant over
the catalogue rather than kept as a list, because the list is what went stale: `licenses` and `i18n`
were both missing from `gc`'s `after`, and both were missing because a tree was added to the sweep
without the catalogue being re-read.

Why it is worth stating: `Spec::conflicts_with` intersects `writes` and nothing else. A publisher
that does not declare what it writes is invisible to the only mechanism that would keep it from
running beside the sweep. The cost is not a crash -- while `local captions` had no entry, `local gc
--live` could remove a track it had just published and the manifest still pointed at, and neither
run would report anything wrong.

### One gap is recorded rather than closed

The two that stood here are closed. `local captions` has a catalogue entry, so the mechanism can see
that it and `local gc` contend over three records; a card is swept against the record that names it,
which is settled in [architecture/media.md](architecture/media.md).

`local invalidate` is what the corrected exemption leaves behind. It writes `Translations` -- the
same record `local i18n` writes and `local gc --segments` deletes from -- and it has no entry, so the
one mechanism that would keep it from running beside either of them cannot see it. Every ground
that took `local captions` into the catalogue holds here word for word, and the only thing still
keeping it out is that nobody has decided it. That decision is the reader's, not this file's.

Two build records are deliberately left without one. `data/build/licenses.json` and
`data/build/opengraph.json` each have exactly one writer, and the sweep only reads the first, so
neither can be contended over. A record for a store one task owns would name a lock nobody takes.

## Computing and writing are separate concerns

**A task holds no lock while it thinks.** The expensive part of `local alt` and `local tag` is minutes
of model calls; the part that touches `data/record/media.yaml` is milliseconds at the end. Leasing that
file for the length of a run would serialise the two tasks over a critical section a ten-thousandth
of its length, and serialise them at exactly the point where parallelism is worth the most.

So mutations are values, not writes. A worker finishes an item, pushes the mutation it produced,
and moves on. Applying it is somebody else's job.

**Within a process, one writer per record store applies them in turn.** That removes write races
without any worker waiting on another, and it means the store is only ever open in one place.

**Between processes, a short lock is taken at the moment of applying** -- and only then. `local` is
several processes by design: the resident service, a hand-run command in a terminal, and
eventually the schedule. A single-threaded writer inside one of them says nothing about the others, so this
lock is what actually makes the write safe. Held for one apply, it does not measurably contend.

A mutation is flushed as it is applied rather than batched to the end of a run. What is being
protected is paid output: losing an hour of translations to a crash costs money, and the write is
cheap next to the call that produced the value.

### A mutation re-reads the record; it never saves the copy the run planned against

A run reads a store once to work out what is owed, and that copy goes stale the moment another
process writes. Saving it back would not merge -- it would replace, so the other run's paid output
disappears with no error anywhere. So an apply loads the record inside the lock, changes the
entries this answer produced, and saves. The in-memory copy is for planning and for prompts that
have to show what exists so far; it is never what reaches disk.

This is the difference the lock alone does not make. A short exclusive lock stops two writes from
interleaving; it does nothing about a write whose _contents_ were decided before the other one
landed.

### A task writing several records applies them in dependency order

Records are locked one at a time, so a task that writes more than one cannot make its writes
atomic together. It does not need to. What it needs is that every state in between is one a
reader can live with, and that is a property of the order.

`local tag` is the case that sets it: it writes a tag registry and the assets that name those tags.
The registry goes first. A definition nothing references yet is inert, and the next run simply
finds it already there; an asset naming a definition that has not landed is a dangling name, and
a reader resolving it gets nothing. Between the two applies is a pair of file writes.

So the rule is to write what is pointed _at_ before what points, and the general form of it is
that the readable intermediate state decides the order. Where no answer touches two records the
question does not arise -- `local locale` writes three and each answer lands in exactly one, so its
writers never meet.

## Contention is resolved per item, and the loser does not wait

Work is claimed one item at a time -- a content id, an article, a (segment, locale) pair -- and the
claim is atomic across processes.

**A claimed item is skipped, not waited for.** If A is translating segment one and B wants segment
two, both proceed. If B wants the segment A already holds, B leaves it alone and takes the next.
Only when every item B wanted is already claimed does B report that A is doing this work and exit.

Waiting is the thing to avoid. A queue is an ordering, ordering is the scheduler's job, and the
scheduler does not exist yet -- a task that blocks on a lease would be a scheduler nobody designed,
with no timeout, cancellation or priority. Skipping needs none of those and leaves the run's own
report accurate: it says what it did and what somebody else was already doing.

A task declared `Items::Whole` cannot divide, so a second runner can only stand aside.

### A claim stops concurrent duplication; only re-reading stops sequential duplication

Claims are taken and released per item, so two runs overlapping in time still each do an item the
other finished before it was reached. Measured, with two `local favicon --force` processes over the
same five domains: each collected three and stood aside on two, which is six pieces of work for
five domains. One domain was fetched twice because the second run arrived after the first had let
go of it.

For favicons that is a wasted request. For anything that asks a model it is the same answer paid
for twice.

So the claim is only half of it. **After taking the claim, an item is re-read from the record
before the work starts**, and an item that has since been done is dropped. The claim makes that
check safe -- nothing can complete between reading and working, because the claim is held across
both -- and the check is what makes the claim mean "still needed" rather than merely "not being
done this instant".

A forced run skips the check by definition: `--force` says redo it, and there is nothing to
observe that would change the answer.

## Rewriting article text is a compatibility path, not the design

**The two import commands edit `contents/**/*.md`, and nothing else does.** `local image` and
`local video` each do it because an author wrote a temporary filename -- `![](shot.png)`,
`![](take-3.mov)` -- and the reference has to become the resource id once the asset is derived;
[video/run.rs](../apps/local/src/video/run.rs) calls the same `rewrite_references` `local image` does.
A test asserts the pair, and a third writer of `Articles` would fail it. Every other task reading
`Articles` declares `after: ["image"]` largely to stay clear of that rewrite.

`local video` had no entry for a while, and the cost was not cosmetic. `Spec::conflicts_with` answers
whether two operations may be offered together by intersecting their `writes`, so an uncatalogued
writer of `Articles` was invisible to the only mechanism that would keep it from running beside
`local image` -- the contention this file exists to describe.

Its entry writes `Articles`, `PublicVideo` for the published rungs, `PublicImage` for the
poster's variants, and `Media`. The last one is easy to miss: giving a poster
with no source the clip's rewrites the whole of `data/record/media.yaml`, so `local alt` finishing mid-run
would be overwritten. A record a task rewrites wholesale is a record it writes, whether or not the
run had anything of its own to put there.

**It exists only because there is no editor yet.** An editor that derives a picture at the moment
it is inserted -- store it, then write the content id into the article -- produces an article that
never held a temporary name, so nothing is left to rewrite. The rewrite is compensation for
authoring markdown by hand, not a permanent step.

Two things follow. The split between deriving a picture and writing it is still wanted, because
that is exactly the pair an editor calls synchronously for one image. And `local image` keeps a
narrower job afterwards: content that arrived without passing through the editor -- a migration, a
batch somebody dropped in, an article written in another editor. That is a run a person starts,
not one a schedule fires, which is what keeps it away from an open draft.

Do not build anything new on the assumption that article text is rewritten behind the author's
back. The `after: ["image"]` edges are expected to weaken once insertion handles its own images.

**Published bytes and their manifest must exist before an article is rewritten.** A crash on the
safe side of that boundary leaves an unreferenced derived image, and another run can finish the
rewrite. The reverse order can leave an article pointing at bytes that do not exist after the
rewrite has destroyed the original filename -- and with it the information a later run needed to
repair the article. The same rule holds when an editor stores one image before inserting its id.

## The editor has no round trip, so there is nothing for one to lose

The editor's document is the text itself (see
[architecture/local.md](architecture/local.md), "The editor's document is the markdown text"):
what is saved is what was typed, and nothing converts it on the way in or out. The obligation the
two earlier editors carried -- a parse and serialize pass had to keep the structure of every stored
article, checked by a test over `contents/` -- is gone with the pass. Both editors are archived:
the desktop one at <https://github.com/canmi21/desktop-cms-archive>, and the ProseMirror one in
this repository's history before 2026-09-24. What they found about the syntax is still true and
still the site's parser's to answer: a directive's three forms, and a fence's info string, which
remark splits at the first space into `lang` and `meta` and which a renderer reads as
`{ name, values }` when it is written `{name values}`. A `font` directive's `family` and a `font`
fence's sole value must be ids exported by `@canmi/fonts`.

## A finished run leaves nothing behind, and that is the gap

The registry answers what is running. Nothing answers what ran. An entry disappears when its
process lets go, so a run that failed and a run that succeeded look identical from outside: both
are simply absent.

This is visible today. `favicon::collect` deliberately survives a dead domain and reports it in
`Outcome.failed`, which the CLI prints; the desktop adapter starts the same operation on a thread
and drops the outcome entirely. The counts on the Derived page still tell the truth -- work that
did not happen is still outstanding -- but the reason is gone.

Recording it means run history: what ran, when, how it ended, what it cost. That is the Activity
page, and it needs to be durable, because a history held in memory is emptied by the restart that
most often follows a crash worth reading about. Half of it is worse than none: a control that
reports success it did not verify is the failure mode this whole layer exists to avoid.

So the outcome is dropped on purpose until there is somewhere durable to put it, rather than being
kept somewhere that would have to be unbuilt.

## Liveness is a held lock, never a written status

A run that records `status: running` in a file and is then killed with `SIGKILL`, panics, or loses
power leaves that word behind for good. Nothing can distinguish it from a live run, every later run
refuses to start, and the workspace is poisoned until somebody deletes a file by hand and guesses
whether it was safe to.

So a file records only intent and metadata -- which task, which process, when it started, how far
it got. **The fact of being alive is that the runner still holds an exclusive lock on its own
entry.** Anything wanting to know tries to take that lock: succeeding means the writer is gone and
the entry is a corpse to be reaped. The kernel drops the lock when the process dies however it
dies, which is why this needs no heartbeat, no timeout and no daemon.

Written status can only ever be a hint about a process that was alive when it was written.

## Runtime state lives in `.local/`, keyed by nothing

The run registry, the claims and the lock files sit in `.local/` at the repository root, untracked.

Not `data/`: that directory groups assets with the records about them, and the question asked of
anything new there is whether reading its diff would tell anyone anything. A process id and a
progress count fail that test, and putting them there would blur what the directory means even
though the allowlist would keep them out of git.

Not outside the repository either. State held elsewhere has to be keyed by which repository it
belongs to, and a path is not a directory name, so the key becomes a hash -- and then nothing can
tell which checkout a directory belongs to without resolving it. Putting the state _in_ the
repository dissolves the question: processes working on one checkout share a directory because it
is the same directory, and two checkouts are independent because they are.

**A claim file's name is still a hash, and that is a different case.** What made hashing the wrong
answer above was that somebody looking at the directory could no longer tell which repository it
served. An item key -- an article path with slashes in it, a segment id and a locale -- also
cannot be a file name, but nothing needs to recover it _from_ the name: the key is written inside
the file, so opening one answers the question the name cannot, and anything reading the directory
gets the same answer by opening them. The hash costs no legibility there, which is the only thing
it cost above.

That sentence used to name a `local claims` command. There is no such subcommand and there never
was -- it was written as an illustration of who would read the directory and read as a description
of something that existed. The argument does not need it: what carries it is the key being inside
the file, which is true of any reader at all.
