# The surfaces a page stacks, and which way each of them moves

The neutral palette in [libs/tokens](../../libs/tokens/src/colors.css) holds two kinds of colour.
[focus.md](focus.md) already names one of them in passing -- the neutral ramp running strong text,
text, soft text, strong border, border. This file is the other one, and what it costs.

## A sheet takes the theme's own end of the range, and a step off it goes the other way

**Contrast colours** -- `text`, `text-strong`, `text-muted`, `text-soft`, `ink`, `border`,
`border-strong` -- exist to be seen against whatever is behind them. Their job is distance from the
ground, so each theme sends them toward the opposite extreme: darker than the page in light, lighter
than it in dark.

**Surface colours** are the ground itself. `page` is what the document is painted on. `paper` is a
sheet laid on it, and a sheet takes the end of the range the theme calls its own -- pure white in
light, the deepest surface in dark. `paper-hover` is one step off that sheet, which therefore means
darker in light and lighter in dark.

| | `page` | `paper` | `paper-hover` |
| --- | --- | --- | --- |
| light | 0.987 | 1.000 | 0.962 |
| dark | 0.178 | 0.157 | 0.213 |

Both halves mirror, and for the surfaces that is the point rather than an oversight. The homepage's
article thumbnail is the case that settles it: it is a drawing of a page of writing, so in light it
has to be a white sheet and in dark the deepest thing on screen, which is exactly what `paper` is in
each. A card, a code block and a Mermaid frame are the same sheet. A hover leaves the sheet in both
themes, which is why the name holds wherever it is used as feedback.

## A mirrored pair cannot keep one of its members the darker one

The cost, and it is a real one. Two tokens that mirror swap which of them is darker when the theme
flips, so anything needing one member to stay on the dark side in both themes cannot be built out of
this pair. A label band is the shape that wants exactly that: a Markdown table's head reads as a
band behind its rows when it is the deeper of the two, and as a chip laid on top of them when it is
the lighter.

What follows from the table above is that no assignment of `paper` and `paper-hover` gives a head
that is deeper in both themes -- head `paper` is deeper in dark and lighter in light, and head
`paper-hover` is the reverse. Swapping the component's two tokens moves the problem between the
themes without removing it, and swapping the palette's two light values fixes the head at the price
of the thumbnail, the card and the hover feedback, all three of which were right.

So a band that must always recede needs a pair of its own, and that pair is not written yet --
[todo.md](../todo.md), "A table head wants a ground that stays the darker one in both themes".
