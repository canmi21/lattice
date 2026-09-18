# What is sent to a model, and what a valid answer is

The request built around a block, the masking that keeps its code intact, and the checks a reply
passes before it is stored. What a block is and how it is addressed is
[segments.md](segments.md).

## Code is never rewritten

A code block is not translated, and nothing that goes out about one comes back into it --
comments inside it included. Code is an executable fact, and editing comments would immediately
raise the question of where to stop.

The rule used to be written as "never sent", which said more than it had to. What it protects is
the article: no model's output is ever substituted into a fence. Whether the bytes leave the
machine is a separate question, and answering it with the same word conflated a guarantee about
the corpus with a policy about the network -- one of which the site can prove and the other of
which it cannot, since the same block is already published.

A Mermaid diagram and an SVG canvas remain code blocks at this boundary. Their labels are shown in
the source language in every translated article view. Extracting selected strings without the
diagram grammar would let a translator rewrite syntax as prose; translated diagrams require a
parser-aware design rather than weakening the guarantee above for one fence language.

## A diagram written as source is described, not translated

Both of those fences draw a picture, and until one is described nothing downstream can read it.
The block is code, so it never enters a sidecar; it reaches a reader who cannot see it as nothing
at all, reaches the search index as nothing, and reaches the translator of the paragraph beside it
as the words "a code block, not shown" -- so the sentence introducing a diagram is translated by
somebody who has not been told there is a diagram.

**A `:::quadrant` is the third one, and it is the case that shows what the rule is really about.**
It is not code and not a drawing: it is prose the author wrote, placed in four regions. But a
directive is not translated either, so its labels stay in the source language in every view, and
the figure reaches a reader of another language as English nouns in a grid. It used to assemble
its own accessible description out of those labels with English joining sentences, which is worse
than it sounds -- a German reader was read an English sentence with English nouns in it, and
nothing about that was a translation. What can be carried across languages is a description
written as prose, which is exactly what the other two needed.

So each one is described, the way a picture is, and the description is a new sentence about the
drawing rather than a rewrite of it. That is what makes this consistent with the rule above rather
than an exception to it: the source goes out, nothing comes back into the source.

**The description belongs to the drawing, not to an article carrying it.** It is keyed by the hash
of the block -- the segment id, which is already what addresses that block everywhere else -- and
kept in `data/record/diagram.json`, so one drawing used by two articles is described once and paid for
once. The store is JSON where its neighbours are YAML. `media.yaml` and `tags.yaml` are files a
person opens, edits a few entries in and saves back, and YAML is for them; this one is written by
a command and read by a build, and the only field a person ever reaches into it for is `review`.

`cms diagram` writes the English, and `cms locale` carries it into the other seven the way it
carries an image description and a summary. English is the source language here for a reason
sharper than the image case: the labels inside these drawings are English even in the Chinese
articles, so a description written in anything else would be translating them on the way out. It
is also told, when translated, to leave those labels alone -- they stay in the drawing, and a
translated quotation of an untranslated label names nothing a reader can find.

**What the description is for.** Four things read it, and none of them could read the drawing.
The drawing carries it as its own name under `role="img"`, which is what
[styling/blocks.md](../styling/blocks.md) describes: one picture with one reading, instead of a dozen
labels in draw order. A quadrant already had the shape and takes the description in place of the
sentences it used to assemble. A feed reader gets it in place of `[Diagram: <the article's
title>]`, which was all a feed could say before -- a Markdown target keeps a Mermaid fence, since
that one it can render, and takes the description for an SVG canvas, which it cannot. The search
index gets it, so a diagram is findable by what it draws. What is deliberately not done is
showing it: no caption, no figure text. The article's prose already says what the drawing is for,
and a paragraph of generated description under every picture would be the site explaining itself
to a reader who can see.

The translator context is the one consumer inside this pipeline rather than outside it, and it is
not wired yet. A described diagram could hand the paragraph beside it its description instead of
"a code block, not shown", which is the only change here that would improve a translation rather
than serve a reader directly.

**Not the open-weight text model.** `cms diagram` asks for the picture and not the markup, which
is a constraint the model holds against what it is literally reading, and the default measurably
does not hold it: asked for the drawing, it reported fill colours, opacities and the size of the
legend squares. That is the same failure, and the same remedy, as `cms summary`.

One detail of the reply is worth recording because it cost two failed runs. The request fences the
source between one random boundary and asks for the answer between another; a model that has just
read a fenced source closes its answer with the fence it read rather than the one it was given.
The opening mark is what the guarantee rests on -- it is what says the text after it is the
model's answer and not something the source talked it into -- so the answer is taken from the
opening mark to whichever mark arrives next.

