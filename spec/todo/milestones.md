# The plan, in milestones

This file is the agreed shape of the work, not a list of findings -- the rest of this directory is
that. A milestone says what is being changed and what it cannot start before; it does not say when,
and nothing here begins because it is written down. The steps are taken one at a time, each
proposed and accepted before anything is written, which is the same rule the index states for a
finding and holds harder here: a milestone is a decision already made, so the only thing left to
get wrong is the order.

## The two boundaries everything else hangs from

**The first boundary is who produced the data, not where it sits.** A location is not an authority:
R2 holds a copy of what this machine authored and is not therefore a place anything may write back
to, and a database in the cloud is authoritative for what readers did there and for nothing else.

| what                                                    | authored by | authoritative store               | written by                  |
| ------------------------------------------------------- | ----------- | --------------------------------- | --------------------------- |
| text, originals, derived cache, metadata, the id ledger | me          | the collection, on one machine    | `local`, and only it        |
| likes, reads, subscriptions, comments                   | readers     | the reader database, in the cloud | the public API, and only it |
| published objects and roots                             | derived     | the object store, mirrored to R2  | the publishing pass         |

**The second boundary is inside the relational half, and it is the one most easily lost.** The
authored metadata and the reader state are both rows in a SQL database, which is exactly why they
must never be rows in the _same_ database. The tooling is shared -- one Drizzle setup, whose
generated SQL runs on SQLite and on D1 alike -- and the databases are not.

The failure this prevents is concrete rather than tidy. Development refreshes its copy of the
reader state from production; if the authored metadata shared that database, a refresh would
overwrite rows that cannot be recomputed. One restore must never be able to destroy the corpus.

**The development role gets copies and writes nothing.** Published objects are immutable and
already served, so it reads them where they are; the reader state is dumped once and is
disposable. It never has the collection, and it never needs a full copy of anything.

## The model these milestones assume

### Three things, and what each one is allowed to do

| concept  | what it identifies                                                       | mutable?                                                             |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **rid**  | a thing, as an overlay resolving to whichever content currently means it | yes, in what it points at; the id itself never moves                 |
| **cid**  | a run of bytes                                                           | **never.** Bytes are not edited; different bytes are a different cid |
| metadata | what is known about one of the two above                                 | yes, and it is the only mutable half of the pair                     |

**A resource may hold several contents at once**, so this is not a chain of replacements: an icon
is a light file and a dark one, a photograph can carry the scan it was imported as and the better
scan that arrived later. Editing a picture, when there is an editor to do it with, produces new
bytes and therefore a new cid; what changes is which content the rid resolves to.

### Metadata is layered by one question

**Would this still be true of different bytes of the same thing?**

| answer | it belongs to | examples                                                               |
| ------ | ------------- | ---------------------------------------------------------------------- |
| yes    | the **rid**   | description and alt text, category, tags, source and credit, licence   |
| no     | the **cid**   | dimensions, thumbhash, colour space, camera data, the derived variants |

The split is not tidiness; it is what makes replacing bytes free. `media.yaml` holds 42 paid
descriptions in nine languages today, keyed by an original's cid, so a better scan of any of them
costs either a careful migration or the money a second time. Held against the rid, a better scan
costs nothing, because the rid did not change -- which is the argument
[architecture/resource.md](../architecture/resource.md) already made when it granted ids in the
first place. What stays on the cid is what a new original invalidates anyway and what any run can
recompute.

Both layers are structured the way the type chain already is: a segment declares that its layer is
present and parseable, and a consumer binds to the shallowest segment that answers its question.

### Deleting removes one thing, and never what it pointed at

**Nothing cascades.** Deleting a rid deletes that rid. The contents it resolved to are untouched,
and so is everything else naming them.

What decides whether an object may go is a **reference table, not a counter**: one row per
reference, so "what still names this" is a query with an answer somebody can read rather than an
integer somebody maintained. A hand-kept count drifts by exactly one on any path that forgets it,
and the drift is permanent and silent in both directions -- too high leaks bytes forever, too low
deletes something that is still on a page. The table also makes a dry run explanatory: it says
which article, revision or record is holding the thing alive.

References resolve in two hops -- an article names a rid, the rid resolves to a cid -- and the row
is recorded on the second hop, so repointing a rid moves the reference with it.

