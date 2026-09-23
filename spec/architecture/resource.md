# A resource, and the two ids that are not the same id

Everything this site publishes is bytes under a hash. That answers "are these the same bytes"
and nothing else, and for a long time it was also made to answer "is this the same thing" --
which it cannot. This file is the separation of those two questions, the record shape that falls
out of it, and the catalogue of what is a resource here.

## Two ids

|                        | what it identifies | who decides it | where it appears            |
| ---------------------- | ------------------ | -------------- | --------------------------- |
| **content id**, `cid`  | a run of bytes     | the bytes      | object keys, CDN addresses  |
| **resource id**, `rid` | a thing            | we allocate it | article source, record keys |

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
was already a two-layer thing -- one entry, several stored variants -- and only the _source of the
entry's key_ changes.

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

**A rid is never in a public address.** The CDN serves `/object/{cid}.{ext}` and
`/derive/{cid}.{ext}.{ext}` and nothing else, so
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

### A layer keyed by name, and the absent key that says something

`icon` is the first layer whose content is selected by a name rather than by a number, and the
shape is written down because it recurs: a mark asked for by role will want the same one.

```jsonc
"icon": {
  "version": 1,
  "domain": "github.com",
  "tones": {
    "light": { "content": "9fc87f…", "mime": "image/svg+xml", "bytes": 959 },
    "dark":  { "content": "df8ece…", "mime": "image/svg+xml", "bytes": 957 }
  }
}
```

Each tone is **described exactly as an image variant is**, because a file is a file and what a
reader needs to know of one does not change with the axis it was chosen by. What differs is the
container: `image.variants` is a list because size is ordered and a caller picks by comparing;
tone is not ordered, so this is a map and a caller picks by naming.

**A site with one mark carries one key, and the other is simply absent.** Six of the eight domains
here publish a single icon and carry it under both names; `sakura-ushio.icu` publishes one for
dark alone, and its record says so by having no `light`. That is the idiom `resolution` already
uses for a vector -- **absent is the answer**. A null would be a third state nobody can act on: a
reader cannot tell "this site has no light mark" from "nobody looked" by reading one, and both
sides would then need a rule for it. An icon naming no file at all is refused rather than stored,
a mark holding none being something that could only ever be answered with a blank.

**A named tone is that tone or nothing.** A caller that asked for dark and was handed light cannot
tell it happened, and would draw a light mark on a dark surface believing it had the right one;
nothing hands the choice back. With no tone named either will do, and light goes first because an
untinted mark is drawn for light backgrounds. That rule belonged to a worker resolving `?tone=`
per request; it is a selector beside the record now, written once on each side.

**`image.thumbhash` is optional for the same reason the tones are two.** Two tones are two
pictures, and one placeholder painted under both would be the wrong colour under one of them. A
field invented to satisfy a schema is a field a reader will eventually believe.

**The decoded copy is stored beside the hash, and the reason is not size.** The hash is the
canonical form and a page cannot paint it: turning one into pixels is a codec, and the side that
needs it is a universal load that runs in the Worker and again in the browser and must answer the
same in both. A codec reached through `node:fs` can exist in the first and never in the second, so
per-request decoding is not available on that half. One decode at import serves both. Measured on
this corpus: 167 characters median, about a tenth of a photograph's record and a fifth of a
screenshot's.

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

| the record has                        | a reader does                             |
| ------------------------------------- | ----------------------------------------- |
| a field it does not know              | ignores it                                |
| lost a field it knew                  | proceeds without it                       |
| a `type` segment it does not know     | stops there, keeps what it parsed         |
| a layer `version` above what it knows | treats that layer as unknown, stops there |
| no segment the reader needed          | **errors**                                |

The last row is the one that is strict, and the difference is worth stating: the first four are "I
do not know about this", which is survivable; the last is "this is not the thing you asked for",
which is not. Asking for a picture and receiving a resource with no `media` segment is a caller
error or a corrupt record, and answering it with a blank is how a missing image becomes a missing
image nobody reports.