Inline code is different: there are 180 spans across these articles, and splitting a paragraph
around each one would destroy the context a translator needs. Those are lifted out and
replaced with `⟦tk:N⟧` markers, then put back after translation.

`⟦⟧` are U+27E6 and U+27E7, chosen for one property: prose does not contain them. A
`$1`-style marker is ambiguous in an article about shells or regular expressions, which is
exactly what this site publishes.

The markers are what makes the guarantee checkable. Every one must return exactly once; a lost
or duplicated marker fails validation and the segment is asked for again. The point is not to
hope the model left the code alone but to be able to show that it did.

## The source is fenced, and the instructions surround it

Article prose can contain sentences that read as instructions -- not as an attack, but a
paragraph quoting a prompt is enough to derail a translation. So the block is placed between
two copies of a 32-character random string, generated fresh for each request, with rules
stated both before and after it.

Three properties, and all three are needed:

- **Random per request**, because the defence is that the author cannot have written it. A
  fixed sentinel could appear in an article discussing this system.
- **Identical top and bottom**, so the region is unambiguous.
- **Instructions on both sides**, so the last thing read is not the untrusted text.

Letters and digits only. Punctuation would be worse than it looks: backticks, asterisks and
underscores carry meaning in the surrounding markdown, and a model that reformats the boundary
destroys what the boundary is for. Randomness comes from length, not from exotic symbols.

### The context is fenced too, because it is also article prose

A request carries the blocks on either side so the sentence being translated has somewhere to
lead. For a long time only the material was fenced and the context was simply two bare lines
below the instruction not to translate it -- which put three passages of article prose in one
request with exactly one of them marked. The unmarked ones read as the _cleaner_ text, because
the marked one is full of `⟦tk:N⟧` placeholders where its inline code used to be. Answers came
back translating a neighbour, and once a neighbour is the same shape and length as the block,
no check of the output alone can tell the two apart.

So the fault is fixed where it is created rather than detected afterwards. The context gets a
fence of its own, derived from the material's -- `{fence}CONTEXT`, so an echo of either one
still trips the single boundary-leak check -- and each side is named, `PREVIOUS BLOCK` and
`NEXT BLOCK`, so there is no reading in which the two run together.

**The neighbours are folded, not reproduced.** A neighbour is there for continuity and is never
the answer, so it arrives shortened: code, a directive and a rule collapse to a phrase saying
what sits there, and prose keeps its words but loses its inline code to a placeholder that
restores to nothing. That asymmetry is deliberate and load-bearing. The masked block is the
only text in the request whose markers map back to anything, so prose lifted out of the context
arrives carrying a marker that resolves to nothing, and is refused as evidence of where it came
from rather than as a guess about its length.

**Metadata takes no context and gives none.** Title, subtitle and description are segments, and
they sort ahead of the body, so the neighbour list built from every translatable segment made
the article's own description the "previous paragraph" of its first body block -- a dense,
self-contained summary offered to the model as the thing this paragraph follows on from. It
came back translated in the paragraph's place, in one locale, and stayed there until a reader
noticed. Frontmatter is not prose that leads anywhere.

**The neighbour is the neighbour.** The list is built from every block rather than every
_translatable_ block, because filtering it first made a code fence or a figure invisible and
promoted whatever prose lay beyond it to "the previous paragraph". Folding keeps that honest at
no cost: the block is named, its bytes are not sent.

## The reply is line-anchored, never JSON

The initial request covers one segment in all eight locales. A repair request names only the
locales still missing or rejected; an already stored locale is never paid for again merely
because its neighbour failed. `cms i18n --locale L` applies the same selection deliberately,
and may be repeated. The answer is a marker line per requested locale followed by its text.

JSON is the obvious choice and the wrong one. Translations are prose full of quotes, colons
and newlines, and a single escaping mistake invalidates the whole reply -- eight languages lost
to one defect. Scanning for marker lines has no nesting to get wrong: a locale that came back
malformed is simply absent, and only that one is requested again.

The command audits the sidecars again after writing. A partial final answer therefore leaves a
non-zero exit status instead of turning into apparent success and another progress bar on the
next run. `cms i18n --check` performs that same completeness audit without starting a runner or
making a paid request.

Retries accumulate valid locale answers from every attempt. Once a locale survives validation,
the next attempt removes its marker and asks only for the remainder; a malformed sibling cannot
discard or rebill a paid-for answer from earlier in the same command.