**Unreferenced is not deleted.** An object nothing names becomes collectable 24 hours later, and
collection happens only when a sweep is run: a scheduled task in the cloud, and by hand locally.
Nothing disappears as a side effect of an edit.

### An article is `document.article`, and its state is counted rather than declared

**A draft is an article with no revisions, and publishing is writing the first one.** Nothing
carries a flag: the state is a row count, so the contradiction the corpus holds today -- three
articles marked `draft` while carrying a publication date -- cannot be spelled. `article` rather
than `document` because a document will be other things later, and the layer that answers "when
was this published" belongs to the narrower one.

**Every date is mechanical except the one a reader is shown.** The resource's `created` is when
that identity was granted here and its `updated` is its last change; both are written by the
machine and by nothing else. What a reader sees as the publication is the first revision's moment
and what they would see as an update is the latest one's, so neither is stored a second time.

**A revision's moment may be corrected, once and then never.** An article imported from somewhere
it was already published was published before it arrived, and the honest answer to "when was this
published" is that earlier date -- so `at` is editable, and a one-way lock taken by hand settles
it. Default unlocked; nothing takes the lock automatically.

**An id may be reserved before its thing is one.** A draft has an identity from the first
keystroke and a type only once somebody has decided what they are writing, so `type` is null until
then. That is resource.md's own rule about leaves, applied to the first segment.

**Metadata is not part of the text.** The path, the description, the dates and the lock are
attributes of the article, and the only reason they live in the source is that no record holds
them. The record that holds them also names the file the text is in, so it is the binding between
a rid and its source as well -- one answer to two questions.

**A rid is one space with one resolver.** An article, a picture and later an album are all granted
ids from the same five characters of base36, and the `type` chain says which kind a given one is.
Asking for an article by a rid that names a picture is a caller error, not an absence -- a
malformed id and a wrong kind are both 400, and only an id nothing holds is 404.

## Names

| name         | what it is                                                                           |
| ------------ | ------------------------------------------------------------------------------------ |
| `collection` | the authored data itself: text, original bytes, derived cache, the authored database |
| `local`      | the service that owns it -- the only writer, a Rust facade with a TypeScript half    |
| `cms`        | from here on, only the management surface: the editor, images, albums, reader data   |
| `api`        | the public worker, which answers for reader state and carries no authored endpoint   |
| the archive  | the Tauri client's source, at `canmi21/desktop-cms-archive` and built by nothing     |

`collection` rather than `content` because [architecture/resource.md](../architecture/resource.md)
already settled that only one thing here may be spelled "content", and that thing is the bytes a
cid identifies. A store called `content` makes "content id" read as "the id of something in the
store", which is the exact confusion that file exists to end. `library` was rejected for colliding
with `lib` on sight.

**`local` is two runtimes and one boundary.** Rust keeps what it already does well -- bytes,
derivation, the model calls, publishing -- and a TypeScript half owns the authored database, so
that its schema is the Drizzle one and there is never a second definition of it to drift. The Rust
side is the door: it answers what it can and forwards the rest. The TypeScript half is written
against a driver-agnostic Drizzle instance, because the same code runs over a local SQLite file now
and over D1 when the surface goes online, and a driver welded into the queries is the thing that
would make that a rewrite.

**The authored endpoints never live in `api`, and are never merely filtered out of it.** An
endpoint that writes the corpus and is disabled by a runtime flag is one misread environment away
from being public. `local` has to exist regardless -- workerd cannot reach the filesystem, run a
model CLI, or handle a 200MB original -- so the only question was where the metadata endpoints go,
and they go where the authored data's single writer is. What the two share is libraries, not a
deployment.

## What the tree actually holds today

Measured, because the surrounding documents describe a target and read as though it had been
reached.

**The ids were granted and the keying was not finished.** All 53 records in
`data/record/metadata.json` carry a `resource` and a parsed `type` chain, and the rids are unique.
But 45 of them are still filed under a 32-character cid while 8 icons are filed under their rid --
two keying conventions in one map, which is what `alt.rs` already blames for a join that read a rid
as a cid. `local migrate` reports nothing to do, because every record does hold an id; the key was
never its test.

