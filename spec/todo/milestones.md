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

| concept     | what it identifies                                                       | lifecycle                                                                              |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **cid**     | a run of bytes                                                           | decided by the bytes; held by a reference count, collectable 24h after it reaches zero |
| **rid**     | a thing, as an overlay that resolves to whichever cid currently means it | granted; may be created empty and filled in later; deleting one changes no cid         |
| **article** | one rid, its content in each language, and its metadata                  | content and metadata each version independently; the rid does not move                 |

Six consequences, each of which some milestone below exists to deliver. They are stated here rather
than in the rows because every row assumes all six.

**A date is derived from a revision, not typed by a person.** Created is the first revision and
last-modified is the latest. An article's frontmatter states them today because there was nowhere
else to put them, which is the same reason it states everything else it states.

**An unpublished article is one with no publication date**, rather than one carrying a flag. If
that holds, `draft: true` has nothing left to say; whether it goes is an open question below,
because the flag is also what the mirror and the sweep read.

**Last-modified can be locked, and a locked one is allowed to lie.** A style migration that touches
a paragraph to keep it rendering is not an edit to the article, and a reader told otherwise is told
something false. So the lock is explicit, and what it buys is that the honest field stays honest
the rest of the time.

**Metadata is not part of the text.** The path, the description, the dates and the lock are
attributes of the article, and the only reason they live in the source is that no record holds
them. The record that holds them also names the file the text is in, so it is the binding between
a rid and its source as well -- one answer to two questions.

**A reference count replaces the unnamed sweep.** An object is reachable while something names it
and collectable 24 hours after nothing does. Counting makes deleting a rid a safe, ordinary
operation instead of a question about what else might be pointing at the same bytes.

**A rid is one space with one resolver.** An article, a picture and later an album are all granted
ids from the same five characters of base36, and the `type` chain says which kind a given one is.
Asking for an article by a rid that names a picture is a caller error, not an absence -- a
malformed id and a wrong kind are both 400, and only an id nothing holds is 404.

## Names

| name                   | what it is                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `collection`           | the authored data itself: text, original bytes, derived cache, the authored database |
| `local`                | the service that owns it -- the only writer, a Rust facade with a TypeScript half    |
| `cms`                  | from here on, only the management surface: the editor, images, albums, reader data   |
| `api`                  | the public worker, which answers for reader state and carries no authored endpoint   |
| `archive/desktop-cms/` | the Tauri client's source, kept as reference and built by nothing                    |

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

## Two facts this plan starts from

**The rid mechanism is written and has never been applied.** `resource.rs` allocates, checks a
register and refuses ugly stems; `cms migrate` grants ids, rewrites article references and moves
published records onto their new keys, dry by default. And `data/record/media.yaml` still holds 46
records keyed by a 32-character cid and not one rid. The catalogue in resource.md describes the
corpus after that pass, which is why its counts do not match the tree.

**Miniflare's state directory is not a home for authored data.** `mise run clean` already protects
it -- the workspace's task calls `.wrangler/state` "data somebody entered, not output somebody
built" -- but the path is version-scoped, `wrangler dev` can be pointed elsewhere, and nothing
backs it up. It stays what it is: the development copy of reader state. The authored database is a
plain SQLite file inside the collection, and `local` is the only process that opens it for writing.

## A. The data model

Everything else waits on this group. Each row is a change to what is stored, not to what anybody
sees.

| id  | milestone                   | what it is                                                                                     | after | horizon |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------- | ----- | ------- |
| A0  | Media takes its ids         | `cms migrate`, reviewed dry and then applied: the corpus stops being keyed by cids             | --    | near    |
| A1  | An article has a rid        | An article becomes a `document.post` resource, from the same space and the same register       | A0    | near    |
| A3  | Revisions and history       | Every save writes an immutable revision; a head per article; dates derived from them           | A1    | near    |
| A2  | Metadata leaves the text    | The authored database holds path, description, publication, last-modified and its lock         | A1 A3 | near    |
| A4  | Reference counting, and 24h | Counts on cids; collection 24 hours after zero, replacing the two-pass unnamed sweep           | A2    | near    |
| A6  | Path history, and redirects | A former path is kept, so a redirect is a fact in the record rather than something to remember | A2    | near    |
| A5  | One rid over every language | The existing views and translations move under the article's own identity                      | A1 A2 | mid     |
| A7  | Reader state keyed by rid   | Counters, subscriptions and later comments re-keyed once, by the fold rule in engagement.md    | A1    | mid     |