### A block that will not come back is asked for one locale at a time

A segment can refuse every attempt while its neighbours pass, and the reason is not the
segment being hard. Asked for several locales at once, the model answers with the
_neighbouring context paragraph_ instead of the fenced block -- a complete, fluent translation
of the wrong text. Nothing about the reply is malformed, so only the code markers catch it:
they belong to this block and not to its neighbour, and `intact` throws the whole reply away.
Every locale in that request dies together, which is what makes it look like the block is at
fault rather than the request.

It happens where the block invites it. The one that produced this rule is a sentence the
author deliberately leaves hanging into the next paragraph, so the surrounding context reads
more like the thing being asked for than the fragment does -- and locales whose grammar cannot
end a sentence there are the ones that reach for it. Six paid attempts across three locales,
all refused; the same locales asked one at a time answered on the first try.

So a segment that fails repeatedly is retried per locale before anything else is suspected.
It costs one request per locale instead of one for all of them, which is the cheapest thing
tried here and the one that works. The rule earns its place because the failure names none of
this: `no locale survived marker and shape validation` is what a lost marker, an added line
and a malformed note all say, and the three have nothing in common to try next.

### A count the source fixes is worth more than a size that has to be judged

The failure above is caught only when the block has code markers to lose. A block without any
gives the reply nothing to fail on: the shape is valid, one line matches one line, and the
answer is simply about something else. Two checks close that, and both work because the source
decides the answer rather than a threshold approximating it.

**The author's notes must come back exactly as many as went out.** `:fn` is the author's and
`:tn` is the translator's, so a translation neither gains a `:fn` nor loses one, whatever the
target grammar does. Measured over 2744 stored translations the count never differed on a
correct one, and it named every locale of the block whose answer was its previous neighbour's.

**No marker may survive restoration.** Every `⟦tk:N⟧` the block owns is put back before the
check runs, so a bracket still standing came from the folded context described above.

Both are hard: they refuse on arrival and they refuse a stored translation when the CMS emits a
build record, because neither can be true of a correct answer. That is the line between them
and the note policies, which stay report-only precisely because a defensible minority breaks
them.

A size band was tried first and kept, but only for what it is good at. A reply four times its
source plus forty columns is answering something else -- a two-column `OR` came back with five
hundred -- and that catches the case where the source is too short to carry any other signal.
It cannot catch a neighbour of ordinary length: the block that produced this section was twice
its source, and twice is what an ordinary German paragraph does. **A check with only an upper
bound is half a check**, which is how a reply at 0.56 of its source walked through it. Measured
over the stored corpus, the widest legitimate translation ran 2.4x its source; nine entries
exceeded 4x+40, and all nine were faults.

### Two views of one language are each other's control

The remaining case carries no invariant at all: a block with no code and no author's note,
answered with a neighbour of similar length. Nothing about that translation, read on its own,
is wrong.

Read beside its sibling it is obvious. `zh-CN` and `zh-TW` are two views of one language
translated from one source, and across the corpus they run within a few percent of each other;
the bad one was 0.58. So `cms i18n --check` compares locales that share a language and reports
a pair that differs by half. Report-only, and only above sixty columns: under that a same-
language pair legitimately diverges, because one view leaves a six-character fragment alone
while the other spells it into a sentence. Every divergence measured under that width was
benign and the one above it was the fault.

This is the only check here that needs more than one translation in hand, which is why it lives
in `audit` rather than in `validate`: a request may be for a single locale, and the sibling it
would be compared against is not part of it.

### A rule is structure, not a very short paragraph

`---` reached the classifier as prose, because the classifier ended in "anything else is prose"
and a thematic break is spelled with punctuation. It was then sent to a translator, eight
locales at a time, with the full note and markdown ruleset attached -- and it is a coin flip
whether the answer echoes it or explains it. An explanation fails validation, the attempts run
out, and the article has a missing body segment: not a paragraph a reader loses, but the whole
locale view falling back to the source, for a horizontal line.

So a rule is its own kind and is never translated, like a directive and for the same reason. It
is recognised positively rather than left over, and any structural spelling added later has to
be named there too: the fall-through ending is what sent this one for translation, and a new one
would go the same way in silence.

### One missing body block is a locale nobody can read

The site refuses to mix languages inside a page, so a single missing body segment makes it serve
the whole article in the source language with a notice. That means "one entry short" and "this
locale is unavailable" are the same event, and a count of missing entries does not say so.
`cms i18n --check` names the article and locale and says the view falls back, beside the count
rather than instead of it.
