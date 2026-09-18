# A segment, its id, and the record the site reads

What is translated, how a block is addressed, where the translations are kept, and the build
record the site splices its views from. Which of those views a given reader is served is a
separate problem; see [locale/addressing.md](../locale/addressing.md).

## The source is not a locale

An article is a mixed artefact: one dominant language with deliberate passages in others, and
in principle two dominant languages at once. It is not a translation of anything, so it has no
entry among the locales and never gets one. The eight targets are `en-US`, `zh-CN`, `ja-JP`,
`de-DE`, `ko-KR`, `fr-FR`, `es-ES`, `zh-TW`; the ninth thing is the `.md` file itself.

This is why a locale list of eight is correct even though nine views of an article exist. The
ninth is the article.

## A draft is written, not owed

`draft: true` in the frontmatter takes an article out of every sweep that spends money: `cms
i18n`, `cms tn`, `cms summary` and `cms diagram` pass over it, and `cms derived` stops counting it
as work outstanding. It is not a visibility rule borrowed from the site build, it is an
arithmetic one. A draft is going to be edited again, every edit rewrites the canonical form of
the blocks it touches, and a segment id is the hash of that form -- so translating a draft buys
eight locales of text that the next save orphans. Minutes would be one thing; this is money.

**Naming an article is how you ask anyway.** `cms i18n contents/hindsight/except-me.md` translates
it, draft or not, which is what `only` already means everywhere it appears: the sweep is the
default and the name is the exception. That covers the case this would otherwise make impossible
-- finishing a piece, translating it, reading the translations over, and publishing all of it at
once. `cms summary` has no such escape because it takes no article argument; a draft gets its
summary when it stops being a draft.

**The skip is said out loud.** A run that quietly does nothing looks exactly like a run with
nothing to do, so `cms i18n` reports how many drafts it left and names the way past them.

`cms articles` still lists a draft, now with `draft` beside its `lang`. The listing says what the
corpus holds; `cms derived` says what is owed; those are different questions and only the second
one changed.

The same flag is read by [architecture/media.md](../architecture/media.md)'s home card, which stopped
counting drafts for a different reason -- advertising writing nobody can open.

## A sidecar per article, holding every locale

`contents/x.md` is answered by `contents/x.i18n.yaml`. Not one file per language: an edit to
one paragraph should cost one file to open, with all eight languages side by side, which is
also how a person reviewing them wants to read.

**The sidecar is a map, never a document.** It holds segment id to locale to translation and
knows nothing about order. Order lives in the article, and two files with an opinion about it
would eventually disagree.

YAML rather than JSON, and this file is meant to be edited by hand. Translations are prose;
JSON turns a paragraph into one escaped line that cannot be reviewed or diffed, and `review`
is a flag a person sets after reading. That makes it unlike `data/record/metadata.json`, which is
output and is never hand-edited.

## A segment is a block, and its id is the hash of its canonical form

Article bodies are split on markdown block boundaries and each block is keyed by a hash,
truncated the same way asset ids are. The synchronisation behaviour falls out of that rather than
being built:

- Edit a paragraph and only its id changes, so only its translations go stale.
- Move a paragraph and nothing changes at all, because order is not stored.
- Reflow a paragraph and nothing changes, because whitespace is normalised before hashing.
- **Restyle a paragraph and nothing changes, because the id is taken after normalisation.**

The last of those is the reason this is not simply a hash of the source bytes.

An edit leaves the old translations behind under the old key rather than deleting them. After
a corrected typo the previous text is still nearly right and worth reading before it goes.

### Formatting is not content

Two blocks that parse to the same structure say the same thing. `family='georgia'` and
`family="georgia"` are one directive written twice; `*a*` and `_a_` are one emphasis. A hash over
raw bytes calls them different and throws away every translation attached to the first spelling.

Measured: changing one attribute from double to single quotes is enough, and eight locales go
stale for a block whose meaning did not move.

