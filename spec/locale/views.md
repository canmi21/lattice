# What a view says it is

How an article view declares the language it is in, how it tells a reader that what they are
reading was translated, and when a translation is close enough to its original to defer to it.
Which view a given reader is served is [addressing.md](addressing.md).

## The original view reads in the article's own language throughout

Every view resolves its text at its own locale. `mw` is the exception worth stating, because it
has no locale of its own to resolve at: the summary and every image description it shows are the
ones written in the _article's_ language, not translations of them and not the English the
descriptions happen to be authored in.

The alternative was the accident it replaced. Asset descriptions are generated in `en-US` and
translated outward, so the original view was resolving them at `en-US` by default -- a reader of
a Chinese original heard every picture described in a language the article never used. The
summary would have inherited the same shape.

The rule is one sentence: on `mw`, anything with a per-locale version is taken at the locale the
article's `lang` names. The interface chrome is the deliberate exception
[addressing.md](addressing.md) names -- that is English, because chrome belongs to the site rather
than to the prose.

## A translated article identifies itself

Every non-original article view places a blue note directly below the metadata row. It says in
the current view's UI language that the reader is seeing a translation and names the source
language in that same UI language. The source-language name is the link back to `mw`; ordinary
activation writes the cookie and reloads like the menu, while its `?lang=mw` address remains a
no-JavaScript and modified-click fallback. The original view has no note, because labelling
untouched content as untranslated would repeat what the language switcher already says.

This notice is a state indicator rather than article content. Keeping it beside the metadata
makes its scope clear before the reader reaches the body, and blue is reserved here for the
translated state rather than becoming a general article accent.

### The feed carries the same sentence, and needed it more

An entry in a translated feed opens with the notice, from the same messages and the same helpers
the page uses. The feed was the one place a translation arrived unannounced, and it is the place
where that costs most: a reader who follows a link chose the page, while a subscriber to
`?lang=ja` is handed every article and is the least likely to notice the language changed under
them.

The case it exists for is the third one. An article a locale has no translation of is served as
the source rather than as a 404 -- so without the notice a Japanese subscriber simply receives an
English article with nothing saying why.

Three differences from the page, each forced by what a feed is. There is no short reading,
because a feed has one column and the reader's own client decides the width. The locale is passed
to the message rather than taken from the request: a document assembled for `?lang=` has no
negotiated locale, and asking for one is an error rather than a wrong answer.

**And the link spells out `?lang=mw`, where the page links the bare address.** That is not a
detail. A bare URL negotiates from the reader's cookie, and the cookie of someone reading the
Japanese feed says Japanese -- so the one link that means "show me the original" would answer
with the translation again, silently, for exactly the reader it exists for. The page can link the
bare address because its handler switches the view before the browser goes anywhere, and the
`?lang=mw` form is only its no-JavaScript fallback. A feed is that fallback, always.

### A link without a router names its view; a link with one does not

The rule the notice's link is one case of. **Every internal link in a feed or a `.md` document
carries `?lang=`, the source view's `mw` included. Every internal link on a page carries none.**

What decides it is whether anything will correct the address afterwards. A page's navigation is
the client router's: it keeps the view the reader is in, so a card showing a Japanese title
reaches the Japanese article without the markup saying so, and writing the language in would be a
second copy of a fact the router already holds. A feed has no router and no second chance. A bare
address there is resolved by the server against whatever the reader's cookie happens to hold,
which for a sentence they just read in Japanese may be any of nine answers -- including the right
one, which is what makes it hard to notice.

So the feed's renderer rewrites the prose HTML it shares with the page, an `::article` card names
the view it was rendered for, and the markdown target names `mw` because the document is the
source. Three things are left alone: an address outside this site, a bare `#fragment`, which
points inside the entry, and a link that already names a language.

### Every navigation inside the site is the router's

Once hydrated, nothing on this site replaces the document on purpose. The reader stays in one
page for the whole visit, and the two things that used to break that were both language changes:
the switcher menu, and the notice's way back to the original. Both now fetch the view and call
the same `chooseLocale`, so there is one way to change language rather than two.

