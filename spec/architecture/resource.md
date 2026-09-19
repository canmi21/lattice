# A resource, and the two ids that are not the same id

Everything this site publishes is bytes under a hash. That answers "are these the same bytes"
and nothing else, and for a long time it was also made to answer "is this the same thing" --
which it cannot. This file is the separation of those two questions, the record shape that falls
out of it, and the catalogue of what is a resource here.

## Two ids

| | what it identifies | who decides it | where it appears |
| --- | --- | --- | --- |
| **content id**, `cid` | a run of bytes | the bytes | object keys, CDN addresses |
| **resource id**, `rid` | a thing | we allocate it | article source, record keys |

**A cid is derived and a rid is granted.** Two files with the same bytes have one cid whether or
not anybody meant them to; two pictures of the same subject have two rids whether or not the
bytes ever coincide. Nothing converts one into the other.

Only one of these two words may be spelled "content". The confusion this file exists to end was
`meta/{cid}.json`: a key that ended in a hash, and therefore read as content-addressed, holding a
record that is rewritten whenever the asset it describes is re-derived. The cache policy read the
shape and granted a year. See [data.md](data.md), "One bucket holds records and the other holds
bytes".

### What the conflation cost

The asset manifest was keyed by **the original's cid**, and the record said so twice -- once as
the key and once in a `blake3` field holding the same value. Three things followed:

- **Re-scanning a photograph made a different thing.** Better bytes for the same subject is a new
  cid, so it was a new asset, and every article naming the old one had to be rewritten.
- **The identity belonged to bytes nobody can fetch.** Originals are never published; only the
  derived variants are. The name of the resource was the hash of a file that is not in the bucket.
- **The record could not honestly be a name or a hash.** It was keyed like an object and rewritten
  like a name.

A rid fixes all three at once, and the structure needed no rearranging to accept it: the manifest
was already a two-layer thing -- one entry, several stored variants -- and only the *source of the
entry's key* changes.

## A rid is five characters of base36

Lowercase `0-9a-z`, five of them: `k7m2x`. 60,466,176 of them.

**Collisions here are not a probability, because we allocate.** A cid is long because nothing
coordinates the hashing of unrelated bytes; a rid is checked against the register before it is
handed out, so the length is chosen for the address space and for a human reading article source,
not for a birthday bound. Five is far more than this corpus will use and short enough to read.

The register is the resource table itself, which means allocation reads it and therefore takes the
lock that table already has. No new machinery. See [../tasks.md](../tasks.md).

**Allocation skips ids that read as words.** A rid appears in article source, so a short deny-list
is consulted at allocation, where it costs one comparison. Changing a rid afterwards is a breaking
change, which is the reason to spend the comparison now.

**A rid is never in a public address.** The CDN serves `/{type}/{cid}.{ext}` and nothing else, so
everything content addressing buys -- a year, `immutable`, no invalidation -- is untouched by any
of this. A rid is resolved to cids before a reader is told anything.

## The record

```jsonc
{
  "version": 5,
  "resource": "k7m2x",
  "type": "media.image.photo",
  "created": "2026-09-14T02:55:32.15685Z",
  "updated": "2026-09-14T02:55:32.15685Z",
  "layers": {
    "media": { "version": 1, "origin": [ … ] },
    "image": { "version": 1, "dimension": { … }, "variants": [ … ] },
    "photo": { "version": 1, "camera": { … } }
  }
}
```

Five fields and a container. `version` is the envelope's; every layer carries its own.

**The envelope version moves when a key in the envelope moves.** Adding a type, adding a layer,
changing what a layer holds -- none of those touch these five names, so none of them is a 5. A
layer that changes shape raises its own number and the envelope does not notice. That is the
whole reason the numbers are per layer: a version that rises for reasons unrelated to what a
reader parses teaches the reader to ignore it.

## `type` is a namespace, and every segment does three jobs

`media.image.photo` is read left to right, and each segment:

1. **Selects a parser.** The segment is a key in the schema register.
2. **Locates data.** The same segment is a key in `layers`.
3. **Is a promise.** A segment present in `type` guarantees `layers.<segment>` exists and parses
   under that segment's schema.

The third is why this is worth doing. **A consumer binds to the shallowest segment that answers
its question.** Something that draws a thumbnail depends on `media.image` and reads dimensions; it
never learns that `photo` and `screenshot` exist, and a fourth kind added under `image` tomorrow
costs it nothing. Something that renders camera data binds to `photo` and is the only thing that
has to know what a photograph is.

That is ordinary subtyping, spelled in data: the chain declares "I am a media, specifically an
image, specifically a photograph", and `layers` holds what each of those claims brings with it.

**The chain may be short.** Seventeen pictures in this corpus have no metadata field at all, which
[media.md](media.md) distinguishes from an empty one: extraction never ran, and the originals are
outside git and may be gone. They are `media.image` and stop there. A thing that cannot be
classified is not classified -- a wrong leaf is worse than a missing one, and the leaf can be
added the day extraction runs.

**`layers` must hold exactly what `type` declares.** A layer present in `layers` and absent from
`type` is unreachable data and is an error. The reverse -- declared but unparseable here -- is the
forward case below.

## Parsing is optimistic, not compatible