This was tolerable while every article was written by hand and nothing rewrote them. It stops
being tolerable the moment the editor exists, because **every save goes through a serializer, and
a serializer has its own opinions**. Without this rule, opening an article and pressing save would
orphan translations somebody paid for -- not once during a migration, but on every save forever.

### Canonical text, not the syntax tree

The id is the hash of the block **after normalisation**, where normalisation means: parse it, then
serialize it again with one fixed set of options. Structurally equivalent inputs converge on the
same text and therefore the same id.

Hashing the syntax tree directly would express the same idea and is the wrong way to get it. The
id would then be a function of remark's data structures, so an upstream release that adds a field
would silently change every id in the repository, with no diff to read and nothing to inspect. A
canonical _text_ can be printed, compared and explained. When two ids differ, somebody can look at
the two canonical forms and see why.

### The file on disk is written in canonical form

Normalisation is not only for hashing. Articles are stored normalised, so the bytes on disk are
already the canonical form and the id is the hash of what is there. An article imported from
elsewhere is normalised the first time it is saved.

This retires an older requirement rather than contradicting it. Byte-identical round-tripping
mattered while the file was the authority; once the canonical form is the authority, the file is
its projection, and the editor is free to write whatever the normaliser produces. The round-trip
harness stays useful for a narrower question: whether the transform is lossy in _meaning_.

Normalisation belongs to the TypeScript path that writes an article, and Rust hashes the bytes it
finds there. Teaching Rust to reproduce remark's canonical form would put the same parser,
extensions, YAML handling, and serializer choices in two languages; agreement would then be a
second invariant with no shared implementation. Making the write boundary canonical is cheaper
and leaves every stored input to Rust inspectable. The cost is deliberate: a caller that bypasses
that boundary can present non-canonical bytes, so imports and migrations must pass through the
TypeScript normaliser before Rust derives ids.

### The canonical style

Chosen to suit this repository first, remark second, and common practice third -- in that order,
because the corpus is what has to migrate.

The corpus is unusually free of style choices to preserve. Across five articles there are exactly
three constructs: 43 ATX headings, 121 `**strong**` spans and 13 inline links. No lists, tables,
block quotes, setext headings or `~~~` fences exist at all. So almost nothing here is a compromise
with existing content, and the migration diff is small by construction. The one inconsistency
already present is frontmatter quoting: one article quotes its dates and four do not.