Two full navigations remain and both are deliberate. A server-only document -- `atom.xml`,
`sitemap.xml`, a licence text -- carries `data-sveltekit-reload`, because it is not a page and
the router has nothing to render. And `orReload` turns a failed fetch in the browser into a
document navigation, because the server path still works and the alternative is a click that does
nothing.

### Two states, because a reader may already speak the article's language

A Chinese article read at `zh` is neither the original nor a translation in the ordinary sense.
The view exists because every language gets one, and what it holds is the article regularised --
a misspelling corrected, a mark normalised -- not carried across a language boundary. Telling
that reader they are reading a translation is simply false, and it is false in the one direction
that costs something: they are the reader best placed to go read the original, and the notice
would give them no reason to.

So the copy is a matrix of state against interface language rather than one sentence per
language. When the view's language differs from the article's, the notice names the source
language and links it. When they match, it states the language plainly, says the version may
carry small changes in wording, and recommends the original -- with the link on the word for the
original, since that is what is being recommended rather than merely named.

### `lang` names the main language, not the only one

An article may mix languages. Frontmatter carries one tag because one tag is what an author can
honestly give: the language most of it is in. Every sentence built on that tag has to stay true
of an article that is mostly rather than wholly in it, which is why the notice says "mainly",
"principalmente", "主に" rather than asserting the article simply is in that language. The
qualifier is not hedging -- it is the actual strength of what `lang` records.

### A third state: the same language, the other script

Chinese is published here under two scripts, so a Simplified article can be read at `tw` by
someone who reads Simplified perfectly well. That is neither of the first two states. Nothing
was translated and nothing was polished; characters were mapped. Announcing it as a translation
overstates the distance by a whole language, and announcing it as a light polish understates why
the reader should move -- they can read the original exactly as written, and the only thing
between them and the author is a script they already know.

This state is checked before the translated one, since an article whose language has a sibling
script would otherwise fall through and be described as translated.

Its copy is keyed by the two Chinese views alone rather than added as a third row to the matrix.
The state is reachable only from the view that _is_ the sibling script, so six of the eight rows
could never be shown; a table that can only ever be two-thirds filled is the wrong shape for the
fact, and an optional row would let a real gap look deliberate.

That word is held separately from the same word as a menu row label. English capitalises a
label and not a mid-sentence noun, German capitalises both; one string cannot be correct in both
positions, and merging them would fix one language by breaking another. This is the exception
that proves the one-fact-one-home rule rather than a violation of it: two grammatical positions
are two facts.

### The script is part of the name

A source language is named with its script wherever the script distinguishes it. Chinese is the
only such case here, and `Intl.DisplayNames` already spells the distinction out in every
interface language, so the script is restored onto the tag before it is handed over rather than
eight names being written by hand. `zh` alone answers "中文" or "Chinese", which covers both
scripts and therefore names neither.

This applies to the notice, which spells the language out in full. The switcher's own row for
the original stays short on purpose -- see the compact-label rule in
[interface.md](interface.md) -- and naming the script
there would fight the reason that label is abbreviated at all.

Keeping it out also keeps an unvalidated value away from the one attribute where a bad value is
destructive rather than merely wrong. Frontmatter `lang` still reaches `<html lang>`, where an
error mislabels a page; in an `hreflang` it would discard the whole set.

**An `hreflang` URL must be the canonical URL of the page it names.** Point one at a page that
canonicals elsewhere and the entire set is discarded — which is what makes the next rule a
correctness requirement rather than a tidiness one.

### A fourth: the language has no version of this article yet

Then the notice names two languages rather than one -- the one that was asked for, and the one
being shown instead. It reads `这篇文章暂未提供简体中文的版本，已为你显示 English (US)`.

The language asked for is the folded endonym, `简体中文` rather than `中文 (简体)`: it sits inside a
sentence, qualifying a noun, and a bracket between the two reads as an aside. The language shown
is the closed switcher's own phrase, `English (US)`, so the notice and the control above it name
the same thing the same way. An article in a language this site publishes no view of has no such
phrase and keeps the language spelled out in the reading view.