**No article is a resource yet.** The catalogue's media rows match the tree exactly -- 17
`media.image`, 16 screenshots, 8 icons, 6 photographs, 3 frames, 3 clips -- and the three
`document` rows describe nothing that exists.

**Two curated records are being written outside git.** The commit that moved the records into one
directory changed the doc comments in `media.rs` and `tags.rs` and not the code: `path_for` still
returns `data/media.yaml` and `data/tags.yaml`, which `.gitignore` excludes. So `data/record/*`
holds 46 records with 42 paid descriptions, last written on the 14th, while the files the commands
actually read hold 38 records of newer categories and tags, no descriptions at all, and no history.
Running `local alt` against that file would buy all 42 descriptions a second time.

**Re-keying `metadata.json` is deliberately not a milestone.** The site never reads its top-level
key -- `readAssets` walks the map and indexes by the `resource` field inside each record -- and the
file retires into the authored database anyway. Restyling a file on its way out buys nothing.

## A. The data model

Everything else waits on this group. Each row is a change to what is stored, not to what anybody
sees.

| id  | milestone                         | what it is                                                                                                           | after | horizon  |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| A0  | The curated records are salvaged  | One trustworthy `media.yaml` and `tags.yaml` out of the two divergent copies, and the path bug closed                | --    | **done** |
| A1  | The authored database exists      | Resources, contents, the two metadata layers and the reference table, under one Drizzle schema                       | --    | **done** |
| A2  | The records are imported          | What the YAML and JSON records hold moves in; the files retire                                                       | A0 A1 | **done** |
| A3  | An article is a resource          | `document.article`, granted from the same space and the same register                                                | A1    | **done** |
| A4  | Revisions and history             | Every save writes an immutable revision; a head per article; dates derived from them                                 | A1 A3 | **done** |
| A5  | Article metadata leaves the text  | Path, description, publication, last-modified and its lock become rows; frontmatter empties                          | A3 A4 | near     |
| A6  | Reference counting, and the sweep | The reference table decides reachability; 24 hours of grace; an explicit GC, by hand here and scheduled in the cloud | A2    | near     |
| A7  | One rid over every language       | The existing views and translations move under the article's own identity                                            | A3 A5 | mid      |
| A8  | Reader state keyed by rid         | Counters, subscriptions and later comments re-keyed once, by the fold rule in engagement.md                          | A3    | mid      |

**A0 is a salvage, not a repair.** The file it fixes is retiring at A2, so nothing here is worth
maintaining afterwards -- what matters is that the import has one input that has lost nothing. The
newer copy holds five days of categories and tags; the committed one holds the 42 descriptions.
Importing either one alone loses the other, and this is the only moment the choice exists.

**A5 must not land before there is a surface that can edit what it moves.** The frontmatter is
editable in any text editor; a row in SQLite is not. So A5 ships with B4, or with a stopgap command
that sets a field. This is the one place in this plan where the obvious order blocks the author.

**A4 came early for the same reason.** A text file under git has a history whether or not anybody
designed one; a database file has none. Revisions are the undo, and they have to exist before the
thing they are undoing does.

**A4 settled three things the editor would otherwise have had to guess.** Publishing takes no text:
the draft row is the working copy before the first publication and after every one, so there is one
place the text can be and no second place it could differ from. Publishing text that is already
published is refused rather than recorded, because a revision says what a version's text is and not
how many times a button was pressed -- which also means that changing a title is not a publication.
And bytes live beside the database rather than in it: `content` says a run of bytes exists and what
is known about it, and `data/collection/objects` holds the bytes, written before the row that names
them so that the failure a crash leaves behind is an uncollected object rather than a broken page.

That tree is not `data/bucket/objects`. The published one holds what compilation emitted and can
emit again; this one holds authored input, and is the reason C0 exists.

A8 is deliberately not near-term. [engagement.md](../engagement.md) records what a re-key already
cost once -- six stranded rows in the fifty-four minutes between a migration and the code that
wanted it -- and the rule it produced is that such a migration folds rather than skips and runs
twice. That is a piece of work with its own rehearsal, and it does not belong inside a week that is
also moving the corpus.

## B. The surface

**A row reads `done` when nothing in it is waiting on a decision.** This file is a plan and not a
status board, so the column says which step the work is standing on rather than how far along
anything is; a step that turned out to be wrong is rewritten rather than marked.