Strict forward compatibility would be machinery bought for one window: both sides of a change are
pushed together, and the only skew is that the API's build may finish minutes before the site's.
Minutes do not justify a compatibility contract. What they justify is not falling over.

| the record has | a reader does |
| --- | --- |
| a field it does not know | ignores it |
| lost a field it knew | proceeds without it |
| a `type` segment it does not know | stops there, keeps what it parsed |
| a layer `version` above what it knows | treats that layer as unknown, stops there |
| no segment the reader needed | **errors** |

The last row is the one that is strict, and the difference is worth stating: the first four are "I
do not know about this", which is survivable; the last is "this is not the thing you asked for",
which is not. Asking for a picture and receiving a resource with no `media` segment is a caller
error or a corrupt record, and answering it with a blank is how a missing image becomes a missing
image nobody reports.

## Content binds at the layer that has it

There is no fixed home for "the cids this resource owns", and there does not need to be. **A
resource binds content at the first layer where content is a fact.** An image's chain reaches
`image` and there it has a concrete mime and concrete variants, so the variants live there. A
frame extracted from a clip is one file, so `frame` binds one.

This falls out of the same rule every layer follows -- declare your own minimum -- and it avoids
the alternative, which is an `objects` map at the envelope holding entries whose meaning only a
deeper layer can explain.

## `source` and `origin` are different questions

| | points at | answers |
| --- | --- | --- |
| `source` | a **resource**, by rid | where this came from, as a thing we also hold |
| `origin` | anything that helps | what it was derived from, including bytes we do not hold |

An image's `origin` is the original file: its cid, its mime, its size. The bytes are not published
and may no longer exist anywhere; the cid is kept so that the next import of the same file is
recognised and skipped. It is a **list**, because re-scanning a subject adds an origin to a
resource rather than making a new one.

A frame's `source` is the clip it was cut from. A clip's `cover` is the frame. **Those point at
each other and that is not a cycle to remove**: one says "what is the cover", the other says "what
is this a frame of". Replace the cover and the old frame is still a frame of that clip.

**References resolve lazily, and nothing expands them on read.** A resource is one document, stored
and fetched whole. Anything that walks references -- a sweep computing what is reachable -- carries
its own visited set, because the graph has cycles by design.

## The catalogue

Nine leaf types, two branches. Counts are this corpus at the time of writing.

| type | count | what it is |
| --- | --- | --- |
| `media.image.photo` | 6 | camera data present |
| `media.image.screenshot` | 16 | extraction ran and found no camera |
| `media.image` | 17 | extraction never ran; unclassified on purpose |
| `media.image.frame` | 3 | a still cut from a clip; `source` is the clip |
| `media.image.icon` | 8 | another site's mark, one resource per domain, light and dark |
| `media.image.mark` | 1 | this site's own mark: one thing, six files |
| `media.video.clip` | 3 | rungs and caption tracks |
| `document.post` | 6 | source, nine locales, nine cards |
| `document.page` | 1 | the same, without tags or dates |
| `document.notice` | 1 | the attribution text, rewritten whenever dependencies move |

**What earns a rid is being one thing made of several files, or being referred to from more than
one place.** A caption track is neither: it is a file belonging to one clip, and it binds under
that clip. The nine locale bodies of an article are the same -- they are what the article is made
of, not nine things.

**Licence texts are the case that fails the test and looks like it passes.** Four hundred and nine
of them are referenced by seven hundred packages, so they are reached from many places, but their
bytes never change: a cid is already their complete identity and a rid adds a level of indirection
that answers nothing. They stay plain objects. The aggregate notice is the opposite -- one name,
bytes that move whenever the dependency tree does -- and it is a resource.

**A new layer is justified when it brings fields, not when it brings a name.** A screenshot has a
scale and a photograph has a lens; that is a layer. If two kinds would hold the same fields and
differ only in what they are called, they are a value in the layer above, not a layer.

## The image layer answers in four steps

An icon can be a vector or a bitmap, which is why there is no `vector` layer: splitting on it
would push `icon` up above the split, away from everything else that is an image. The split is
answered by the interface instead.

Two facts, and only one of them is universal:

- **`dimension`** -- the intrinsic box. An SVG's `viewBox`, a bitmap's pixels, the largest frame in
  a multi-resolution `.ico`. Always present, and what layout and aspect ratio are computed from.
  Read the `viewBox` and never the `width` attribute: one icon here declares `width="100%"`.
- **`resolution`** -- actual pixels. Bitmaps only. **Absent is the answer**: a caller that asks and
  receives nothing has learned the thing is scalable, without a second field to consult.

Four steps, and each hides what the one below it has to know:

1. `width`, `height`, `aspect` -- always a value, no branch, no decision.
2. `enough(want)` -- whether this can serve a target. **The branch lives here**: a scalable mime is
   enough by definition, anything else compares pixels. A caller drawing a thumbnail never gets
   further than this line.
3. `resolution()`, `scalable()` -- pixels for the callers that genuinely reason in them, `null` for
   a vector.
4. `best(want)` -- the file to serve for a target size.

**The point is step two.** Everything that only needs to know whether a picture will do gets an
answer with no knowledge of formats, and the one place that knows which mimes scale is a line in
this layer rather than a condition repeated in every caller.
