# Copy that is not article prose

Interface strings, tag labels and article summaries: short display-ready text that carries none
of the segment machinery the rest of this directory describes. UI strings have a separate tool
again; which localised view a reader is served is
[locale/addressing.md](../locale/addressing.md).

## UI copy carries intent, not English syntax

Localized interface copy preserves the source promise and product state, then rewrites the
expression in the target language's own register, word order and rhythm. It is not a sentence-level
translation exercise. A clear local verb may replace the English button verb; a confirmation may
reassure the reader in a way that sounds natural in that language; conventional local product words
win over imported English when the interface does not require a fixed proper name.

Newsletter copy keeps four facts in every locale: what kind of mail will arrive, that sending has
not started, that joining now records an early place, and that the reader will receive the first
issue. The English source may carry the fullest version of that voice, but other locales do not
inherit its clause order or idioms. Form labels remain direct, and confirmation copy makes the lack
of mail before the first issue reassuring rather than sounding like a system warning.

## A list whose length is data is assembled, never written into a message

A message can hold a slot for a value. It cannot hold the words that join several of them,
because how many there are is not known when the copy is written, and the joining words differ
per language and per count -- English needs a comma before the last item only above two,
Japanese uses `、` where English uses a word at all.

So a message carries one slot for the whole list, and `Intl.ListFormat` supplies the
connectives. `formatToParts` keeps the items separable from the words between them, which is
what lets each item stay a link. The licence page names its registries this way: the copy says
where the packages came from, the list says which registries those are, and a third registry
appearing in the record would appear in the sentence without a message being touched.

The same reasoning puts numbers through `Intl.NumberFormat` rather than into the message text.
What a translator is being asked for is the sentence, not the grouping separator.

## A tag is translated from a meaning, not from its key

An ordinary tag carries three distinct things in `data/tags.yaml`: its lower-case identifier,
an English source label, and a short semantic meaning. The identifier is an address, not prose.
Sending it alone made `cellular` become the biological adjective even though the image showed
mobile carrier settings; a model cannot recover context it was never given.

`cms tag` writes the source and meaning while it can see the image. Existing tags are shown
with those fields, so reuse means the concept matches rather than merely the spelling. Two
senses never share one key: `mold-linker` and fungal `mold` are separate records.

A technical tag has one official display form and never enters translation. For an ordinary
tag, `cms tag` records the English source label as the `en-US` display with the full provenance
of the vision answer that created it. `cms locale` never replaces that source record, even
under `--force`; one request covers every missing non-source locale with the source and meaning
in the prompt. The result is a ready-to-render standalone label: English uses title case for a
short tag; German follows noun capitalisation; French and Spanish capitalise the first word and
otherwise follow native orthography; scripts without case use their natural form. Established
terms keep their conventional internal casing. CSS does not repair casing after the fact,
because doing so would corrupt names such as `eSIM`, `macOS` and `npm`.

These strings contain no markdown and use none of the article segment or masking machinery.
The line-anchored locale markers are reused because a malformed answer should still lose only
the malformed locale.

## A summary says what is asked and withholds what is found

`cms summary` writes one summary per article, in the article's own language, into a generated
sidecar. It is not the description: that one is sized for a search result and reads as a label,
while this is read by somebody deciding whether to spend twenty minutes.

Two instructions pull against each other on purpose. Be specific about the question -- the
problem, the alternatives weighed, the tools and flags named -- because a summary that would fit
any article on the topic has said nothing. Be incomplete about the answer: say that the article
reaches a design, a recommendation or a measurement and characterise it in a word, never state
which one. Roughly half: nearly everything about what is asked, little about what is found.

Both failure modes are named in the prompt because both were observed. Handing over the
conclusion and then appending a teaser is one. Saying "covers several approaches and draws
conclusions" is the other, and it is worse -- it withholds the question as well.

Plain text is enforced in code rather than requested in the prompt. A stray `**` renders as
literal asterisks and travels into eight translations before anybody looks, so markdown is
stripped, wrapped CJK lines are joined without a space, and punctuation following a CJK
character takes that script's width. A model asked politely for no markdown mostly complies, and
"mostly" is not a format.

The summary answer is enclosed by two copies of a fresh random boundary. Text outside that pair is
runner narration rather than summary prose and is ignored; a missing, empty or repeated pair is a
failed answer. The article itself is fenced by a different fresh boundary, so prose cannot know
the marker that authorises output. Summary translations use the same pair before they enter the
sidecar.

### Translated by `cms locale`, not by `cms i18n`

Summaries are short plain strings addressed by locale, which is what `cms locale` already
translates -- tag labels and image descriptions have the same shape. They join that queue rather
than growing a second one, and inherit its backoff, its stop on a spent allowance, and its rule
that every answer is written to disk before the next is asked for.

One thing had to give: that command assumed every source was `en-US`, because a vision model
writes in one language. A summary's source is whichever language its article is written in, so
the source locale travels with the unit instead of being a constant. The translation prompt also
says out loud that the text withholds the article's conclusion, because a translator that tidies
it will finish the thought the original deliberately left open.

### A page is not an article, and is not translated

The test is the `lang` frontmatter: an article declares the language it was written in, a page
does not. `cms i18n`, `cms summary`, and `cms tn` all skip anything without one, and the site
compiles every view of a page from the source. A page is also absent from `data/tn.yaml`, not
recorded as an empty scan; the TN registry contains articles only.

The homepage is the whole of that category today. Its bio was always rendered from `mw`
whatever the view was, so the eight translations that sat beside it were never read by anything
-- while the build could not start without the file holding them. Deleting it is the point: a
sidecar that is required to exist and never consulted is worse than no sidecar.

Its title and description do come from the source now rather than from a translation, which is
the visible consequence and the intended one. Identity copy reads the same in every view.

### The article file is never edited

Summaries live in `contents/**/*.summary.yaml`, keyed by locale, carrying the same `Translation`
record as a translation: provider, model, timestamp, seconds, tokens, and `review`. The `.md` is
prose a person wrote and no command writes to it.

A view takes its own locale's summary first and the English summary second. If neither exists,
the summary control remains in the metadata row but is disabled; adding either record makes the
next content rebuild enable it. An incomplete summary sidecar is therefore an ordinary generation
state rather than a reason to shift the row or fail the page.

The expanded summary shows the active locale's provider mark at its lower right. Provenance is
read from that locale's record rather than inferred from the model name: OpenAI, Anthropic, and
Google use their corresponding MingCute marks, while xAI uses its own current mark. They are
sized by height so their own view boxes remain intact beside the Lucide summary control. The mark
shares the final line and follows the rendered right edge of the line above it, so different
wrapping across locales does not turn it into a detached full-width row or leave it hanging
beyond the text.

`review` has teeth here. A summary somebody has read and vouched for is not regenerated, and
`--force` does not override that: the flag means the model's last answer was wrong, not that a
person's judgement is discarded.

The homepage has no `lang` and so is not an article to this command. Its summary is written by
hand in its frontmatter and is not translated -- nothing renders a translated one.
