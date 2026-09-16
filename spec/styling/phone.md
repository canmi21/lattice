# What a narrow screen is shown

One source, two compositions: which words a phone gets, which controls it keeps, and how the copy
is written to a shape rather than a length. Which of the three systems writing CSS is entitled to
say each decision here, and what happens where two of them say the same thing, is
[architecture/css/layers.md](../architecture/css/layers.md).

## The homepage carries the content-language control, below the bio

Content language is a setting for the whole site, and the homepage is where somebody arrives
without having come to read one particular thing. It carries the switcher on its own quiet row.

**Below the bio rather than beside the name.** The bio is identity copy and is rendered from the
source in every view -- see [i18n/copy.md](../i18n/copy.md). A switcher placed above it would be a control
whose first use appears to do nothing, which is the worst thing a preference control can look
like. Under the bio it sits exactly where its effect begins. Measured, that costs no findability:
the row lands around 330px on a wide window and 380px on a narrow one, well inside the first
screen either way.

The row has no heading and no rule above it. This is page furniture, and what it writes belongs
to the site rather than to this page; a divider across the column would frame it as a section and
imply the setting stopped there.

### The phone reads a shorter bio, and it is the same bio

The bio is identity copy and is never translated, so a narrow screen cannot be given a different
text without there being two texts to keep in step. There are not two. The markdown carries one
bio and four markers say what a narrow screen does with parts of it.

| Marker    | Compiles to        | What it means                           |
| --------- | ------------------ | --------------------------------------- |
| `wide`    | `hidden sm:inline` | Present only on a wide screen           |
| `narrow`  | `sm:hidden`        | Present only on a narrow one            |
| `ownline` | `max-sm:block`     | Takes a line of its own on a narrow one |
| `apart`   | `max-sm:mt-4`      | And a paragraph's gap above it          |

`narrow` is the only one that adds words rather than removing them, and it earns that before it is
used. Subtracting left the first paragraph ending mid-thought, and the sentence that finishes it
costs the desktop composition a fourth line with an orphan on it -- measured, that paragraph's fill
drops from 84% to 76%. A `wide` and `narrow` pair also carries the second paragraph's two openings,
which are one sentence in two word orders: the phone's avoids two paragraphs in a row beginning
with `I`, and the desktop keeps the one that was written for it.

`ownline` and `apart` are separate because a line of its own and a break before it are two
decisions, and an author may want only the first. `apart` uses the gap the bio already puts
between paragraphs, so the space it opens is the one the page already has rather than a second
number.

Only the page reads them. The markdown and text targets carry no classes, so `/homepage.md` and
anything reading it get the whole sentence; a feed reader has no stylesheet and gets it too.

**That is exact for `wide` and approximate for `narrow`.** A marker that only removes leaves the
other targets reading the full text, which is what they should have. A marker that swaps leaves
them reading both halves in a row -- `/homepage.md` says `I hope somedaySomeday I hope`. It is a
known cost of the pair rather than a defect in either, and the fix, if it is ever worth one, is for
those targets to read the markers too.

**Subtracting on a phone is a layout decision, not an edit** -- which is also why the copy that
disappears is the one sentence that enumerates rather than says anything: on a phone it is the
first thing that reads as a list, and it carries the two unbreakable runs that made the paragraph
rag badly in the first place.

**A link carries its own width, because it is the one run that cannot be wrapped.** `:link`
nested inside `:t` stops being a link, so the four markers above cannot reach it -- and the email
link needs two forms, `drop me an email` on a wide screen and `Email` on a phone, where the
capital is doing the work the dropped words did. So `wide` and `narrow` are read off the `:link`
directive itself and travel with the segment.

They are spelled as variants there, `max-sm:hidden` and `sm:hidden`, where a `:t` run says
`hidden sm:inline`. A span has no display utility to argue with; a link is `inline-flex` for its
icon, and `hidden` is the same kind of declaration at the same level, so which of the two won
would be settled by Tailwind's emission order rather than by anything written here. A variant
sorts after a plain utility and is not that argument.

