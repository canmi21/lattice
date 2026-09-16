# An author's note, and where a jump lands

Moving a reader inside one document without giving them an address, and the two marks in prose
that send them: the collected note and the spoiler. Which of the three systems writing CSS is
entitled to say each decision here, and what happens where two of them say the same thing, is
[architecture/css.md](../architecture/css.md).

## An in-page jump scrolls without becoming an address

Navigation within one page -- an article's table of contents, the licence page's list of
licences -- moves the reader and leaves the URL alone. These are a way around a long document
rather than addresses worth collecting: a reader walking six sections would otherwise leave six
history entries behind and have to press Back six times to get out of a page they never left.

**Arriving with a hash still works, and is the browser's job.** A fresh navigation to
`/licenses#mpl-2-0` jumps natively on load. A reload of that same URL restores the position the
reader had scrolled to rather than jumping again, which is what a browser already does and what
somebody reloading halfway down a page wants. Nothing here re-implements either.

The distinction is `PerformanceNavigationTiming.type`: code that does take over the initial
jump -- the article ToC, which needs its own offset and a smooth landing -- acts only on
`navigate` and stands aside on `reload`. A fresh article navigation suppresses the native
fragment jump before the body is parsed, begins at the article top, then restores the hash
without moving and scrolls smoothly to it after hydration. Handling reload the same way would
throw away the reader's place.

A note's marker and the way back from a note are on this too, and are the reason the modifier
test and the reduced-motion check live in [jump.ts](../../apps/site/src/lib/client/jump.ts) rather
than inside one component: a marker in prose arrives as compiled HTML with no component to hang a
handler on, so the article root listens for all of them at once. Both ends are jump targets, so
returning to a marker keeps the same band above it that arriving at a section does.

The control stays an `<a href="#id">` and the handler cancels the default. Without JavaScript
the native jump happens instead, hash and all, which is worse than the scripted behaviour and
much better than a dead control. A modified click -- meta, control, shift, alt, or any button
but the first -- is the reader asking for a new tab, so it is left to the browser untouched.

Smooth scrolling is skipped under `prefers-reduced-motion`.

### A jump lands below the top edge, not against it

**A section reached by a jump keeps roughly a tenth to a fifth of the viewport above it.** A
heading flush with the top edge reads as the end of what came before rather than the start of
what follows, and it puts the reader's eye at the one place on screen it does not naturally
rest. Holding a margin above the target lands the section in the band people actually read
from, and keeps the last line of the previous section visible, so the jump is legible as a move
through one document rather than as a page being replaced.

The reserved space is **a share of the viewport rather than a fixed length**, because what is
being reserved is a share of what the reader can see. A constant that reads as a tenth of a
laptop window is a fifteenth of a tall monitor and a third of a phone held sideways. The default
answer is the `jump-target` utility in
[utilities.css](../../apps/site/src/styles/utilities.css).

**The offset belongs to the target, as `scroll-margin-top`.** A native hash jump, a scripted
`scrollIntoView` and anything else that moves to the same element then land in the same place
without having to agree on a number, and nothing that jumps has to know the offset exists.
Arithmetic on the caller's side is the version that drifts: only one caller gets corrected when
the value changes.

The article ToC keeps its own offset rather than this one. It was measured against its own
indicator, which tracks the heading it points at, and a share of the viewport is not the
geometry that was tuned. An exception with a reason is not a second rule.

## An author's note is written where it is meant, and numbered where it lands

`:fn{is="..."}` marks the word it follows and sends what it says to the end of the article, where
the notes are collected in order with a way back to each marker. It is the numbered note of a
book, not the popover a translator leaves -- that is [`:tn`](../i18n.md), which explains a phrase in
place and is written by a machine rather than by hand.

**The note travels with the text it explains, not with a label.** GFM's footnote is the other
shape -- `[^seam]` in the prose, `[^seam]: ...` at the bottom -- and it was rejected for two
reasons, in this order:

- **The editor cannot keep it.** The CMS is where articles are written, and its markdown is
  CommonMark with hand-written node schemas for the constructs this repository added. Round-tripped
  through it, `[^seam]` comes back `\[^seam]` -- escaped, silently, in both the marker and the
  definition. Teaching it otherwise means two more ProseMirror schemas, one of them a block
  container, and an answer for what a definition looks like while it is being edited.
