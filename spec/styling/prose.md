# How a line of article prose is set

Where a line may end, what its figures do, and the two marks that interrupt it. Which of the three
systems writing CSS is entitled to say each decision here, and what happens where two of them say
the same thing, is [architecture/css/layers.md](../architecture/css/layers.md).

## A number's treatment follows the role it plays

The `value` cells in [app.css](../../apps/site/src/styles/app.css) give a number its own boxes and
a monospace face. They were built for the subscriber count, and what earns them is that the
number is **live and answers to the reader**: it changed because somebody joined, and it may
change again while the page is open.

A number that is simply true of the site does not earn boxes merely by being numeric. In running
prose it takes the surrounding text's own figures. A repeated trailing metric column has a
different job: the licence directories end each row or section with a package count, and
monospace tabular figures let those narrow values scan as one column. Soft ink and the absence of
boxes keep them subordinate to the names they quantify; this is directory structure, not a live
state.

**A live count takes tabular figures wherever it is set in proportional type.** Inter's digits are
not the same width -- `1` is 6.6px against `4`'s 10.5px at the Support rail's size -- so a reader
who gives a like watches the pill resize itself and push the two pills beside it, as the direct
result of the press they just made. Tabular figures give every digit the widest one's advance, so
the width answers only to how many digits there are, and that change has a reason the reader can
see. The feature belongs to the same proportional font and is not a monospace face: only the
digits take the fixed advance, and the word beside them is untouched.

That is the general form of what the `value` cells do by other means. A boxed monospace number
holds still because the face holds every glyph still; a number set in running type needs the
figures asked for by name. Both exist for one reason, that a number which answers to the reader
must not move the page while answering.

Counts below one thousand stay as whole numbers. At one thousand and above, compact indicators
use the shared `compactCount` notation: lowercase `k`, uppercase `M`, and a decimal only while it
carries useful precision (`1k`, `1.5k`, `16k`, `2.3M`). This applies to the licence metric columns
as well as stat rows and chart axes. A count written into prose remains complete and
locale-formatted through `Intl.NumberFormat`; compact notation is for a bounded indicator, not a
sentence.

## Where a line ends is declared per language

Article prose carried no line-breaking policy at all until this was written. `.article-content`
matched no CSS rule anywhere in the repository -- it was a hook for the note handlers and nothing
else -- so every property governing where a line ends was whatever the browser had. Measured on
the Simplified Chinese view before any of this: `text-wrap: wrap`, `hyphens: manual`,
`word-break: normal`, `overflow-wrap: normal`, `line-break: auto`, `text-spacing-trim: normal`,
`text-autospace: no-autospace`. All initial values, none of them chosen.

**The policy is keyed on `:lang()`, never on a locale code.** `<html lang>` already carries the
resolved language, and for the `mw` view that language is the article's own rather than a fixed
one -- see [locale/addressing.md](../locale/addressing.md). A rule written against the language reaches that view without
having to know it exists, and it reaches the bare tags a frontmatter `lang` supplies (`zh`, `en`)
as well as the full ones the eight translations carry (`zh-CN`, `en-US`).

**The shared block pins the defaults, and pinning them changes nothing today.** That is the
point. These are the values a browser is still free to move, and two of them are moving:
`text-spacing-trim` and `text-autospace` decide how a CJK line treats its punctuation and the
seam between Han and Latin, so a default changing under us reshapes every Chinese, Japanese and
Korean paragraph on the site with nothing here edited. `no-autospace` is also the value this
corpus wants rather than the one it happens to have, and the section below says why: the space
between a Latin word and a Han character is a real space somebody typed, so a browser inserting
its own would be spacing that seam twice.

Everything below was measured on `compile-time-rendering`, the longest article in the corpus,
across the forty-odd multi-line paragraphs each view has, at both widths the column is ever drawn
at: 672px, which is where it stops growing, and 354px, which is an iPhone. The narrow half was
measured in Safari on the simulator rather than a desktop browser narrowed to look like one --
that distinction turned out to carry the whole result.

### Two rule sets, because the trade reverses with the column

A language that breaks between words wants two things that fight each other: a tight right edge,
and a final line that is not a stranded word. Which one is worth buying depends on how wide the
column is, so the policy has a narrow half and a wide half and they choose differently.

**Narrow is the base case and it buys the right edge, with `hyphens: auto`.** At 354px an
unhyphenated column is ragged on every screenful, and hyphenating collapses it. Mean gap between
the end of a line and the right edge, as a share of the column, and the count of lines standing
more than an eighth short:

| view    | gap, filled | gap, hyphenated | loose lines, filled | loose lines, hyphenated | of |
| ------- | ----------- | --------------- | ------------------- | ----------------------- | --- |
| German  | 9.7%        | 4.5%            | 215                 | 7                       | 776 |
| English | 7.5%        | 4.7%            | 120                 | 23                      | 624 |
| Spanish | 8.6%        | 4.3%            | 191                 | 10                      | 755 |
| French  | 8.4%        | 5.0%            | 180                 | 37                      | 767 |

The price is a handful of paragraphs whose last line comes out shorter -- English 6 to 10,
Spanish 4 to 7, French 9 to 11, German unchanged at 8. That is paid once per paragraph against a
gain paid once per line, and at this width there are seventeen lines per paragraph.

**Wide buys the final line, with `text-wrap: pretty`, above `--rail-column`.** The breakpoint is
the width at which the column stops growing, so the rule changes exactly when the column becomes
the measure it was designed at rather than whatever the window left it. At 672px the right edge
is already tight without help -- German sits at a 4.6% mean gap -- so hyphenation has little left
to win, and `pretty` has little left to spend: no extra lines at all, and the stranded final
lines go 10 to 2 in German and 9 to 0 in English.

