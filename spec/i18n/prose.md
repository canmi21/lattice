# What a translation has to read like

The rules that judge the returned text as writing rather than as structure: notes, marks, and
length. The checks on its shape are in [request.md](request.md); the widths a rail or a card
imposes are argued in [styling/rail.md](../styling/rail.md) and
[styling/phone.md](../styling/phone.md).

## Same-language views localise the article too

Original is the author's unedited voice. A target view remains model-generated even when its
locale exactly matches the article's source language: `zh-CN` is not a locally copied substitute
for a Chinese Original. It is the direct-reading edition, with grammar and orthography
regularised, mixed-language phrasing resolved where a natural local expression exists, and
implicit connections made plain enough to follow without changing what the author meant.

That freedom is bounded. A same-language localisation preserves facts, first-person perspective,
emotional force, emphasis, jokes and uncertainty. It does not summarise, sanitise, flatten the
author's position or invent connective claims. A sibling target such as `zh-TW` additionally
uses its own script and idiom under the same rule.

Translator's notes apply to every article locale, including a same-language localisation. A
recorded note invalidates any translation that does not yet carry the requested note. Historic
entries with local `source` provenance are likewise incomplete: the Original view already owns
the raw text, so a generated locale must carry real model provenance.

## A translator-note phrase identifies one occurrence

`cms tn` may suggest only a short phrase that appears in exactly one body segment. If the
shortest word occurs more than once, the scanner includes just enough adjacent text to make the
occurrence unique while keeping the phrase within eight characters. An ambiguous result is
dropped rather than attached to the first textual match: a plausible note on the wrong
paragraph is harder to detect than no note, and would make a completed translation appear stale
forever.

### A phrase can be unquotable, and the audit must not report that forever

The citation check asks whether a note contains the recorded phrase. A phrase carrying a
straight double quote can never satisfy it: the directive's attribute has no escape for one, so
the quote would end the note early. `"清"字` -- the author quoting a single character -- is
recorded exactly as the article writes it, and reported all eight locales of a segment whose
notes cite the character correctly.

So the comparison is against the stretches of the phrase a note is able to hold, split at the
characters it cannot. Every phrase without a quote yields itself and nothing changes. **A check
that cannot be satisfied is worse than no check**: this is a report a person reads, and a
permanent false positive on eight lines hides the findings that are real.

## Translator's notes

Where a passage depends on knowledge a reader of the target language would not have, the
translation may carry `:tn[word]{is="explanation"}` immediately after it. At most one per
block, and only where the meaning is genuinely unrecoverable from context.

**The wrapped words are the translation; the original lives in the note, verbatim.** The
sentence reads entirely in the target language and its own script -- never a romanisation,
which is neither the original nor a translation, and never the source script carried into the
prose -- while the note quotes the original word exactly as the source wrote it, original
script included, and then says what it did. A zh-TW note quoting a Simplified original keeps
the Simplified characters: the quote is a citation of the source, not text being localised.
The two halves have one job each: the prose owes the reader fluency, the note owes them the
original. Before this was stated the runs produced all three shapes -- pinyin, retained
Chinese, translated words -- article by article, which is the failure mode of an unwritten
rule rather than of any model.

`hooks` cannot check this and `validate.rs` checks only shape; the policy checks live in
`cms i18n --check` as a report (`audit.rs`), never a gate. Both note policies -- this one and
the author's-note continuity in [segments.md](segments.md) -- are soft: a target grammar can force a restatement, and
a legitimate quote can echo the prose. A hard gate would reject exactly the defensible
minority, so the audit prints suspects and a person judges them.

Translator's notes belong to body prose only. Title, subtitle, and description are reused in
browser chrome, cards, feeds, and machine-readable metadata, none of which has an interaction
channel for a hidden explanation. An idiom there is translated directly; a `:tn` in
frontmatter is an invalid translation, not text to clean up while rendering.

A note is explicitly activated beside its words and opens in place. Native title tooltips are
not the fallback: real notes are long, title is unreliable on touch and keyboard, and exposing
the explanation as the marked phrase's accessible name makes the sentence harder rather than
easier to read. The trigger remains visible even when the marked phrase is one character, and
its expanded state, dismissal, and explanation are available to assistive technology.