- **A label is a second thing to keep true.** Writing the note where the marker is removes the
  pairing entirely: nothing to match, nothing to renumber, nothing that can be deleted at one end
  and left dangling at the other.

Numbers are the machine's. They run across the whole article in the order the notes are written,
so inserting one renumbers the rest without anybody touching them. **Two notes that say the same
thing are two notes** -- there is no label to merge them by, and a reader who met the explanation
twice was given it twice on purpose.

### What the shape costs

The note lives in a directive attribute, and that has two consequences worth knowing before
writing one.

**It cannot contain a straight quote.** The syntax has no escape for one, so the parser drops the
whole attribute and leaves a marker that says nothing -- silent, and indistinguishable from a typo.
The build refuses it, naming the article, and `validate.rs` refuses the same shape coming back from
a translation. Curly quotes are fine, as are braces, backticks and asterisks; all arrive as
literal text.

**It is flat text.** No links, no code spans, no emphasis inside a note. If one ever needs them,
the escape hatch is a container directive -- and that brings the pairing problem back with it, so
it is not worth reaching for until a note actually needs it.

### The collected notes are set like the article

The section at the end is small and quiet, at roughly three quarters the prose's size and the
soft text colour. That is what a note at the foot of a page is: something to step over on the way
past and come back to deliberately, not something competing with the article for the same
attention. Set at the article's own size and colour it did compete, which is how the ratio was
arrived at rather than guessed.

**One bright thing per note, and it is the number.** The whole line is soft, the quoted phrase
included -- weight alone marks the phrase, which is enough to find it by without spending colour
on it. The colour goes to the superscript, because that is the part a reader is actually looking
for: it says which of the markers above this note answers.

An earlier attempt at quiet was uniformly grey and small with nothing to catch on at all, and read
as somebody else's apparatus rather than the writer speaking under their breath. Grey was not the
mistake; grey with nothing in it was.

The heading above the section is the exception in the other direction: it renders at the same
size and colour as the article title and the newsletter heading, none of which sets a size of
its own -- three section names on one page, matched by sharing the inheritance chain rather
than by copying a number. Only the notes under it stay small.

**Closing the fold carries the page with it.** Closing shortens the document, so a reader near
the end is left above a bottom that no longer exists and the browser pulls them up to the new
one. It is right to, and it arrives at the worst moment: the pull begins partway through the
animation, the instant the document becomes shorter than the current scroll position, and lands
as up to 50px in a single frame after a stretch of no movement at all. That discontinuity is what
reads as a lurch -- the movement itself is unavoidable, since the reader is looking at the very
notes being folded away.

So the movement is taken over and spent on the same spring as the height, with progress read from
the distance the panel has covered rather than from a clock, which keeps the two on one curve
instead of on two that agree by luck. Opening needs none of it: a longer document never forces
the page to move. And the reader outranks it -- scrolling during the animation leaves the
position away from where the carry last put it, which is taken as steering, and it stands down
for the rest of the move.

**A wrapped note is balanced, and that was measured rather than reasoned.** By category it is the
wrong answer: a note is a sentence, and the prose elsewhere on this site uses `text-wrap: pretty`
wherever the language breaks between words, which leaves lines full and only refuses to end on a
word alone -- see [prose.md](prose.md), "Where a line ends is declared per language". Measured on
the Spanish view of the article with thirty-three notes, `pretty` changed nothing at all -- every
line came out identical to plain filling, because it intervenes only when the last line is down to
about a word, and these end on a quarter of a line. `balance` closed all four of the short
endings. The same property is on the table of contents labels for the ordinary reason, that they
are titles.

Neither does anything for the Chinese views. Chinese breaks between almost any two characters, so
filling already reaches the end of the line and there is nothing left to even out -- all three
modes render identically. This class of property is for the languages that break between words.