**`text-wrap: pretty` is absent from the narrow half, and finding out why is why the phone was
used.** It was adopted on Chrome's implementation, where it is free. WebKit's is a different
thing wearing the same name. At 354px it adds lines in every language, eleven in German and
forty-two in Japanese, and it roughly doubles the right-hand gap everywhere: German 9.7% to
12.8%, with loose lines going 215 to 400. It still does what it was bought for, but on a narrow
column it charges every other line on the screen for it.

That is also the caution this section exists to carry. A property measured in one engine has been
measured in one engine. `pretty` looked free because Chrome's is; the number that mattered was
only visible in WebKit, and only on a column narrow enough for the cost to show.

**Neither property reaches Chinese, Japanese or Korean, at either width.** That scoping was
written on Chrome evidence, where `pretty` is a no-op for CJK, and WebKit is the reason to keep
it rather than relax it: there `pretty` took Japanese from a 1.6% mean gap to 7.9% and from one
loose line to fifty-eight, in exchange for final lines those scripts barely strand.

`balance` is rejected at both widths and for the same reason each time. It clears final lines
about as well as `pretty` does, but it pays across the whole paragraph rather than at its end: at
672px it took English from two loose lines to eighty-six. It stays on titles, where a block of
even lines is the point -- the table of contents labels and the note list.

**Japanese gets `line-break: strict`.** Japanese typography forbids certain characters at the
head of a line, and `auto` does not enforce it: twelve lines in this article opened on one, eight
of them on the long vowel mark `ー` and the rest on small kana. `strict` removed all twelve and
cost no lines at all, 328 either way. This is the clearest case on the page -- a rule the script
has always had, applied by a value that is free.

It holds on a phone unchanged: at 354px the same article opened fifteen lines on a forbidden
character and `strict` cleared all fifteen for one extra line out of 608.

**Korean gets `word-break: keep-all`.** Korean is written with spaces, but the default treats it
as breakable between any two syllables, so words split mid-eojeol: 110 times across 262 lines
here. `keep-all` removes every one of them for eight extra lines, a three percent taller column.
That is the trade this site takes, because the reader's word staying whole is worth more than
three percent.

On a phone the fault it fixes is worse, not better: at 354px the default split a word 238 times
across 491 lines, nearly every other line, and `keep-all` again removed all of them -- for 15
lines rather than 8, and with nothing overflowing at that width.

The risk `keep-all` introduces is a long unbreakable run overflowing a narrow column, and it was
measured rather than guarded against. Nothing overflows down to a 240px column; the first failure
is at 200px, on a Korean parenthetical glued to a Latin initialism with no space between them.
The article column never gets near that, so no `overflow-wrap` floor is written. If one is ever
needed this is the paragraph that predicted it.

**Chinese gets nothing beyond the shared block, and that was measured too.** `strict` was run
against `auto` on both the Simplified and Traditional views: identical line counts, 223 and 224,
and no line opening on punctuation under either. Chrome already applies the rule for Han, so
there is nothing to buy. Both Chinese views take one configuration, which is also what the corpus
wants -- the two scripts differ in their glyphs, not in where a line may end.

What Chinese must not be given is Korean's rule, and the phone is where that would have been
found out. `keep-all` on a 354px Chinese column overflows thirteen paragraphs outright and takes
the mean right gap to 22.5%, because Han has no spaces for it to keep whole. The `:lang(ko)`
selector is load-bearing rather than tidy.

## Latin inside CJK is spaced with a real space

A Latin word set directly against Chinese or Korean needs air on both sides, or
`来自crates.io和npm` reads as one unbroken run. The space is a real one, the same character a
person typing that sentence would use.

Authored copy carries them already, in every locale and in the articles, and they are never to
be stripped. What needed solving is text this site _assembles_: `Intl.ListFormat` joins two
registry names with a bare `和`, and no author was there to type anything.
[spacing.ts](../../apps/site/src/lib/locale/spacing.ts) inserts one at each boundary, and the
component keeps it outside the anchor, or the link's underline is drawn under the gap.

**Only script letters count, never punctuation.** A full-width `，`, `。` or `、` already carries
its space inside the glyph, so `npm，` stays tight and Japanese lists, which join with `、`,
gain nothing. Matching on Unicode script properties rather than a block range is what draws
that line.

`text-autospace: normal` was tried first and removed. It does work -- measured, it applies, and
it applies across element boundaries -- but Chrome implements the property's eighth of an em,
which came out at 2px against the 4.4px of a real space, and no other engine ships it. A rule
that lands on one browser and is invisible when it does is not worth the line it takes.

## An article rule is a pause, not a wall

A Markdown thematic break inside article prose renders as five short strokes in the strong border
colour. Together they occupy roughly three sixteenths of the text measure and stay centred, because
the mark separates thoughts rather than dividing the page into structural regions. The strokes are
two pixels thick: enough to remain deliberate at that short length without becoming a structural
rule. Generous vertical space supplies the pause the compact mark implies.

## A quotation borrows a quiet surface

A source quotation in article prose stays a native Markdown blockquote. It does not become a custom
note directive: quotation is its meaning, while a note would describe an aside written by the
article's author and would erase that distinction from feeds and plain-text consumers. The rendered
quote uses the quiet hover paper as a slip behind the prose, with a two-pixel strong-border rail at
the start edge and rounded corners only where the slip is free. This is enough separation to make a
quoted instruction scannable without giving it the visual weight of an interactive card or a
warning. Multiple paragraphs keep a small internal gap so the slip remains one quotation.
