# The font pipeline

## A font pipeline input is disposable

The font pipeline only moves in one direction: a full face under `data/source/fonts` is input, and
web chunks are output, published as objects like everything else the corpus holds. The input is useful only while somebody
may slice that face again. Once the chunks exist it may be deleted, and a family with prebuilt
chunks needs no input of its own. It may still name an input retained by a different family that
owns their shared chunks. Keeping every original forever would turn a temporary build need into
repository policy without buying the browser anything.

The authored [font manifest](../../data/record/fonts.json) records that distinction. Ioskeley Mono has
eight prebuilt chunks and no retained input; that is a complete family, not a missing source.

That manifest stays in `data/` because it is a curated asset record and the slicing pipeline must
read it without depending on a TypeScript runtime. Consumers do not cross that directory boundary:
the root export of [`@canmi/fonts`](../../libs/fonts/package.json) provides the typed family list and
its package stylesheet paths. This keeps one authored list while making the library the public
answer to what a family is and where its stylesheet lives.

## A runtime font is a separate dependency

An application may independently need a full face at runtime. `cms og` renders arbitrary titles
with LXGW WenKai and therefore loads that one full TTF by path; a web subset cannot answer for a
character it does not contain. That runtime dependency is why the 24MB file stays. No other
published family gets a retained full face merely because this one has two roles. LXGW's own
split chunks come to 12.5MB against it, and no reader ever wants more than a fraction of that.

**That figure is one family's, not the set's, and saying so is a correction.** It was taken from
a comment in `wenkai.css` and written here as a total, which was true only while LXGW was the one
CJK family. `data/record/fonts.json` now declares three as `frequency-chunks` -- lxgw-wenkai, klee-one
and tang-guo-wei-de-xia-tian -- and every published chunk in `data/bucket/objects` totals
18.5MB, of which those three are 18MB and the Latin faces and the monospace are the rest. Byte
figures in this file are binary: 12.5MB is 12.53 MiB, and the retained face is 24.39 MiB.

## Latin and CJK use different slicing strategies

Latin faces are a few hundred kilobytes and are split into the handful of named writing-system
subsets Google Fonts uses -- `latin`, `latin-ext`, and the other groups a face publishes. Their
readable filenames were stable cache interfaces. CJK faces are tens of megabytes, so they are
split by character frequency into hundreds of `unicode-range` chunks: common characters arrive
first, and content hashes name the output because no person benefits from reading those names.

**Every chunk is named that way now, Latin included.** The readable names were the last keys on
this site keeping a year without a hash, and what they cost was a promise somebody had to
remember: that re-subsetting writes a new filename rather than new bytes under an old one. A
content id makes that true instead of asking for it.

The strategy is explicit in the manifest rather than inferred from glyph coverage. Coverage says
what a face contains, but not whether its existing readable URLs are a compatibility promise;
inferring would let a font update silently change both its publication layout and cache identity.
See the [font runbook](../../libs/fonts/README.md) for the operational side.

A selectable family is the name a person picks, not a set of bytes. Its generic fallback completes
the CSS stack, and its faces say which local or redistributable typefaces may satisfy that choice.
Metric compatibility decides what may substitute; it does not decide which choices are offered.
Two families therefore remain separate entries when their local-first stacks differ, even if they
share the same published chunks. Keeping the choice and its sources together prevents a second
selectable-font list from disagreeing with the published faces.

The stylesheets live in `libs/fonts`, apart from the colour tokens. They are a different kind
of fact -- what a family is and where its files are, rather than what the site looks like --
and a CJK sheet is large enough that nothing should import one until the site actually sets that
family. `wenkai.css` gzips to 75KB, `klee-one.css` to 28KB and `tang-guo-wei-de-xia-tian.css` to
22KB: 125KB for the three. This read "the CJK sheet alone", singular, which is a correction --
there are three of them, and 75KB was always LXGW's number rather than the group's.

## Only the regular cut of the monospace face is reachable, and the rest stay

`mono.css` declares eight cuts of Ioskeley Mono: regular, italic, bold and bold-italic, each split
latin and latin-ext. `code` and `pre` are the only selectors naming the family, so what a reader
ever fetches is decided by what appears inside them.

Measured, nothing there is ever emphasised -- but not for the reason this file used to give. It
said neither syntax theme emits `font-style` or `font-weight`, and that was wrong: `one-dark-pro`
marks every comment italic, `one-light` did too, and 88 published objects carry the mark. What
saves it is that a dual-theme render emits the style as a custom property, `--shiki-dark-font-style`
beside `--shiki-dark`, and [code-block.svelte](../../apps/site/src/lib/blocks/code-block.svelte)
reads only the colour. The declaration is never made, so the browser is never asked. (`min-light`,
the light half since, emits no style at all, which makes the light side true in both readings.)

**So the reachable set is held by an omission, and a rule reading that variable would end it.**
Writing `font-style: var(--shiki-dark-font-style)` beside the colour is a one-line change that
looks like a fix and puts two more cuts on the wire for every article with a comment in its code.
No article writes code inside bold or italic markup either, and no rule gives `code` a weight of
its own. Six of the eight cuts therefore cannot be requested,
and the latin-ext regular waits on an article whose code contains a character above U+00FF.

They stay, under the rule in the workspace's `code.md`: a monospace family cut to a single weight
has to be re-cut the moment anything wants emphasis, and until then it costs a reader nothing. A
`@font-face` is a declaration; the browser fetches a cut only when text matches its family, its
style and weight, and its `unicode-range`. The unreachable six are bytes in the bucket, not bytes
on the wire.

This is written down because it reads as waste from the outside, and has been reported as waste
before.

## A hash in the name buys a year

Cache lifetime needs no tier of its own here any more: a chunk is an object, so it earns what
every object earns -- **a year and `immutable`, because its key carries a hash and its answer is
settled.** There is no `/fonts/` prefix and nothing in between for a font to fall into.

This section has now been wrong twice, and the second time is the one worth keeping. It first
named two tiers and sent everything unhashed to five minutes; the correction to that named a week,
which no constant in `libs/cache` has ever held. There are three tiers -- a year for a hashed key,
an hour for a key that only names, five minutes for anything that is not a settled answer -- and a
font chunk meets only the first. `libs/cache` is the account being corrected to, and `cache.ts`
reads from it rather than restating it.

HTML is the one thing that is not cached at all, because its body varies by the reader's
locale cookie. See [locale/addressing.md](../locale/addressing.md).

The year is an observation, not a promise. Changing the bytes changes the hash and therefore
the URL, so a hashed name cannot come to mean anything else and nobody has to remember to bust
it. Every chunk works that way, CJK and Latin alike: the readable Latin subset names were the
last keys on this site keeping a year without a hash, and they went with the rest.

Errors get five minutes rather than nothing. A missing favicon is requested on every page
view, and without any caching each one is a full trip to the origin. Five minutes rather than
either tier above because an error is a statement about right now -- the asset it refers to may
be published a minute later, and a 404 held for a week, let alone a year, would outlive its own
reason.

A route that stores its own response has to stamp the header before storing it, which is
earlier than the middleware runs. So the value is one exported constant that both use, rather
than two spellings that agree until they do not.