**Mark the run before a break, never the run after it.** A `:link` rendered inside another
directive stops being a top-level node, and the homepage renders those live so their icons come
from the shared component -- nested, they come back as plain anchors, and the accessible new-tab
note comes back as the source file's absolute path. Wrapping the sentence that ends a line has
the same effect on layout and none of that.

Nothing responsive is written on the container's own wrapping style. The desktop composition was
tuned as it stands, and a `text-wrap` that changed with width would change it; the difference
between the two readings lives entirely in the markdown. The one exception is the container's top
padding, which is halved below `sm`: 6rem is most of a phone screen before anything is read, and
the space under the footer is not competing with anything.

## Phone copy is two lines, and the second is the shorter one

Every translated block of interface prose is written to a shape rather than a length: two lines on
a phone, or one line followed by a shorter one. Never a third line holding a fragment, and never a
second line longer than the first. A trailing three words read as an accident, and an ascending rag
puts the widest line at the bottom of a block the eye is leaving.

The rule is about the rag, so it is checked by measuring, not by counting characters. Each
candidate is rendered at the phone's column width and the rendered lines are read back; the copy is
then written to the measurement. English gained a word to make its first line fill -- `sent
straight to your inbox` rather than `straight to your inbox` -- while German and Spanish each lost
one to come back from three lines to two. Nine locales cannot all be trimmed the same way, so each
is tuned against its own rendering.

**The newsletter pitch swaps two elements; the bio swaps markers inside one string.** The two
mechanisms differ because the bio is identity copy rendered from source in every view, while the
pitch is translated nine times. Markers inside one string work when there is one string; here the
short pitch is its own message key, and the component renders the long one above `sm` and the short
one below it. Both are always in the document and CSS chooses, so the choice survives the server
render.

**The translation notice is written to the same shape, and it is the harder case.** The pitch is
one string; the notice is four -- a translation, a polished source view, a script conversion, and
a language this article has no version of -- and each is written nine times. All thirty-six carry
a `.short` sibling, and the component renders both readings with CSS choosing, which is the
pitch's mechanism rather than a second one.

The target is stated as a shape, not a length: one line filled to at least 85% of the box, or two
lines whose first is at least 88% and whose second falls between 60% and 90% of it. A second line
under half the first is the stub this rule exists to prevent -- the German notice used to end on
one at 45% -- and a second line as long as the first is the ascending rag. Where the copy would
not fit either shape, the sentence loses a clause rather than being allowed a third line: the
short `polished` no longer names the language the article is written in, because the reader of a
source view already chose it.

**The short copy is measured on the narrowest phone, not a convenient one.** The box is 316px on
a 390pt iPhone and 328px on a 402pt one, and twelve pixels is the difference between a Chinese
notice that fills its line and one that spills a single character onto a second. Tuned at 328px,
four of the eight views broke at 316; tuned at 316, all thirty-two combinations land in shape and
the wider phone is merely a little loose -- the German translated notice sits at 52% there rather
than 65%. Loose is the harmless direction, so the narrow phone is the one the copy answers to.

Chinese and Traditional Chinese take one line for all four messages, Japanese one for the short
notice and two for the rest, Korean two for the middle pair, and the four European languages two
throughout with second lines between 63% and 88%.

**A short form ends without its final punctuation where the script allows it.** Chinese and
Japanese do: a line of prose that stops at the edge of a tinted box has already been ended by the
box, and the full stop is a mark the reader does not need twice. The long form keeps it, having
room to be a sentence. Korean and the European languages keep theirs at both lengths, because a
period is doing more work in a script whose sentences are not otherwise visually bounded.

**The register is written, concise and impersonal-leaning, and it is set in each language rather
than translated into it.** The reference sentence is the Chinese one: `该版本的措辞经过细微修改，推荐
阅读原文。` Formal enough to be the software speaking, short enough not to lecture, and carrying none
of the scaffolding a translation leaves behind. Two failure modes sit either side of it. One is
translationese -- `已为你显示`, `以...为准`, `你正在阅读的译本可能带有细微的措辞润色` -- which is
accurate and reads like a dialog box. The other is the overcorrection: hearing "stiff" and writing
`这一版措辞上动过一点，想读原样的话可以看原文`, which is plain speech where written Chinese was wanted
and reads worse to a native reader than the stiffness it replaced.