|               | Canonical    | Why                                                                                    |
| ------------- | ------------ | -------------------------------------------------------------------------------------- |
| Headings      | ATX (`##`)   | All 43 already are. Setext cannot express depth beyond two.                            |
| Strong        | `**`         | All 121 already are, and it is remark's default.                                       |
| Emphasis      | `*`          | Matches strong, so one character means emphasis at both weights.                       |
| Bullets       | `-`          | remark's default; `*` collides with emphasis at the start of a line.                   |
| Ordered lists | `1.`         | Literal numbering rather than incrementing, so reordering does not rewrite every line. |
| Fences        | ```          | All existing fences are backticks, and the `svg-canvas` blocks depend on it.           |
| Fence info    | verbatim     | Never rebuilt. See the note on parameterised fences below.                             |
| Links         | inline       | All 13 already are. Reference style moves the target away from the text.               |
| Rules         | `---`        | Also the frontmatter delimiter, so one horizontal form appears in the file.            |
| Frontmatter   | remark's own | Not re-spelled by us; see below.                                                       |

Frontmatter is normalised by parsing and re-emitting the YAML, which is what makes the two
existing spellings of a date converge. It is deliberately the one place where the rule is applied
to a nested format rather than to markdown, because those values are hashed as segments too.

### A directive is structure, not prose

Directives are excluded from translation entirely -- not filtered attribute by attribute.

Measured on the corpus at the time: 26 segments, 12% of the total, came back from the model byte
identical to what was sent, at a cost of roughly 440,000 tokens. Every one is a directive.
`::github{repo="canmi21/seam" align="left"}` contains no natural language to translate, and the
model correctly returned it unchanged after being paid to look at it.

The older rule tried to translate a directive's named attributes while leaving `src` and `url`
alone. That is the wrong shape for two reasons. It is a denylist, so a directive type added later
is translated by default until somebody remembers to exclude its address attributes -- and a
translated URL is a broken link rather than a poor translation. And it is unnecessary: a resource
carries its own description where the resource is defined, so the alt text a reader needs is
already translated, once, rather than once per use.

Excluding the whole class is a statement about what a directive is. It names a resource and how to
present it. If a directive ever needs translatable prose inside it, that prose belongs in a
container directive's content, which is ordinary markdown and is segmented as such.

**This is about block directives, which are a segment of their own.** An inline directive is not
one: it sits inside a paragraph or a heading, so it travels inside that segment and is translated
with it. That is the right outcome rather than an exception -- `:fn`'s note explains the sentence
it is attached to, and the two are translated in each other's company. What it costs is that a
model now returns a directive it was handed, so `validate.rs` checks the shape of what comes back;
see [styling/notes.md](../styling/notes.md) for what the shape is and why a straight quote breaks it.

### An author's note continues from its words, in every locale

A phrase inside the note's explanation that would deserve a translator's note in open prose --
an idiom, a joke, a register trick -- gets none there: the author's note is already an
explanation channel, and its translation renders an equivalent expression in place. This is
enforced where it is cheapest, at the scanner: `attach` drops a span whose every occurrence
sits inside an `:fn` attribute. Recording one would not merely be redundant, it would wedge
the segment -- `:tn` cannot nest inside the attribute, since the straight quote that would
open it ends the attribute instead, so every answer either omits the demanded note or breaks
shape, and the run buys the same refusal forever. Found exactly that way, three paid attempts
deep.

The collected notes show the translated words and the translated explanation side by side,
composing one continuous statement -- see [styling/notes.md](../styling/notes.md) for the display. So
the explanation is written to continue from the words rather than restate them: a reader who just
read the phrase should not read it again as the explanation's opening. The prompt says this
only to blocks that carry a `:fn`, tells the model why -- the two halves meet again at the end
of the article -- and allows a restatement where the target grammar leaves no natural
alternative. That allowance is why the check is the audit report above and not a rejection;
the aim is the overwhelming case, not every case. Code inside the words is masked like all
code and survives untranslated by mechanism, not by instruction.

### Invalidating what a policy change outgrew

When a rule changes shape -- source-provenance copies retired, the note policies here and in
[prose.md](prose.md) stated -- the translations bought under the old rule are not wrong enough to discard wholesale and
not right enough to keep. `cms invalidate` deletes precisely: entries selected by segment id,
by what the segment's source contains (`--containing ':fn['` names every note-bearing block),
or by what the stored translation contains (`--translation-containing ':tn['` names every
translation that carries a note), optionally narrowed by locale. The ordinary repair run then
buys back exactly what was dropped and merges it into everything kept, because repair has
always worked that way; invalidation is just deletion aimed well.

Dry by default, like `cms gc`: the selection prints, `--live` deletes. An empty selection is
refused rather than meaning everything -- that is what `--force` on a translation run is for.
And a `review: true` entry outranks every selector: the flag means a person read that text,
and a policy sweep must not undo a judgement it cannot see; the run reports what it kept.
This was a throwaway script twice before it became a command, which is the extraction
threshold doing its job -- see [workspace.md](../architecture/workspace.md).

### Migrating what was already paid for

Recomputing ids invalidates every existing translation by construction, and those translations
cost real money. So the change is a migration, not a reset:

1. Normalise every article.
2. For each old segment, compute the id its canonical form produces.
3. Move the sidecar entry from the old id to the new one.
4. Only genuinely new or changed content is left to translate.

Step 4 should be empty. Normalisation does not change structure, so a block's translations remain
correct for it; only the key changes. Anything left over after the migration is a finding worth
reading rather than a batch to run.

The migration is a script rather than a command. It runs once, it is not part of any pipeline, and
both files it touches -- the articles and their sidecars -- are version controlled, so a bad run is
undone by restoring them rather than by being careful.

The frontmatter block is metadata and never becomes body prose. Three named string values
inside it do become segments of their own: `title`, `subtitle`, and `description`. Each is
addressed by the hash of its decoded text, so editing a title invalidates that title alone.
This is an allowlist: `lang`, dates, counts, and any key introduced later remain metadata until
someone explicitly decides otherwise. A denylist would silently send a future metadata field
for translation and let the model corrupt it.

These values are display-ready copy. Their prompt preserves whether the source ends in
punctuation while requiring each target locale's native casing and punctuation; neighbouring
article text is context, not a typography template.

### A section heading is also a label, and the rail is narrow

**Only a section heading is bound by this.** A subsection is not listed in the rail at all -- see
[styling/rail.md](../styling/rail.md) -- so no width can be wrong for it, and `validate` refuses
nothing on its account. It still gets the half of the rule that is about writing rather than about
fitting: its own section is about to explain it, so it names rather than explains. `audit` mentions
one only past the clamp, where a heading several times the source's length is usually the translator
explaining the section in the title. Applying the rail's width to a heading the rail never shows
would be enforcing a fiction.

Section headings become navigation labels in the article table of contents, and a translated one
overruns far more often than the source does -- measured across the corpus, the source headings
run to a median of 8 columns and the German, French and Spanish ones to 15 to 16, nearly double.
The asking-for-brevity version of this rule did not move that number, because brevity was never
the obstacle.

**Width is columns, not characters.** A Han character occupies two where a Latin letter occupies
one, so a count calls a Chinese heading and a French one of the same length equal when they
differ by a factor of two. Unicode's East Asian Width table settles it, and the rendered rail
agrees: one Han glyph is 13px against an average Latin 6.84px, a ratio of 1.9. **Re-measured on
2026-09-16** over the 496 section-heading translations the corpus holds, drawn in the label's own
font: 6.80px a Latin column, 6.89px in the two heaviest locales, so the figure held. This is the
cheap true measure rather than the exact one -- real shaping knows `i` from `m`, and needs a font
the CMS has no other reason to load.

The layout supplies the numbers, and it supplies them from another language. The rail's width is
declared as `--rail-width` in [utilities.css](../../apps/site/src/styles/utilities.css) and argued in
[styling/rail.md](../styling/rail.md) under "The rail's box is one declared width"; what this file's
rule reads are `ONE_LINE` and `CLAMP` in [width.rs](../../apps/cms/src/i18n/width.rs). A label is given
the rail's whole 136px at 13px type, which holds ten Han characters or nineteen Latin ones, so one
line is 19 columns and the two-line clamp is 38. Both are measured in the rendered rail: nineteen
is the widest a label goes without wrapping anywhere in the corpus, and three of the nine that
reach twenty do wrap.

**Three bands, and only the last is refused** -- for a section heading. Under one line is the target. Two lines are a
legitimate outcome, and the rail is built for them, so `audit` reports that band and a person
judges whether the language could have said it shorter -- rejecting it would buy the same answer
repeatedly and eventually take a worse one. Past the clamp the end is never shown, which is a
loss rather than a judgement, and that is what `validate` refuses. The same division as the note
policies above, for the same reason.

**The prompt states the budget as a width, anchored to the source, with the permission that makes
it reachable.** A model is poor at counting characters and good at picturing a rail seven Han
characters wide; it is also told how wide this heading is in the source, which the author sized
by hand. The instruction that actually does the work is the reason it may drop detail: the
section's own opening paragraph is already in the request as context, and a reader who picks the
entry arrives there immediately, so the label only has to let them recognise the section rather
than explain it. Overrun was a translator trying to make the heading say what the section says.

### A directive needs the spacing its own script uses

The source may write `请求时的:fn[模型]` with nothing between, because Han script does not space
its words. Carried into a language that does, the identical shape renders `Modeloen la petición`
-- a word in no language, produced with no rule broken along the way: the shape validated and
every marker came back. Instructing the model not to do it did not hold, so the check does.

The test is the character rather than the locale: a directive needs air when what it touches is a
narrow letter or digit. A wide glyph does not space its words, and punctuation is already a
boundary the eye reads -- French `l'`, a hyphen, an opening `¿`. Refused on arrival, and reported
by `audit` over what is already stored, since it cannot join `validate::sidecar` without failing
the build on translations bought before the rule existed.