This is the group that ends the pain. B3 is the point of the whole plan; everything above it is
what B3 would otherwise have to invent.

| id  | milestone                      | what it is                                                                                        | after    | horizon  |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------- | -------- | -------- |
| B1  | `local`, and its two halves    | The rename, an HTTP shell beside the CLI, and the TypeScript half that owns the authored database | --       | **done** |
| B2  | The desktop client is archived | Source moved to a repository of its own, out of the workspace and out of `check`                  | B1       | **done** |
| B3  | The editor                     | A web client against `local`: write, preview in the site's own components, create gets a rid      | A3 A4 B1 | near     |
| B3a | Preview moves into the CMS     | A route that reads a draft the way the site would; the draft root retires with it                 | B3       | **done** |
| B4  | Metadata has a surface         | Path, description, publication, the lock -- editable where the article is                         | A5 B3    | near     |
| B5  | Images are managed             | Upload and replace: new bytes, a new content, the rid repointed, derivation triggered             | A6 B3    | near     |
| B6  | Publishing from the CMS        | Publication stops being only a mise task; see [cms.md](cms.md)                                    | B3       | mid      |
| B7  | Albums                         | The surface photography needs before any of it is worth importing                                 | B4 B5    | mid      |
| B8  | Reader data has a surface      | Comment moderation and counter repair, over the public API with a local token                     | A8       | mid      |

**The editor is configured by reading the site.** Both are SvelteKit over the same components,
and every difference found so far was the site already knowing something: how StyleX's sheet
arrives in development, that the renderer has to be aliased to its source, that a Tailwind
utility written beside StyleX needs the consumer to run Tailwind. D3 and D4 make the two one
router, so configuration that already agrees is configuration nobody has to reconcile then. See
[../architecture/workspace.md](../architecture/workspace.md).

**B3a is what lets the draft root go, and the draft root is five things.** `publish.ts` builds a
second root naming all nine articles where the public one names six; the API's development
environment binds that directory as its assets, with a symlink beside it because wrangler binds
exactly one directory; `local gc --segments` reads both roots; and `sync` refuses a source that
contains the draft tree. None of it stores anything -- a draft's bytes are in the objects tree
like everything else -- so it is a name table whose only purpose is that the development site can
read what is not published. Once the CMS renders a draft the way the site would, that purpose is
served better where the browser already is, and all five go.

B1 is the decision that keeps the later ones cheap. The editor is a web client from its first day,
talking to an HTTP API that happens to be on this machine -- so D4, which puts the same surface
online, is a change of host and an added credential rather than a rewrite. It is also why the
operations stay below both shells: a second implementation behind a GUI is what would make moving
it a rewrite.

## C. Storage and the boundary between roles

This group is what makes "nothing I do while developing can damage what I have written" true by
construction rather than by care.

| id  | milestone                              | what it is                                                                                | after | horizon |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------- | ----- | ------- |
| C1  | The collection leaves the repository   | It lives on its own, and `local` is the only process that may write it                    | B1    | mid     |
| C0  | What cannot be recomputed is backed up | A real backup of the authored database, the id register and the paid outputs              | A1    | mid     |
| C2  | Development gets copies                | Published objects read from the live CDN, reader state dumped once; no full copy, ever    | C1    | mid     |
| C3  | The corpus leaves git                  | History and backup become the CMS's; cannot start before C0                               | A4 C0 | mid     |
| C4  | A measuring step at publication        | A controlled headless browser answers what only a browser knows, and the answer is stored | B6    | mid     |
| C5  | The data directory retires             | Nothing under `data/` is tracked, because nothing there is git's to keep                  | C3    | mid     |

**C0 waits on nothing but the database existing.** It was ordered after C1 while C1 was assumed to
come first; a backup does not need the collection to have moved, and the things it protects are
already written. C1 is the one deferred, so C0 stops waiting on it.

**C0 is ordered before C3 and the order is the point.** Git is what currently backs up the things
no run can reproduce: the id register, whose entries are identities other records point at, and the
paid descriptions. Losing them is not a rebuild, it is a re-purchase or a permanent loss of
identity. So the backup exists before the corpus stops being committed, not after. A0 is the
evidence that this is not hypothetical -- five days of curation are already outside git today.