**None of the nine is a rendering of another.** Each sentence is composed in its own language to
the same register, which is not the same as saying the same words: German reaches for
`Die Formulierung dieser Fassung wurde leicht überarbeitet`, Japanese for
`この版は表現に細かな調整が入っています`, Korean for `이 판은 표현이 조금 다듬어진 것이며`. A
sentence mapped clause-for-clause out of the Chinese would land somewhere between the two failure
modes in every one of them, because what makes a sentence sound composed rather than converted is
different in each language. The shape rule above is the only thing all nine share.

**`{language}` is inside the measured string, so the shape is exact for the corpus and
approximate beyond it.** A notice naming Chinese (Simplified) is twenty-four characters longer in
German than one naming English, and every article today is written in Chinese but one. The copy is
tuned against that, and an article written in a language with a much shorter or longer name will
sit slightly off the shape rather than break it -- the sentence is written so the slack falls on
the second line.

**`mw` takes Chinese here, against the default.** [locale/addressing.md](../locale/addressing.md) says a message added to
`mw` takes the English wording, and that rule is about messages nobody has an opinion about yet.
These four are not: the owner already wrote the long forms in Chinese, and a short form is the
same sentence for a narrower box. Pairing an English short with a Chinese long would swap language
at the breakpoint, which is the one thing the pair must not do. The `mw` view renders no notice at
all -- the component takes every code but that one -- so these strings are the catalogue staying
whole rather than copy anybody reads.

**Nothing sets `text-wrap: pretty` on copy tuned this way.** Chrome ignores the value on these
paragraphs and lays them out exactly as `auto` does, while Safari 26 implements it by reflowing
earlier lines to rescue the last one -- which empties the first line of a two-line block to avoid a
short second, producing the ascending rag this rule exists to prevent. Greedy filling is both what
the measurements are taken against and what the two engines agree on.

The bio carried it anyway until a 390pt phone showed what it cost. `something I made and` ended a
line with room to spare while `thinks,` waited on the next one with the nowrapped clause -- Safari
had pulled a word back to keep the last line from being short, which is the reflow above doing
exactly what it says. Removing the class put `thinks,` back where filling puts it and left the
closing clause alone on its line, which is the shape the copy was written for. A 402pt phone
improved too, to two nearly full lines. The rule was right; it was the markup that had not caught
up with it.

## A phone is shown the title that fits, not the title cut short

The article column gives its title 85% of its width on a phone, which is 300px inside the page
padding on an iPhone 17 Pro. A title past that is replaced by the short form rather than wrapped:
a short title is a phrase written for the room it has, and a wrapped one is a full title that ran
out of room. The card list is the tighter case and is where the short forms are written to -- 186
px beside a leader and a date -- so a short title always clears the article page.

**The choice is made in the build, not in the browser.** Whether a title fits is a property of the
string, so it cannot change between renders; computing it at runtime would mean the first frame
guessing and correcting itself. Both headings are in the document and CSS chooses between them,
which is the same shape the card uses and for the same reason: the choice survives the server
render. `display: none` keeps the unshown one out of the accessibility tree, so exactly one is
announced.

Where the full title fits, the two strings are equal and the markup carries one title twice. That
is the cost of deciding in CSS rather than in a media query the server cannot see, and it is paid
in bytes rather than in a wrong first frame.

**The estimate exists twice, and one corpus holds the two together.** `width::pixels` in the CMS
refuses a translation that will not fit; `width.ts` in the site build chooses which title a phone
sees. Neither can call the other -- one is Rust, and putting the choice in the build artifact
would make that artifact depend on translation state with nothing to detect it going stale. So
both are tested against the same ten strings measured in the rendered page, and a constant edited
on one side turns the other side's tests red.

## The metadata row sheds a control on a phone rather than wrapping raggedly