## A bare id means whatever the resource says it means

`ill.li/{rid}` is the whole of what a resource id is for from outside: five characters that stand
for a thing, and a `302` to wherever that thing currently is. What it redirects to is declared,
not inferred -- **`canonical` on the record, and a resource declaring none is a `404`.**

Inferring would need a rule per type, and every one of them would be a judgement somebody
disagrees with: which size is _the_ picture, which rung is _the_ clip, which tone is _the_ icon.
Declaring moves that decision to publication, where the answer is known, and leaves the reader a
lookup.

**The value is a scheme and never an address.**

| written           | expands to                 |
| ----------------- | -------------------------- |
| `cid:{cid}.{ext}` | `{cdn}/object/{cid}.{ext}` |
| `slug:{x}`        | `{site}/{x}`               |

A URL here would put a hostname in every record, so moving a domain would mean rewriting all of
them; a scheme is expanded by whoever answers, from the one place a hostname is declared.
`libs/fonts` already publishes stylesheets carrying `__CDN_URL__` for the same reason, which is
this idea before it had a name. `slug:` needs no lookup either: the site resolves a bare name to
the article's real path itself, so a moved article keeps its short link.

**What is declared is the largest rendition**, for a picture and a clip alike, tie-broken on byte
size and then on the content id so the answer does not depend on map order. Compatibility is
deliberately not weighed -- a `<picture>` handles that on the site, and a link somebody shares
should hand over the best there is. A variant carrying no resolution is not a candidate, because
it can only be a vector and the extension table would name one `.avif`: an address to a file
nobody wrote is worse than the refusal.

Measured on this corpus: 45 resources, 40 naming an AVIF, 3 a clip's top rung, 2 a PNG that is
the whole ladder for a flat-colour original. No resource failed to declare one, and no tie
occurred, so both tie-breaks exist only under test.

## A rid is resolved three times, and each stage bakes only what it can know

A compiled article names resources and stops. It does not name bytes. Turning a rid into the
files behind it happens later, twice, and the same answer serves both.

| stage   | what it may bake                                                                  | what it must not                                                 |
| ------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| compile | the article's own shape: markdown to components, a rid where a resource is named  | anything derived from a resource's current content               |
| SSR     | the record for every rid on the page, its placeholder inlined and its files named | a choice only the browser can make, such as which width to fetch |
| CSR     | the same record, asked for again after hydration                                  | nothing it did not already ask for                               |

**The rule is one sentence: a stage bakes what it can determine and passes the rest on.** Compile
time can determine what the article says, because the article is what it is reading. It cannot
determine what a resource currently contains, because that is a fact about the corpus at the
moment somebody asks.

### What this buys, and it is the reason to accept the cost

**A compiled article stops changing when an asset is re-derived.** Today re-encoding one picture
rewrites the `srcset` inside every content object that names it, so the object's own content id
moves and the article is republished -- for a change the article did not make. Stopping at the rid
severs that: the object changes when the article changes and at no other time.

That is what an editor that runs online needs. It writes a rid, and nothing downstream has to be
recompiled for the write to take effect. A pipeline that bakes bytes at compile time can only be
driven by something that can run the compiler.

**No flexibility is lost, and the one that looks lost is not.** A picture's placeholder and its
whole ladder arrive in the same answer, so the reader still sees a colour block before a byte of
the image is requested, and the browser still chooses its own width from a `srcset` it was handed.
What moved is when the ladder was written down, not who decides which rung to fetch.

### Two failures, and only one of them is about the corpus

A resolution that fails is cached the way the alias layer already caches its own, and for the
reason written there: every picture on a page comes through this, so holding one blip turns a blip
into an outage.

- **The corpus has no such resource** is a fact about the corpus and keeps the publication delay.
- **The API could not be reached** is a fact about this moment and is not stored at all.

The site already renders through a network call and already answers an unreachable API with
`stale-if-error` over a window measured in hours -- see [artifacts.md](artifacts.md), "The site
keeps serving when the API does not". This adds volume to that dependency rather than a new kind
of it, and the property that makes it survivable is the same one: a record from three hours ago
names objects that are all still there and still immutable.