**The walk back from a note lights the words it lands on.** Arriving in the right scroll band
is not the same as knowing which words were left: the noted words may sit anywhere in their
line and appear more than once in the paragraph. So the return fills the words with the
selection colour the instant the scroll settles -- the reader's own "I marked this" ink,
themed for both modes, worn tailored where a drag is raw: rounded, hugging the glyphs, whole
on its first frame because the instant of arrival is the message -- and fades it slowly, the
marker's number lit beside it and letting go on the same clock.

The light is painted above the text as its own translucent layer, never as a background on
it. A background sits under the element's children, and any child that brings its own -- an
inline code span is the ordinary case -- swallows the light exactly where it lands; a layer
on top cannot be covered by anything the content grows later, and the selection colour's own
alpha keeps the words readable through it. The layer's boxes are read off the text's rendered
line fragments at the moment of arrival, one per fragment, so the wrap semantics below are
geometry the layer copies rather than CSS it relies on. A dotted underline was tried
under the fill and cut: two inks were saying one thing, and the fill already says it in the
reader's own colour.

The walk down gets the same light, on the note's whole line: the phrase and the explanation
compose one sentence, so the fill covers both rather than picking a half. Across a wrap the
line's box is sliced where the prose words' is cloned, and the asymmetry is the meaning: the
square edges at a break say the sentence continues, where two finished pills would say two
things -- a real drag-selection breaks the same way, and this is its ink. The marked words in
prose are short and each fragment is wholly "the words", so their boxes close.
`:target` cannot carry this, deliberately: the move never touches the URL (see above), so a
class set by the jump does, and the compiled prose wraps the noted words in a span that exists
only to receive it. Accent is not spent here -- appearing and disappearing is what catches the
eye, and the colour that means focus should not also mean "you came from over there". Under
reduced motion the highlight appears and leaves without animating; the information is kept.

**The notes render after the article, not at the end of it.** The rule above the newsletter had
always been the article's ending boundary, and the notes are apparatus about the article rather
than part of it -- so they belong below that boundary, not above it inside the body. Moving them
out is also what keeps the rail and the table of contents honest without either changing: both
measure the article, and the notes were the one thing inside it that was not article. The
boundary rule is worn by whichever section comes first -- the notes when the article carries
any, the newsletter otherwise -- and sits in the same place either way.

**The boundary hairline is dashed; the one between notes and newsletter is plain.** What follows
the last paragraph is offered rather than fenced off -- the notes are the article's own words
stepped down into, and the newsletter is an invitation -- so a solid rule there would read as
closing a door the page wants open. Between the notes and the newsletter, though, a rule only
separates two offerings from each other, and that is ordinary chrome: plain, like the divider
inside a translator's note popover. The site draws dashed elsewhere on the boundary reasoning:
the leader on an article card, joining a title to its date rather than dividing them, and the
leaders on the licence pages.

The notes are spaced tightly, closer than the paragraphs above them. At this size they are a
block to be scanned rather than paragraphs to be read apart, and spacing carried over from larger
text made two notes read as two unrelated things.

The marker's size is a ratio rather than a length, so one rule serves both places it appears:
beside prose it lands where a fixed size used to, and among the smaller notes it shrinks with
them. The same for the arrow that ends a note.

**A note names its words first, then its number, then what it says.** The quoted phrase is what
lets the section be read on its own, in the order a reader needs it: what this is about, which
mark it was, what it means.

**The number is the same superscript that marked it in the prose.** It was a right-aligned counter
column first, which drew a table: a list of arrows down one edge and a rail of digits down the other,
neither of which the reader had met before. Reusing the marker means the number in the note and
the number in the prose are one thing seen twice, and the section stops looking like an apparatus
bolted underneath. It sits between the phrase and the note, the one place it needs air on the side
facing the note -- in the prose it follows the word it belongs to and must not be spaced off it.

The list stays an ordered list for what a screen reader is told, with nothing of a list drawn --
so the visible superscript is hidden from it, or the ordinal would be announced twice. The way
back trails the note's last word rather than sitting at the right edge: it belongs to the sentence
just read, and a column of arrows is more furniture.

#### Past five, the rest is folded away

An article can carry more notes than the article has room to end on -- one here carries
thirty-three -- and a page whose last screen is apparatus reads as though the apparatus were
the point. So five stand outside the fold and the rest sit behind it, opened by a control
that says how many are there.