The active indicator stays centred on its label. A multi-line indicator spans one centred
single-line mark plus a full line height for every additional visible line, so the space
between lines is represented rather than collapsed. Moving between one- and two-line labels
animates its centre and length together with the same spring, so changing length cannot bend
or lag behind the existing motion path.

Rust is the only implementation of those block boundaries and hashes. `cms segments` writes
the ordered translatable segment ids and their source byte ranges to
`data/build/segments.json`; `cms i18n` refreshes the same record before making any paid
request. The publish step assembles the views from that committed record and never splits or
hashes an article itself, which makes a stale record fail the CMS regression test instead of
silently turning every translation lookup into a miss.

**Everything this section used to say about a virtual module is gone with the module.** The site
no longer compiles the corpus at build time, so there is no multi-megabyte ESM module to evaluate,
no development snapshot to replace atomically, and no deployed bundle whose size argues for
de-duplicating a locale payload. Those were real problems and each was solved; they were all
consequences of compiling the corpus into the Worker. See
[architecture/artifacts.md](../architecture/artifacts.md).

Two of them were worth keeping as facts rather than as mechanisms. De-duplication is now free and
total: a view whose bytes are identical to another's has the same hash and is one object, so a
locale falling back to the source costs nothing anywhere. And the ordering that update needed --
refresh the layout with Rust before compiling against it -- is the publish step's ordering now,
for the same reason it was the dev server's: a view spliced from a stale layout is wrong in a way
nothing reports.

