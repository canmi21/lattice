# The first paint

## A measurement the server could not take is settled once, on arrival

Three things on this site are drawn from numbers no server has: where the bars in the table of
contents end, what shape a homepage thumbnail is, and how far down the article the reader
already is. Each is read off the laid-out document, so the first frame is drawn without it and a
moment later the real value arrives. **That settle is animated, and the animation belongs to the
first paint of a document and to nothing after it.**

Two separate things say so, and they are worth keeping apart because only one of them is about
motion.

The first is that after hydration there is nothing left to cover. A client navigation happens
inside a browser that already exists, so the page it is going to can be measured before it is
painted -- the same way its data is already fetched before it is painted. Animating there does
not ease a value into place; it eases a value that was already in place, which is
[controls.md](controls.md), "A value the reader is already driving takes no easing at all",
arrived at from the other direction. The reader is not driving this one, but the page is, and
the objection is the same: the motion is about the code's own late arrival rather than about
anything that happened.

The second is that a flourish is only a flourish once. On arrival it reads as the page coming
alive. On the second article it reads as the site doing its trick, and by the third it reads as
slowness. This is a fact about the reader rather than about the frame budget, so measuring the
animation faster does not answer it.

## The animation outlives the measurement that excused it

The rule above is not "animate where you must". If the day comes that a first paint needs no
measurement at all -- the shape baked into the markup, the scroll position known before the
document is parsed -- **the arrival keeps its animation anyway.**

It started as a cover for a value that was late and is kept as a greeting, and those are not the
same claim. A page that assembles itself once, in front of the reader, says that something was
prepared for them. Nothing about that depends on there having been a gap to hide, which is why
removing the gap must not silently remove the greeting with it.

What does follow from removing the gap is that the animation becomes the site's to choose:
duration, easing and what moves stop being dictated by how long a measurement took.

## A page declares what only a browser can work out

The rule above says an arrival may animate and a navigation may not. What makes the second half
possible is that **a client navigation can take the measurement before it paints**, and the place
to take it is the page's own `load`.

A universal `load` runs on the server for a document and in the browser for a navigation. So a
measurement written there is absent in the first case and present in the second, without the page
asking which it is in:

```ts
const shapes = await measured(() => thumbnails(articles, fontOfClass('article-preview-subtitle')));
return { shapes, articles };
```

The component takes it as a prop and reads its absence as the instruction:

```svelte
{ shapes }: { shapes?: Bar[][] }   // absent: draw the default, then settle
```

**The absence is the signal, and it is the whole mechanism.** A component that gets nothing was
rendered by something that could not know, so it draws its declared default and animates to the
value once it can measure. A component that gets a value was rendered by a browser that already
knew, and there is nothing to animate because nothing is going to change. Neither has to be told
which kind of render it is in, and no third state has to be kept in sync with the first two.

### The default is declared, and is not necessarily nothing

What a component draws while the value is missing is a real design decision, not a zero. An
article thumbnail's bars have a hand-tuned shape that reads as a page of text; the table of
contents rests at half. The animation goes from the declared default to the measured value, so
the default is the first thing a reader sees on every document load and is drawn to be seen.

### It is `undefined` during hydration too, and that is the difference between the two rules

SvelteKit runs a universal `load` again in the browser as it hydrates. Left alone, the
measurement would therefore arrive one frame after the server's default, and a first paint would
*jump* instead of settling -- measured on the homepage: 32px to 26px in one step, two distinct
widths across 120 frames. `measured` answers `undefined` while the document is still the one the
reader arrived in, which is the flag the section below already keeps. With it, the same first
paint springs through 33 widths, and the client navigation that follows draws 26 on its first
frame and never moves.

### What it cannot cover, and what to do there instead

The measurement has to be one a browser can make **without the page it is for**. Text width is:
`measureText` on a canvas needs the string, the font and the width available, and all three are
either in the load's own data or facts about the stylesheet -- which is why `fontOfClass` reads a
probe wearing the class in the document already open rather than an element on a page that does
not exist yet.

A measurement of the laid-out page is not, and `scrollHeight` is the example. The answer there is
not to reach for the DOM early but to notice that the value is usually known anyway: a navigation
arrives at the top of a page, so a reading position is zero whatever the document's height turns
out to be.

**A `load` that measures delays the navigation**, so it is bounded. Fonts are waited for, because
text measured in a font that has not loaded is measured in a different font, and the wait is
raced against a deadline: a slightly wrong width is a far better answer than a page that does not
come.

## Arrival is a property of the document, not of the component

The decision is never "is this component mounting for the first time". A component mounts on
every client navigation that renders it, and one that asked itself would animate on all of them
-- which is the behaviour this rule exists to stop.

It is one fact about the document, held in one module: **whether any client navigation has
happened in this document yet.** True until the first one starts, false forever after. It is set
in `beforeNavigate` rather than `afterNavigate` because a navigation renders its page before
`afterNavigate` runs, and a component reading the flag while that page is being built has to
already see the new answer.

A reload is a new document and therefore a new arrival, which is correct: the reader is looking
at a blank tab again either way, and nothing in it survives to be continuous with.

The reading ring is the worked example. Its entry transition is armed from the markup the server
wrote, so the browser has a starting frame to animate from, and it is taken off once the settle
has had its 260 milliseconds -- every move after that one belongs to a hand. See
`article/reading-progress.svelte`.

## A class armed after mount is itself the change it was meant to exclude

The obvious way to write "animate on a change but not on arrival" is a flag that starts false and
is set true in an effect, with the animation selector gated on it. It does the opposite of what it
says. The flag flips one frame after mount, the selector starts matching, and **a rule that has
just begun to match starts its animation** -- so the component animates on arrival and only on
arrival, which is the one case the flag exists to rule out.

It is invisible in the state the page usually loads in, because the arriving face is the resting
one and the turn lands where the glyph already was. It shows up in the other state, which is how
this was found: a document served in dark mode played the theme control's turn for no reason.

What works is counting the changes rather than marking that mount has passed. The count is zero on
arrival whichever face is showing, so nothing matches; it is one after the first real change, and
from then on the animation is restarted by the glyph moving between the two cells rather than by
the gate. `components/dial.svelte` does this, in `$effect.pre` so the class lands in the same flush
as the face it belongs to.

The general form: **a gate for an animation must be false for a reason that is still true, not
false only because the code has not got to it yet.** The second kind always fires once.

## Reduced motion takes the end state, not a faster arrival

A reader who has asked for less motion is asking not to be moved, not to be moved briefly. The
arrival is where the measured value is written straight in, with no transition armed at all.

## What this is not about

Motion that belongs to something the reader did is untouched by any of this, however often it
repeats. The theme control turns because somebody pressed it; the subscription sequence plays
because somebody subscribed; a disclosure opens because somebody opened it. Those animations
describe an event, and the event happens as often as it happens.

The test is whether the reader could name what moved. If they can -- "I pressed the thing" --
the motion is theirs and repeats. If the honest answer is "the page finished working something
out", it is an arrival and happens once.
