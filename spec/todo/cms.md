# Deferred: the CMS

Where the authoring side is not what it should be -- what the CMS cannot offer, and what a
published resource cannot be reached by.

The rules over an entry are the index's; see [todo.md](todo.md).

## Publishing is a mise task and cannot become a CMS button

[architecture/local.md](../architecture/local.md) draws the line plainly: a view that has found
outstanding work shows the command that closes it, and that command becomes a button only once
the operation has moved below both shells and the task substrate can report its progress and
refuse a second copy. `publish` is `mise run publish lattice` and lives below neither shell, so the
CMS may name it and may not run it.

It is exactly the class that rule was written for. It runs for as long as the corpus takes to
compile, it writes into `data/` and then across the network, and two copies racing over one tree
is the failure the substrate exists to refuse. It differs from the paid sweeps in only one way:
it spends time rather than money, which makes an accidental second run cheaper, not safe.

**What deciding it would cost.** Moving it means an in-process application operation in Rust with
a TypeScript compile behind it, which is the subprocess boundary
[i18n/segments.md](../i18n/segments.md) already accepts in the other direction and cms.md has not
ruled on in this one. The entry above, on where the compiler lives, is the same question arriving
from the other side -- and answering either one first mostly decides the other. Neither is worth
taking while the publish path is still new enough that its shape may move.

## A clip is the one resource reference the compiler still resolves into bytes

[architecture/resource.md](../architecture/resource.md), "A rid is resolved three times", says a
compile may bake the article's own shape and nothing derived from a resource's current content.
Two of the three references that name a resource now obey it: `::linkcard`'s mark and `::image`'s
picture compile to a rid under `resources` and are resolved per render. `::video` does not. Its
block carries `src` as a rid and then, beside it, `rungs` with absolute CDN URLs, `poster` as
another, `preview`, `width`, `height`, `gain` and `captions` -- every one of them a fact about what
the clip currently holds. Measured on `hindsight/except-me`: 15 image blocks contribute 15 rids to
`namedResources` and its 3 video blocks contribute none, because a `video` block has no `resources`
key for the collector to read.

The consequence is the one that paragraph exists to name: re-encoding a clip rewrites the `rungs`
inside every content object that plays it, so the object's id moves and the article is republished
for a change the article did not make. It is also the reason an editor that runs online cannot yet
write a clip reference -- the write would need a recompile to take effect.

**What deciding it would cost.** The record side is ready: `media.video.clip` is in the catalogue
with its rungs and caption tracks, and `media.image.frame` already points at its clip through
`source`. What is not settled is which of a clip's several references are roles on one block --
the clip and its poster frame are two resources, and `namedResources` reads a map, so
`{ clip, poster }` is the shape it is waiting for -- and whether the player's fallback for a
reference nothing has imported survives the move, since today that fallback is "the resolved
fields are absent" and after it would be "the record is absent". Both are decisions about the
player rather than about the resolution path, which is why the two loops that built that path
stopped at the edge of them.

## The segment layer waits for its redesign

[i18n/segments.md](../i18n/segments.md) keyed a translation to the hash of a block's canonical text,
and stored every article canonical so the hash would hold. Both are retired: an identity taken from
a hash of text moves whenever the text is respelled, and the editor now saves what the author wrote.
Nothing replaces them yet, so no new article is translated and no existing one gains a locale. It
does not block the editor or writing in the source language.

**What is known of the replacement**, from the user and not yet designed: segments are defined by
structural equivalence -- what a block is, how many lines it exports and what its text is -- rather
than by bytes. Before anything moves, three things are exported from the current sidecars: every
translated text on its own, the same text joined back into articles, and the metadata as JSON, so
the redesign starts from a copy it cannot damage. The i18n structure itself may change with it.

**What deciding it would cost.** The export is mechanical. The redesign is not: every sidecar was
written against canonical hashes, so moving them is a migration, and `validate.rs` and the runners
read the old shape.