The open note follows the article language menu's panel vocabulary rather than presenting a
second visual system: the same paper, border, radius, shadow, spacing, and subdued icon treatment.
Its heading pairs an information icon with a natural translation of "from the translator" in
the current content view, and the close control is announced in that language as well.

Prompt instructions do not establish either boundary. Model output is accepted only after the
CMS validates the directive shape and the segment region; invalid output consumes an attempt
and is requested again through the normal escalation path. Stored live translations cross the
same acceptance boundary before the CMS emits a build record, so manually edited or historical
bad content stops with its file and locale named instead of being committed as a silently bad
site build.

It exists only in translations. The source never has one, so nothing has to filter it out of
the original view. `:note` is deliberately not this -- that name is reserved for an authoring
component.

## A translation may not borrow a dash the author never spent

A dash is the author's to spend. If the source title or subtitle carries an em dash, en dash or
fullwidth dash, a translation of either may carry one; if neither does, none of the four written
fields may introduce one. A hyphen inside a word is not this and is untouched: it builds words
rather than splicing sentences, and German and French need it to.

The reason is what a length limit does to a writer. A dash is the cheapest way to meet one -- two
thoughts, one line, and no conjunction to find in the target language -- so it is the first thing
reached for and the least deliberate thing on the page. It also reads as voice, and the voice it
reads as is the author's. `Zu lange drin - Zeit für draußen` was written under a limit; the source
it came from joins its two halves with a comma.

Stated in the prompt and checked in `validate::display`, because a rule that is only asked for is
a rule that holds until the model is under pressure, and a length limit is exactly that pressure.
The check is handed the title and the subtitle as one, because the two license one another: they
are read together under one register, and a subtitle continues the title it sits under. Pairing
them field by field was tried first and is stricter than the rule.

**It covers the long forms too**, which it did not at first. The argument for scoping it to the
short ones was that a length limit is what makes a dash tempting, and that argument is true and
is not the rule. The exception is keyed to the source, so what decides is whether the author
spent one -- not whether the translator was under pressure. `Been Cooped Up Too Long—Time to Go
for a Walk` was a full subtitle, written from a source that joins with a comma.

## A final full stop is the author's taste, and nothing checks it

A title or subtitle may end with a full stop or not. `From magic to lowering.` has one and
`Future of SeamJS` does not, in the same article. Nothing enforces either way and nothing should:
where a dash is a length limit leaking into the voice, a full stop at the end of a subtitle changes
only how finished the line sounds, and how finished a line should sound is the author's to decide
per line.

A translation follows the source it was given, which is the same thing it does for every other
mark. That falls out of translating the field rather than being a rule of its own -- the point of
writing this down is that a later reader finding one subtitle stopped and another not has found a
preference, not a defect to normalise.

## A budget is a ceiling, not a target

A short form is written to fit, not to fill. Measured across the corpus, Latin views use around
95% of the room a phone card gives a subtitle and CJK views around 75%, and neither number is a
problem to correct: the shorter of two phrasings that say the same thing is the better one, and a
line that stops early has not lost anything a reader wanted.

What the limit rules out is the opposite move. Where a natural phrasing already lands near the
limit, it is kept rather than cut further -- a line trimmed to be short reads worse than one that
simply fits.

This was written the other way round first, telling the model to land within a few characters of
its limit on the grounds that the room had been measured and should be used. That is a rule about
the layout applied to the prose, and it produces copy padded to a width.

## A translation that runs far longer or shorter than its source is reported

`display` measures a frontmatter field against its own budget and never against the source, so a
translation could say considerably more than it was given and pass every check there was. That is
how `From magic to lowering.` came back as `Von Magie zum Lowering: Rendering neu gedacht.` in
seven of eight locales -- a clause the four-word source does not have, which is authorship rather
than translation -- and nothing reported it. `audit::lengths` is the backstop that now would.