The row under the title carries a date, a character count, a read count, the summary disclosure
and the language switcher. On a laptop that is one line. On a phone's 354px column it was two,
and which item fell to the second line depended on how long the words came out in that language,
which is the shape a row takes just before it stops looking designed.

**The read count is the one that goes.** It is the only item in the row a reader never acts on --
the date and the count are what the article is, the other two are controls -- so dropping it costs
the least. It is hidden below `sm` rather than removed, because the room exists above that and a
number nobody asked to hide is still worth showing where it fits.

**The summary label gets a short reading, on the mechanism the notice and the pitch already use.**
`article.summary.short` exists in all nine catalogues and the button renders both with CSS
choosing. Eight of them repeat their own word, because `Summary`, `总结`, `要約` and `Résumé` have
nothing shorter to say. German does: `Zusammenfassung` is fifteen characters and the longest label
in the row by half, and `Resümee` is the same word for the same thing at seven. Keeping this as a
message rather than a condition in the component means the next language that finds a shorter word
changes a catalogue, not a component.

**The switcher takes the article's right frame wherever the rail is absent.** The question is not
how wide the window is but whether the table of contents is on screen, and those are different
questions: whether the read count fits is a matter of pixels, where the language control belongs is
a matter of what else the page is already anchoring. With the rail there is a column of navigation
down one side, and a second right-aligned control opposite it is one anchor too many, so the
control rejoins the row's flow behind the summary. Without the rail it is the only thing on the row
a reader reaches for rather than reads, and the frame is where a reader looks for one.

So the rule is paired with the rail's own, in the same `@media` block and against the same number,
rather than given a breakpoint of its own to drift from. An iPad mini shows it both ways within one
device: right-aligned in portrait at 744pt, back in the flow in landscape at 1133pt.

**The switcher drops its region below `sm`, and that is what bought the last line.** Removing the
read count was not enough: German still needed 388px of a 354px column and four of the nine views
wrapped. `(DE)`, `(CN)`, `(ES)` qualify nothing among the eight published views, whose endonyms
already differ from one another -- `简体中文` from `繁體中文` included -- so below `sm` the article's
switcher asks for the name alone. It asks, rather than deciding for itself: `phoneRegion` is a prop
and only the article's row passes it, because only the caller knows what else is in its row. The
original view's `Original (XX)` fallback keeps its region at every width, since there is no endonym
there and the region is the whole identifier.

Both readings are rendered and CSS picks, not a width read in script. The reason is the one the
title and the pitch already give: the choice has to survive the server render, and a control that
corrects its own label on the first frame is worse than one a few pixels wider.

**Then German, then the gap, and the phone that settled it was the narrow one.** A 402pt iPhone
left German 3px, which is not a margin. `Zusammenfassung` becomes `Abriss` rather than `Resümee` --
seven pixels, and a shade of meaning toward the outline it summarises, spent knowingly. That fixed
German and promoted Spanish, whose `Resumen` has nothing shorter behind it, so the row's own gap
goes from 8px to 6px below `sm`. Measured on a 390pt iPhone, where the column is 342px rather than
354 and everything is 12px tighter than the first device suggested:

| view       | slack at 342px | slack at 354px |
| ---------- | -------------- | -------------- |
| Spanish    | ~0             | 9              |
| original   | ~0             | 12             |
| English    | 2              | 14             |
| French     | 6              | 18             |
| German     | 13             | 25             |
| Chinese    | 31             | 43             |
| Japanese   | 46             | 58             |
| Korean     | 54             | 66             |

All nine views are one line on both, which is the shape this row now has everywhere rather than
one it reaches in some languages. Spanish and the original view are the ones with nothing to
spare: a character count that grows a sixth digit takes about eleven pixels and would wrap them
again on the narrow phone. The next pixels available are the gap at 4px, and after that there is
nothing left that is not information.

**The narrow phone is the one to measure on.** The first pass was taken on a 402pt device, found
every view fitting, and was wrong about four of them -- a 390pt iPhone is twelve pixels narrower
and that is most of the margin this row has.