The segment layout is a derived build record, not the translation sidecar. It carries only an
id, the start and end byte offset, a source fingerprint, and whether the span belongs to
frontmatter or the body. It has order because the build needs order; the hand-edited sidecar
remains a map and continues to know nothing about it. It does not contain assembled views or
duplicate article prose.

The site splices both regions from that one record. A translated frontmatter value is quoted as
a YAML string before insertion, while an absent frontmatter translation leaves the original
scalar untouched. Missing titles, subtitles, and descriptions therefore never render as empty
copy while a translation run is incomplete. A missing sidecar or any missing live body segment
falls back the entire view to the source article instead of mixing languages within one page or
making the site fail to render. The requested locale stays selected and a localized notice says
that its version is unavailable; indexing treats that fallback as the source, not as another
translated URL.

### A span carries a fingerprint of what it claims

An offset is a claim about bytes it does not contain, and it can be wrong in a way an id cannot.
Edit an article without regenerating the record and every offset after the edit shifts: the
spans then slice text they were not measured against, while their ids still resolve, so nothing
is reported missing and translations are spliced into the wrong places.

**So each span also carries a fingerprint of the exact source bytes it covers, and the site
recomputes it before assembling. A mismatch fails the build naming the article.** Length alone
does not do it — inserting text ahead of a span moves it without resizing it.

The fingerprint is a cheap non-cryptographic checksum, deliberately not the segment hash. It
exists to catch drift, not to resist an adversary, and the site must be able to compute it in a
few lines. Reaching for the real hash here would put a second implementation of it back in
TypeScript, which is the duplication this record was created to remove.