**A single band cannot do it, because length is a property of the language.** Measured over the
corpus, 2848 pairs across 356 segments, the median translation-to-source width per locale:

| region      | de   | en   | es   | fr   | ja   | ko   | zh-CN | zh-TW |
| ----------- | ---- | ---- | ---- | ---- | ---- | ---- | ----- | ----- |
| frontmatter | 1.29 | 1.00 | 1.15 | 1.21 | 0.93 | 0.86 | 0.82  | 0.83  |
| body        | 1.78 | 1.51 | 1.71 | 1.76 | 1.43 | 1.22 | 1.04  | 1.02  |

German runs a third longer than its source in a title and three quarters longer in prose; Chinese
runs shorter in both. One threshold over those would flag every German string and no Chinese one.
So each width is divided by what that locale usually spends, and what is left is comparable across
languages.

**Two tests, either of which reports, because each is blind where the other sees.** Against the
table, a locale is judged alone -- which is what notices a whole row drifting the same way.
Against the median of its siblings in that segment, it is judged with no constant at all -- which
is what survives an article written in a language the table was not measured on, since a
source-language shift moves every sibling together and cancels.

The bands are measured rather than picked: alone, the corpus spans 0.35 to 2.16 and the band is
0.45 to 2.2; against siblings it spans 0.51 to 1.86 and the band is 0.4 to 2.2, about a fifth of
headroom on each side. Sources under 40px are skipped, where one word either way swings any ratio
past any threshold.

**It is a warning and never a lock.** A finding leaves the exit code alone -- `cms i18n --check`
returns 0 on an article that reports six of them and 1 only when a translation is actually
missing -- and no run refuses, re-asks or rewrites anything on its account. What it is for is
triage: a review that would otherwise read 2848 strings reads six, and the rest have been
declared uninteresting by something that can measure faster than a person can look. The value is
in what it clears, not in what it catches.

**The reported six are the check working, not noise to tune away.** All of them are terse Chinese
sources whose translations run long, and Chinese carries meaning at a density the other eight
cannot match, so a faithful translation of a dense source legitimately comes out longer. They are
worth a glance and are then dismissed, which costs a minute. What must not happen is the bands
being tightened until the report is empty: an empty report is the check having stopped working,
not the corpus having improved. A backstop that never fires is indistinguishable from one that
was never written.

**A short form is exempt, because being shorter is its job.** Measured against the source it
shortens, the ratio says only that it did it. The long form of the same field is measured, which
is where padding shows up in any case.

**It would have caught the case that prompted it, but only just, and the reason is worth keeping.**
Seven of the eight locales padded by about the same amount, which moved the sibling centre with
them and left that half silent; one flag survived, on the Japanese, from the absolute half. One
flag on a segment is the whole intent -- it is read by a person, who then reads all eight. A check
that had to name all seven to be useful would need to know what the source means, and then it
would not be a length check.

## A Latin character is measured, not averaged

The estimate charges Han and kana a full square and Hangul 14.0 of one -- measured at 13.84,
rounded up rather than down because undercharging is the direction that clips -- because those
two are near enough constant. Latin is a table of 137 measured advances instead, because an average there
is not a small error: `i` advances 4.03px and `W` 16.40, and a single figure chosen safely above
both charges an ordinary sentence about a tenth more than it draws. Measured over the corpus, a
Latin character averages 7.72px with the widest string at 8.55px, and 8.55/7.72 is that tenth.

That tenth is not free. It is a tenth of every budget, taken from the copy, and it is what left a
Spanish subtitle three pixels of room on a line that needed four -- the same line was refused
twice before the table replaced the constant, and landed on the first attempt after. The table
also caught a French short title at 187px against a 186px budget that the constant had waved
through at 181.

The advances are measured rather than read out of the font: each character is drawn twenty times
on a canvas at the size and weight a card title uses, and the run divided by twenty. The heavier
of the two faces these budgets cover, so a subtitle is charged slightly over and a title exactly.
Against whole strings the sum lands within 3px of what the browser renders and always above it,
because kerning only ever brings real text in narrower than the sum of its advances -- the
estimate errs the one way it may.