**A2 must not land before there is a surface that can edit what it moves.** The frontmatter is
editable in any text editor; a row in SQLite is not. The moment the description and the path leave
the source file, the only way to change them is a tool, so A2 ships with B4 or with a stopgap
command that sets a field. This is the one place in this plan where the obvious order blocks the
author.

**A3 is near-term for the same reason.** A text file under git has a history whether or not
anybody designed one; a database file has none. Revisions are the undo, and they have to exist
before the thing they are undoing does.

A7 is deliberately not near-term. [engagement.md](../engagement.md) records what a re-key already
cost once -- six stranded rows in the fifty-four minutes between a migration and the code that
wanted it -- and the rule it produced is that such a migration folds rather than skips and runs
twice. That is a piece of work with its own rehearsal, and it does not belong inside a week that is
also moving the corpus.

## B. The surface

This is the group that ends the pain. B3 is the point of the whole plan; everything above it is
what B3 would otherwise have to invent.

| id  | milestone                      | what it is                                                                                        | after    | horizon |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------- | -------- | ------- |
| B1  | `local`, and its two halves    | The rename, an HTTP shell beside the CLI, and the TypeScript half that owns the authored database | --       | near    |
| B2  | The desktop client is archived | Source moved under `archive/`, out of the Cargo workspace and out of `check`                      | B1       | near    |
| B3  | The editor                     | A web client against `local`: write, preview in the site's own components, create gets a rid      | A1 A3 B1 | near    |
| B4  | Metadata has a surface         | Path, description, publication, the lock -- editable where the article is                         | A2 B3    | near    |
| B5  | Images are managed             | Upload and replace: new bytes, the rid repointed, derivation triggered                            | A4 B3    | near    |
| B6  | Publishing from the CMS        | Publication stops being only a mise task; see [cms.md](cms.md)                                    | B3       | mid     |
| B7  | Albums                         | The surface photography needs before any of it is worth importing                                 | B4 B5    | mid     |
| B8  | Reader data has a surface      | Comment moderation and counter repair, over the public API with a local token                     | A7       | mid     |

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
| C0  | What cannot be recomputed is backed up | A real backup of the authored database, the id register and the paid outputs              | C1    | mid     |
| C2  | Development gets copies                | Published objects read from the live CDN, reader state dumped once; no full copy, ever    | C1    | mid     |
| C3  | The corpus leaves git                  | History and backup become the CMS's; cannot start before C0                               | A3 C0 | mid     |
| C4  | A measuring step at publication        | A controlled headless browser answers what only a browser knows, and the answer is stored | B6    | mid     |

**C0 is ordered before C3 and the order is the point.** Git is what currently backs up the things
no run can reproduce: the id register, whose entries are identities other records point at, and
`media.yaml`, whose 315KB are nine languages of description that were paid for once. Losing them
is not a rebuild, it is a re-purchase or a permanent loss of identity. So the backup exists before
the corpus stops being committed, not after.

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

Each of these blocks a specific milestone and is a decision rather than a discovery.

**Whether `draft: true` survives as anything.** An empty publication date already says
unpublished, but the flag is what the mirror and the sweep read today, so retiring it is a change
to those as well. Blocks A2.

**Where the collection lives, and whether its database is one file or several.** One file is one
lock and one backup; several are a smaller blast radius and a harder join. Blocks C1.

**What `local` is called once it is not local.** The name describes where it runs, and D2 moves it
to another machine while D4 puts its surface on the public internet. It is the right name for the
year it is true and a lie afterwards, so the rename belongs in D2 rather than being avoided now.