### One question per page, not one per resource

Measured on the corpus as it stands, an article names four resources or none. That is small enough
that the shape matters more than the cost: a page asks once for everything it needs, through the
batch entry point that exists for exactly this and today has arms for articles and reads but not
for resources. See [artifacts.md](artifacts.md), "One batch entry point".

**The arm's cap is a limit of the request and not of the page, and the difference is a whole
failure mode.** Sixty-four rids fit in one question; the heaviest article here names fifteen, and
`hindsight/except-me` is that article. Read the cap as a limit on what an article may name and a
page over it is refused -- which on this path is not a missing picture but a blank page, because a
picture that does not resolve throws where a mark that does not is simply absent. Read as what it
is, a page over it asks twice. So the caller splits at the cap rather than handing over a body it
knows will be refused, and one question per page stays the property of every page that exists
rather than a property the corpus has not yet outgrown. The byte ceiling on the route is a third
thing again: a backstop against a body no arm's caps could produce, four times the largest question
anything here sends.

## Content binds at the layer that has it

There is no fixed home for "the cids this resource owns", and there does not need to be. **A
resource binds content at the first layer where content is a fact.** An image's chain reaches
`image` and there it has a concrete mime and concrete variants, so the variants live there. A
frame extracted from a clip is one file, so `frame` binds one.

This falls out of the same rule every layer follows -- declare your own minimum -- and it avoids
the alternative, which is an `objects` map at the envelope holding entries whose meaning only a
deeper layer can explain.

**A layer binds content when the axis that selects between files is its own.** An image's variants
differ by size, which `image` knows about, so they live there. An icon's two files differ by colour
scheme, which only `icon` knows about -- so an icon binds its content at `icon` and leaves
`image.variants` empty. Light and dark are not one picture at two sizes; they are two pictures, and
putting them in a list that means "the same picture, smaller" would make every consumer of that
list wrong about one of them.

## `source` and `origin` are different questions

|          | points at              | answers                                                  |
| -------- | ---------------------- | -------------------------------------------------------- |
| `source` | a **resource**, by rid | where this came from, as a thing we also hold            |
| `origin` | anything that helps    | what it was derived from, including bytes we do not hold |

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

| type                     | count | what it is                                                   |
| ------------------------ | ----- | ------------------------------------------------------------ |
| `media.image.photo`      | 6     | camera data present                                          |
| `media.image.screenshot` | 16    | extraction ran and found no camera                           |
| `media.image`            | 17    | extraction never ran; unclassified on purpose                |
| `media.image.frame`      | 3     | a still cut from a clip; `source` is the clip                |
| `media.image.icon`       | 8     | another site's mark, one resource per domain, light and dark |
| `media.image.mark`       | 1     | this site's own mark: one thing, six files                   |
| `media.video.clip`       | 3     | rungs and caption tracks                                     |
| `document.article`       | 6     | source, nine locales, nine cards                             |
| `document`               | 1     | a standalone page: the same, with no tags and no dates       |
| `document.notice`        | 1     | the attribution text, rewritten whenever dependencies move   |

**A classification that needs a rid cannot happen before rids exist.** A frame is a frame because
its `source` names the clip it was cut from, and that is a rid -- so a pre-migration corpus has no
frames, only pictures that will become frames. The same pass that grants the ids is the one that
can say so, which is why the counts above describe the corpus after migration and not during it.

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

That rule costs a name here and is kept anyway: **a standalone page has nothing an article does
not, so there is no `page` layer** -- it is `document` and stops. Something asking "is this an
article" asks whether `article` is present and gets a positive answer either way, which is
what the chain is for. A bare marker layer would have been a name pretending to be data.

**`article` and not `post`.** A document is already other things -- a notice is one -- so the
segment that answers "when was this published" wants the narrow name rather than the broad one.
The collection spells it the same way, so one chain reads the same authored and published.

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
