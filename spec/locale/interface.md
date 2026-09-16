# The site's own words, and the control that changes them

The language switcher, what it names each language for whom, and the message catalogue the
interface itself is written in. None of this is article content, which negotiates separately --
see [addressing.md](addressing.md) for that and [i18n/](../i18n/) for where a translation comes
from.

## The switcher names languages for their own readers

The article metadata row carries the content-language switcher, and so does any page that wants
it -- `/licenses` does. It is separate from UI-message translation. Its trigger shows a globe on
`mw` and a languages icon on a translation.

### The closed control names a language; the menu names the choices

They are not the same label, and the trigger is not the current row. A row is read with the whole
list beside it and can afford to say `Original`; the trigger stands alone in a metadata row and
has to answer what is being read without that context. So it reads `简体中文 (CN)`, `English (US)`,
`日本語 (JP)` -- the language as its own readers write it, and the region beside it.

**The region, never the `?lang=` code.** `zh` and `tw` are one language published in two places,
and `CN` / `TW` is what separates them; it is also the answer `Original (CN)` has always given.
Putting `ZH` there would move an internal code into the interface, which is the one thing the two
vocabularies in [addressing.md](addressing.md) exist to prevent.

**The Chinese names are folded, and only the Chinese ones.** `@canmi/locales` writes them as
`中文 (简体)` and `中文 (繁體)`, which is right for a menu row and wrong for a label that already
ends in a bracket -- `中文 (简体) (CN)` reads as two afterthoughts. Chinese is the only language
here whose name splits by script, so the fold is applied to it by language rather than to any
endonym that happens to carry brackets. The menu row keeps the endonym unfolded.

On the original view the trigger names the language the article is written in, so an original
Chinese article reads `简体中文 (CN)` there while its menu row still reads `Original (CN)`. The
trigger and the row are answering different questions. An article in a language this site
publishes no view of keeps `Original (IT)`: there is no endonym to show and no region that would
mean anything. A page is not that case -- it has the site's own language, and reads
`English (US)` like anything else written in it.

### A page names the site's own language, which is what its tag already says

`Original (CN)` names the language of the thing being read, and a page has one as surely as an
article does. Its prose is the site's own copy, English by the rule below, and the worker has
always declared it: `<html lang="en-US">` goes out over `/` and over `/licenses` alike.

The row used to read `Original` alone there, on the grounds that a page is not written in a
language. That was the switcher declining to name a language the document beside it was naming,
and it left the homepage's closed control reading `Original` where every article reads a
language. `SITE_LANGUAGE` in [locale/index.ts](../../apps/site/src/lib/locale/index.ts) is now the
one place that fact is written, and both readers of it -- the tag and the switcher -- take it
from there.

**The row itself stays**, for a reason that has nothing to do with the qualifier. The switcher
writes one cookie that governs the whole site, and preferring the original is a different answer
from preferring English the moment the reader opens an article. Dropping the row on pages would
quietly take that choice away from whoever happened to be standing on one.

Two rows can therefore look alike on a page: `Original (US)` and `English` show the same thing
while they are being read. They are still two answers, and the difference appears on the next
article.

### The original view labels itself in English

`mw` is a locale like the other eight and its messages are its own, but the words _around_ the
article are English there rather than the article's language. The original is where an author
mixes languages freely; an interface that tried to follow that has nothing to follow. English is
the one choice that does not claim the chrome belongs to whichever language happens to dominate
the prose.

That decides the row beside it too. `mw` is not in the compact-script set, because the set is
about what the label is written in and the label now reads `Original` -- so the language beside
it is a region code, `Original (CN)`, exactly as it is for every other Latin-script view.

The eight translation rows are fixed endonyms and do not change with the active view. The
original is a separate first row: its name is derived from the article's own language tag and
is marked `Original`, because `mw` names authorship rather than a language. Consequently an
original Chinese view and the Simplified Chinese translation may share a displayed language
name while remaining visibly distinct rows.

Selection compares internal codes. Equal codes close the menu; different codes write the
preference cookie and reload the document. Comparing public language tags would make a
same-language translation unreachable, while client routing would leave the worker's resolved
document language behind the content being shown. The query URLs remain crawler addresses and
the no-JavaScript fallback, not the interactive switching transport.

The trigger exposes its expanded state, the selected row is announced, and the menu supports
native activation plus arrow, Home, End, Escape, and Tab keyboard behaviour. Endonyms help a
reader find the right row without first understanding the current content language; keyboard
and screen-reader access are part of that same requirement.