**The final stop is dropped, in all nine.** The notice is one sentence alone in a strip of its
own, now ending on a bracketed label, and a period after `(US)` reads as clutter rather than as
punctuation.

**Where the space before that label goes is decided by the characters, not by the locale.**
Chinese writes `已为你显示{source}` with nothing between and is right to, until the value turns out
to be Latin. Japanese puts a comma there and needs none. Korean has typed one already, and so has
every Latin sentence. The message is therefore rendered once with a placeholder, and
[spacing.ts](../../apps/site/src/lib/locale/spacing.ts) reads the two characters that actually meet.
A per-locale flag would instead record which shape each sentence happens to have, and go stale
the first time one was rewritten.

Korean takes the value with `입니다` rather than an object particle. `을` and `를` are chosen by the
sound before them, and `English (US)` ends in a bracket -- a form no rule can pick correctly, and
the one place in these nine sentences where the grammar depends on the value.

## A translation identical to its original defers to it

An article written entirely in one language will come back from that language's translator
almost unchanged. Two of the nine views are then the same text at two addresses, and the pair
competes with itself.

**When a locale is at least 0.90 similar to the original after normalisation, that locale
canonicals to the bare URL instead of to itself, and its `hreflang` entry points there too.**
Below the threshold it is a translation like any other.

### The comparison is over translatable content only

Only the translatable spans are compared: the source text of those spans against the translated
text of the same spans. Not the assembled views.

This was got wrong first and the wrong version shipped, so the reason is worth stating. An
assembled view is mostly material both sides share — code blocks, links, markdown structure,
untranslated frontmatter — so scoring whole views largely measures how much code an article
contains. Every score rises, and they rise by different amounts per article. Measured that way,
`zh-TW` scored 0.943 on one article and folded into the Simplified original, while scoring
0.890, 0.706 and 0.606 on the others: the same language behaving differently per article, which
is harder to diagnose than behaving wrongly everywhere. Japanese sat at 0.850, one code-heavy
article from the same fate.

Comparing translatable spans separates the cases cleanly. When this rule was measured, the
locale sharing an article's language scored 0.947 to 1.000 -- same-language views were then
verbatim copies -- while every other locale scored 0.719 or below, and nothing landed between.
The homepage was the useful check while it was translated: written in English, `en` scored 1.000
and deferred while `zh` scored 0.495, so the rule follows the article rather than assuming
Chinese. **That is history and not a standing control.** `contents/homepage.md` carries no
`.i18n.yaml` sidecar where the seven articles do, and the English-source side went unmeasured
when the homepage stopped being translated -- which is what
[indexing.test.ts](../../apps/site/src/lib/content/build/indexing.test.ts) records, and what this
passage went on offering in the present tense after it had stopped being true. The measurement
stands as the reason the rule is written the way it is; nothing checks it today.

Since [i18n/prose.md](../i18n/prose.md) made same-language views genuine localisations, the corpus's zh views
measure 0.570 to 0.682: still far above every real translation, no longer above the threshold.
So today nothing folds, every locale carries `?lang=`, and the bare URL is the Original alone --
the anticipated outcome below, arrived at. The rule stays, measured by the test named above,
for the view that scores high again: a single-language article whose localisation has little
to regularise.

Exact equality was tried before either of these and rejected: only 40 of 52 segments in one
article matched byte for byte, so the rule would never have fired in the case it exists for.

### The threshold is not centred, on purpose

0.90 sits nearer the top of the gap the original measurement found, 0.719 to 0.947. That is
the safer end.

Folding wrongly sends a reader to a language they did not ask for and drops a translation
somebody paid for out of the index. Failing to fold leaves a near-duplicate, which a crawler
consolidates by itself. The two mistakes do not cost the same, so the boundary leans toward not
folding.

This also removes the question of what to do when articles start mixing languages, which
[i18n/segments.md](../i18n/segments.md) says they will. A mixed original produces a Simplified Chinese view that
genuinely differs from it, the similarity drops, and the rule stops applying on its own without
anyone revisiting it.
