# Controls, surfaces, and the motion they answer with

Where a panel opens, what a rail offers, and when an animation is allowed to cost a frame. Which
of the three systems writing CSS is entitled to say each decision here, and what happens where two
of them say the same thing, is [architecture/css/layers.md](../architecture/css/layers.md).

## A menu opens from the edge its trigger is anchored to

A control sitting in a row's flow opens its panel from its left edge, which is where the eye
already is. A control the page has pushed to the article's right frame opens from its right, so the
panel and the thing that summoned it share an edge rather than the panel hanging inward from a
control that is itself against the frame.

The condition is the rail's again, and it is read off whether the rail is rendered -- the computed
`display` of `.article-rail` -- rather than from a width. That keeps the breakpoint the one number
in `utilities.css`, which a script asking `matchMedia` for `68rem` would have quietly copied.

**This one is decided in script, and the rule about CSS choosing does not apply to it.** A panel is
not in the document until it is opened, so there is no server render for the choice to survive and
no first frame to be wrong. What there is instead is a frame to be wrong _after_: the alignment is
settled in the open handler, before the panel mounts, because an effect running after it has
mounted would position it against one edge and then move it in view.

Above the rail's width nothing changes, which is the point -- there the control sits in the row
behind the summary and opening from its left is what it always did.

## A floating surface stops where the page's text stops

A menu, a popover, anything the floating layer places: when a collision pushes it back from the
window's edge, it stops at 1.5rem, which is the article column's own gutter. The library's default
is 8px. That is invisible on a laptop, where nothing opens near an edge, and wrong on every width
below the rail's, where the language switcher sits against the column's right frame and its menu is
wide enough to be pushed back every time -- the panel ends up a hair from the glass while the paragraph beside it
holds a clear margin, which reads as the menu having fallen off rather than opened.

The value is written as a number in [menu-content.svelte](../../apps/site/src/lib/components/menu-content.svelte)
because the library measures in pixels and cannot read a custom property, so it agrees with the
column's `px-6` by hand rather than by reference. One number, in the one component every menu on
the site renders through.

It is not a phone rule with a breakpoint. Collision padding does nothing until something collides,
so the same declaration is invisible at every width where there is room and correct at the one
width where there is not -- which is a better shape than a media query that has to name where
phones end.

## The subscription surface closes both reading paths

The same Newsletter component appears on the homepage and after the body of every article.
The homepage reaches somebody browsing the site; the article tail reaches somebody who has
finished reading. These are two entrances to one subscription, so they share copy, state and
presentation rather than growing page-specific variants that can drift apart. On the homepage,
Newsletter precedes Support so the larger subscription invitation remains part of the reading flow
and the smaller actions finish the page.

An article separates the invitation from its authored body with the same quiet one-pixel rule
used by the homepage's structural surfaces. The rule belongs to that placement, not to the
Newsletter default, because the homepage already arrives at it across a section boundary.
The invitation sits after the semantic `<article>`, not inside it: the table of contents scans
that boundary, so only headings authored as article content can enter its navigation.

Homepage-only interaction stays outside it. Support actions describe the site as a whole and
would turn every article ending into a second homepage footer; an article page ends after its
subscription invitation instead.

## Compact action rails reveal detail on demand

The homepage Support surface holds Like, one favour to ask, and Sponsor. These are reader actions
and read as one small section; revision and Follow stay off the page until they have a quieter
placement of their own. Visitor, uptime, word-count, update-age and license rows do not appear on
the homepage.

**The middle slot moves on once its favour has been done.** Asking the same reader to set the same
source preference on every visit is asking nothing: once it is set there is nothing left to set,
and a control that goes on offering it is furniture. So it offers Google first and a star on the
repository afterwards -- a different favour, in the same slot, rather than a second pill that
would be permanent clutter for the readers who never do either.

Which one is showing is decided from two stores, and each answers a different question about the
same click. `support.preferred` in the reader's state record -- see [engagement.md](../engagement.md)
-- says this reader was sent to Google at some point, which is what moves the slot on.
`sessionStorage["support.preferred"]` says it was this tab that did it, which is what stops the
slot moving under them: a reader who clicks and then reloads, or navigates away and comes back,
would otherwise find a different control where they just pressed one, and a page that changes its
mind about what it is asking for reads as a page that lost track. Within the tab that did it, the
pill stays where it was.

The two live apart on purpose. One is a fact about the reader and belongs in the record a later
build will sync between their devices; the other is a fact about a visit and has no business
outliving the tab.

Neither store exists on the server, so the markup carries Google -- right for every first-time
reader, which is everyone the server can see -- and a returning reader's pill changes after
hydration. This is the one place on the page where that is accepted rather than designed around,
and what makes it acceptable is that both resting labels are a six-letter brand name: the row does
not move, one word is replaced by another. Every storage read is wrapped, because a reader in a
private window has no stores and the default is already the right answer for them.

Each Support action presents an icon and its shortest useful identity at rest, while pointer hover
and keyboard focus reveal the full localized instruction in place.

The rail measures each localized short and long label, then springs the button between those live
widths with `motion`. This is computed geometry rather than a fixed hover target: locale, font and
the Like count all change the answer. When the short label is a substring of the instruction, that
shared text stays as one DOM segment. Prefix and suffix segments sit in zero-width masks driven by
the same spring as the pill: a suffix is uncovered after a stationary label, while a prefix pushes
the shared label right as it is uncovered. This makes the copy read as material revealed by the
pill rather than one string replacing another. Every shipped locale preserves that substring for
all four Support labels -- both of the middle slot's favours included -- with a message contract
test guarding the relationship. The component
keeps a crossfade only as a defensive fallback; these actions must not rely on it. Translations
choose an idiomatic local short label first rather than forcing an English noun into every locale.