## UI messages come from Paraglide, which negotiates nothing

Interface strings compile through Paraglide JS. Article content does not -- that is a separate
pipeline, see [i18n/](../i18n/).

Loading labels and transient action feedback are interface strings too. A Mermaid placeholder and
a code-copy success state may live inside authored material, but they describe what the site UI is
doing rather than what the author wrote; their visible copy, accessible names and failure messages
therefore come from the same Paraglide message table in every locale.

Paraglide is a consumer here, never a decider. Its strategy array holds one entry,
`custom-negotiated`, with no built-in strategy behind it, and that strategy reads back the code
the worker already resolved. The reason is the fourth input [addressing.md](addressing.md) lists:
an article's own language is
content-dependent and no library strategy can see it, so approximating the chain with `cookie`
plus `preferredLanguage` would leave two negotiations to disagree in exactly the cases that
matter. The `url` strategy is absent and there is no `reroute` hook, because a locale never
appears in a path here and there is nothing to delocalize.

The client reads that code from `<html data-locale>`, stamped by the server the same way the
theme class is. The preference cookie is readable but remains only one input: a query may have
overridden it, and the article supplies the final fallback. Reading the server's resolved answer
avoids duplicating negotiation and guarantees hydration describes the view that was rendered.

### Two fallbacks that are not the same fallback

`baseLocale` is `mw`, matching the negotiation default in [addressing.md](addressing.md), and the
match is a coincidence of
answers rather than one rule stated twice.

Negotiation picks **which view** a reader is given, and lands on the original because the bare
URL is the `x-default`. `baseLocale` supplies **a string the chosen view is missing**, and lands
on the original because that is the one text always written and so the only one that can always
answer -- a reader on Korean who meets an untranslated key sees the original's wording rather
than a blank.

Two questions, two arguments, one answer. Moving either because the other moved would be
changing a decision that was never made.

### Locale identifiers stay internal

Paraglide is configured with the internal codes, `mw` and `tw` included. It never emits them
into a public attribute -- with `url` off they reach no address, and `<html lang>`, `hreflang`
and `og:locale` still go through the mapping table in [addressing.md](addressing.md). `mw` is a
locale like any other here,
not a placeholder: it is the author's own voice, mixed as they please, and the interface is part
of what is being read in the original.

### Keys are dotted, and read off the namespace

Message keys are `flat.dot.key`. Paraglide exports each one under its literal string
(`export { notice_polished as "notice.polished" }`), so a key is always read as
`m['notice.polished']` from a namespace import.

The obvious alternative does not work. `import { 'notice.polished' as noticePolished }` is valid
ES2022, type-checks, and survives the production build -- and is `undefined` at runtime under
the dev server's transform, which turns every article page into a 500 that no check catches
because the tests and the build both pass. It was tried; the namespace is not a preference.

The namespace is written one way: `import * as m from '$lib/paraglide/messages'`. The generated
module also re-exports itself as a named `m`, put there so an editor can auto-import it, and
`import { m }` names the same object -- five files were written that way once and read the same.
One spelling, because a reader grepping for how messages are imported should find one answer.

The cost of dots is therefore paid in the linter: `import/namespace` rejects computed access and
is turned off, on the grounds that the compiler already performs that check and names the
offending key when it fails. See `.oxlintrc.json`.

Modules under `src/lib` that tests import use relative paths rather than `$lib`, because the
root vitest run resolves no alias.

### A markup message must exist in every locale

A message containing markup compiles to a `parts()` accessor. A locale missing that message
falls back to a plain string function which has no `parts`, and the generated dispatcher then
reads a property the type does not have -- the runtime guards it, the type check does not.

So `baseLocale` covers a missing _translation_, never a missing _shape_. The script-conversion
notice is written in all nine even though only the two Chinese views can display it: six of
those sentences are unreachable today, which is a smaller cost than a type error in generated
code that nobody can edit.

### Two traps worth writing down

The project directory is `apps/site/.inlang/`. The SDK refuses any path not ending in `.inlang`,
so the entire name is the suffix -- a directory called `inlang` loads fine once its metadata
exists and fails on a fresh clone, which is the worst way for this to be discovered.

The compiler reports success when it has loaded no plugin and found no messages. A wrong
`modules` path or a wrong `pathPattern` prints `✔ Successfully compiled` and emits an empty
index; both are resolved relative to the project directory's _parent_. When messages vanish,
check that first rather than the message files. The plugin is a local dependency rather than the
CDN URL the docs show, which keeps its version in the lockfile and out of `libs/urls`.