**Five by count, not by height.** A height would cut a note mid-sentence at a boundary nobody
chose; five is enough to show that this is a list and how dense it is.

The fold is left one line tall rather than closed to nothing, and that line fades out. A hard
cut says the list ends there, which is the one thing it must not say; text dissolving mid-line
says it continues and something is holding it back, and the control's count then says how
much. The fade is a mask rather than a gradient painted in the paper's colour -- a painted one
would be a second place the background is written down, wrong the moment either changes.

**A fold that clips has to be positioned.** `overflow: hidden` does not clip an absolutely
positioned descendant whose containing block lies further up, and every note carries one: the
way back's purpose is written for a screen reader, and the utility that hides it visually takes
it out of flow. Twenty-eight of those escaped a static fold, stood at their unclipped positions,
and added a screen of empty document below the page with a scrollbar to match. The fold's own
height had nothing to do with it -- setting it to zero changed nothing -- which is what made the
symptom read as unexplainable. Anything here that clips is `position: relative` for that reason,
not for stacking.

**The fold opens before the scroll, not during it.** A marker in the prose may point at a note
behind the fold, and the walk down must still land on it. `scrollIntoView` resolves its
destination the moment it is called, so a fold opening afterwards pushes the note below the
position the scroll is already travelling to and the reader lands short. Opening first is also
what keeps it unseen: the section is still below the fold, so the height changes where nobody
is looking and the reader arrives at a section that was simply already open. Animating that
opening would be the visible version of the same thing, and slower than the scroll it races.

The marker cannot ask the section whether a note is folded -- it is compiled HTML with no
component of its own, delegated at the article root -- so the section leaves one revealer
behind a module for as long as it is mounted. One slot rather than a registry: a page has one
collected-notes section or none, and a second subscriber's question, which section did the
reader mean, has no answer.

The motion is the code block's, by sharing it rather than by copying its numbers. Both are the
same gesture -- a panel answering a press -- and two springs written out separately are two
numbers to keep in step with no way to tell later whether they were meant to be equal. See
[the titled code block](blocks.md#a-titled-code-block-is-one-framed-disclosure), which was first.

### The marker wraps the words it explains

`:fn[the words]{is="what they mean"}` -- the same shape as a translator's note, and for the same
reason: something has to say which words are being explained. Without them a collected note is a
sentence in mid-air, and a reader who scrolled down to it has to hold the one they left in their
head to make sense of it.

The words render exactly as written and the marker follows them, so the sentence reads as it
would without the note at all.

**A heading is safe because the wrapped words are its own.** A heading is flattened to a string
for its entry and its slug, and flattening keeps a directive's children while dropping its
attributes -- so the words arrive in the table of contents, where they belong, and the note does
not. That is the whole reason the note lives in an attribute rather than beside the words.

That holds for the compiled entry. The rendered heading also carries a real superscript, so the
table of contents strips `.note-marker` before reading a heading back out of the DOM -- without it an
entry gained a stray digit at hydration, which is how the rule was found.

## A spoiler is fog, not redaction

`:spoiler[the words]` keeps its words in the sentence but out of view: fogged by a blur, lifted
while the pointer hovers or the element holds focus, restored the moment the reader moves away.
Telegram's spoiler is the model. No markdown dialect standardises one -- `||text||` is a
convention three platforms happen to share and CommonMark never adopted -- so this is a DLC
directive like `:t` and `:fn`, not a syntax borrowed from anywhere.

The hiding is a display choice and stays in CSS. The words remain real in the compiled HTML --
selectable, translated segment text, read by assistive technology -- because a reader who cannot
hover is owed the content, not the ceremony. For the same reason the reveal listens to `:focus`
rather than `:focus-visible`: a tap's focus is the only ask a touch screen has, and revealing is
this element's whole job, while the focus ring it wears through `.focus-link` stays
keyboard-only. There is no JavaScript to toggle it, so nothing has to hydrate before the fog
lifts.

The markdown target unwraps the directive to its words. That target's readers are models, and
the words are worth more to them than the fact that a page would have hidden them.