Like keeps its remembered state legible without making the whole rail permanently heavy. A click
fills the heart and updates the count; leaving returns the button to the ordinary paper surface.
Hovering or focusing a remembered Like inverts it to the ink surface. The same state changes must
remain understandable through `aria-pressed`, and reduced-motion users get the final labels without
the width transition.

**The reveal answers to whether the pointer can hover, not to how wide the window is.** A touch
screen has no hover, but a tap synthesises `mouseenter` -- so the pill would grow under the finger
that meant to press it and then stay grown, with no pointer to leave and take it back. Reading the
instruction costs a press either way; growing first only moves the target.

This was first written as a width, and width is the wrong question. An iPad reports 1133px and
`hover: none`: wider than any breakpoint this site draws, with nothing on it that hovers. The
guard was open on the one device class it existed for, which is the failure a proxy makes and the
capability it stands in for does not. `(hover: hover)` also answers correctly for the case no width
can describe, a laptop whose screen is also a touch screen: it has a pointer that hovers, so it
expands, and it is right that it does.

Only the pointer path is guarded. Keyboard focus is never what a tap produces -- the component
tests `:focus-visible` -- so a tablet with a keyboard still gets the full label on Tab. Collapsing
is not guarded either: whatever opened a pill has to be able to put it back. The query is live
rather than read once, so a tablet that is given a trackpad finds the other answer.

Sponsor is deliberately unavailable while U.S. F-1 immigration restrictions apply. Activating it
opens a modal notice instead of navigating away. The rest of the page blurs behind the modal, and
either the close control or any point on that background dismisses it.

That notice is interface copy, so it resolves through the UI message table at the page's own
locale like every other string around it -- heading, sentence and the close control's label
alike. It names the restriction plainly in all nine views rather than softening to a generic
"unavailable": the reader is being told why an offered action does not work, and a reason that
survives translation is the only version of that sentence worth having.

Its heading is visible rather than announced to assistive technology alone. A modal carrying one
sentence and a bare close control reads as a fragment of the page rather than a surface of its
own, so the notice opens with the icon of the action that summoned it beside a heading weighted
like the page's other section headings, with the sentence below in the metadata text colour. The
icon and the close control are each centred on one line box, so a heading that wraps in a longer
locale moves the text without dragging them out of line with its first line.

Data palettes belong to the visualisation that gives them meaning, not to the site theme. The
Cargo palette lives in a component-only stylesheet scoped below `.cargo-widget`; it stays vivid
in both page themes and never becomes a token available to unrelated interface chrome.

## Motion runs at runtime only when the value is not known in advance

`motion` is a dependency, and reaching for `animate()` is the wrong default. It earns its place
where the target is computed -- the article list measures the corpus before it knows what widths
to animate to, and no stylesheet can hold a number that does not exist until the page has read
its own content. When a hover, open or state flip has targets written in the source, running it
through a library puts a per-frame JavaScript cost on an animation CSS was going to composite
anyway.

Wanting spring physics is not a reason to cross that line. A spring is a curve, and a curve can
be sampled once and written as a CSS `linear()` easing -- which is what the library itself emits
when it hands an animation to the browser. Sample it from `motion`'s own generator so the
physics are not reimplemented by hand, then paste the result. The repo keeps the real curve and
spends nothing at runtime.

Sampled once means stored once. The curve lives in `--ease-spring` and every consumer reads it
from there; a second copy of those points is how two animations meant to feel identical begin to
drift apart.

One trap worth stating, because it is invisible until someone wonders why the bounce never
shows: an overshoot has to have somewhere to go. A spring driving `background-size` or a colour
is clipped at its limit, so the overshoot is spent on nothing and the curve should simply be
damped out. A transform or an unconstrained layout dimension such as width has room to show it.

## The theme control is a button, not a menu

It is built and has no home yet: nothing on the site renders it while its placement is being
decided. What follows is the component's own contract, which does not depend on where it lands.

Two states, so the control is the choice rather than a way to reach it. It writes the cookie and
toggles the class, and nothing reloads: every colour on the page is a token under that one class,
which is the whole reason the class exists.

**It reads the class, never the cookie.** The pre-paint script in `app.html` settles the theme
before this component exists, from the cookie if there is one and from the system query if there
is not -- so on a first visit the cookie says nothing and the document already says everything.
The server cannot render the control for the same reason, and it renders neither icon until
mounted rather than guessing one and swapping it a frame later.

Both glyphs occupy one grid cell and the unused one is hidden rather than removed, so the row's
height is the same in both states and the sun and the moon cross without anything below them
moving. The turn is one rotation: the outgoing glyph leaves along the path the incoming one
arrives by, so a press reads as one dial turning rather than two icons trading places.

**It animates only after a press.** Arriving on a page that is already dark is not a change of
theme, and spinning the icon on every load would announce something that did not happen. That is
the same line the newsletter draws in [engagement.md](../engagement.md) between what a reader just
did and what they are.

Path and lifetime for the cookie come from `@canmi/theme`, which also builds the pre-paint
script, and a test holds the two to the same string. A control writing a shorter life than the
script would expire a preference on one path and not the other, and nothing would report it.