**C5 is the end of this group and the measure of whether the rest worked.** `data/` is tracked in
36 files today, and each one is tracked for a reason that some milestone above removes:

| what                                                                             | files | what has to happen first                                       |
| -------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| `record/media.yaml`, `record/tags.yaml`, `record/metadata.json`                  | 3     | imported already; the readers move to the collection           |
| `record/diagram.json`, `fonts.json`, `indexnow.json`, `licenses.yaml`, `tn.yaml` | 5     | each is decided: a row in the collection, or a file that stays |
| `build/*.json`                                                                   | 4     | derived, but fetched over a network; they become derived rows  |
| `source/brand/*`                                                                 | 6     | **bytes nothing can recompute**; they need C0 before anything  |
| `source/favicon/*`                                                               | 14    | bytes, refetchable, and cheaper to back up than to refetch     |
| `bucket/*/.gitkeep`                                                              | 3     | the skeleton, which goes when the tree it marks does           |

The site's own marks are the row that decides the order: losing them is not a rebuild, so the
directory cannot leave git before the backup exists. That is C0, and this is what makes C0's
position in this group a fact about twenty files rather than a principle.

C2 is why the collection growing to a terabyte is not a problem that has to be solved later.
Published objects are immutable and already served, so development reads them where they are; the
only thing that must be copied is the reader state, which is a few megabytes of relational data.
Nothing about this arrangement changes as the photography lands.

C4 is where [site.md](site.md)'s wrap-policy entry is answered, and it generalises: a paragraph's
line breaking, a diagram's layout and anything else whose answer exists only inside a real browser
is decided once, under a fixed column and a known font, and written into the published object. A
measurement taken in whatever browser happens to be editing would record that device instead.

## D. Long term

| id  | milestone                                  | what it is                                                                                  | after | horizon |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | ----- | ------- |
| D1  | The model quota becomes an API             | A machine that is always on, wrapping the local CLI as an OpenAI-shaped API behind a tunnel | --    | long    |
| D2  | The collection and the pipeline move there | Storage growth and the locality of model calls stop being two problems                      | C1 D1 | long    |
| D3  | Accounts                                   | The one requirement that cannot be avoided by staying on one machine                        | --    | long    |
| D4  | The CMS goes online                        | A host change, a D1 binding and a credential; by B1's shape, the editor does not change     | D2 D3 | long    |

D1 depends on nothing and may be taken at any point. It is filed as long-term because nothing is
blocked on it today, and that changes the moment B3 through B7 make publishing cheap enough that
the volume goes up.

## Open questions

Each of these is a decision rather than a discovery. One is settled and kept here because the
milestone it shaped has not been taken yet; a question the work has answered is removed instead.

**The editor holds unsaved keystrokes in `localStorage`, and that is decided.** A save writes the
draft row; everything before it is the browser's, keyed by rid so two tabs on two articles do not
share a buffer. What is left is a detail of B3 rather than a question blocking it: whether a
warning on closing an unsaved tab is enough, or a recovered buffer is offered against the row.

**How a fixed page is edited, if at all.** The homepage is imported and has no way in afterwards,
which is accepted for now: it has one permanent address rather than a chosen one, it belongs to no
collection, and what a reader sees there is its text plus components the site's router adds. That
makes it a different shape from an article rather than a simpler one, and it is worth designing
once the editor has settled rather than guessing alongside it. Blocks nothing; revisit after B4.

**The authored database stays one file, and the collection stays where it is for now.** Two files
exist and that split is settled: `source.sqlite` is what a person wrote, `derived.sqlite` is what
a scan can write again, and the backup boundary is visible in the filesystem. `source.sqlite` is
not split further -- one file is one lock, one backup and joins that work, and the alternative
buys a smaller careful-backup at the cost of every join across the line.

Moving the collection out of the working tree was argued for here on a reason that turned out to
be false: version control cannot reach it, because it is ignored, and an abandoned change leaves
it untouched -- measured, not assumed. `clean` is barred from local state by its own rule. What is
actually left for C1 is growth and D2's move to another machine, neither of which presses today.

**What `local` is called once it is not local.** The name describes where it runs, and D2 moves it
to another machine while D4 puts its surface on the public internet. It is the right name for the
year it is true and a lie afterwards, so the rename belongs in D2 rather than being avoided now.
