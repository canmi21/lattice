# What the console remembers

The console keeps what a reader set on its pages, so a reload or a return finds them where they
left them, and forgets what the reader opened only to close again. Which store a fact goes in is
read from what the reader meant by setting it. Decided with the author on 2026-10-10.

## The mechanism is the kit's

**The console keeps its facts in `@canmi/kit/behavior/state`**, as the site does -- the lib
repository's `spec/kit/state.md`: flat dotted keys, records declared as data, their steps run by
the kit, a later version left alone, the store passed in. **The console declares records of its
own** in `src/lib/state.ts`, `reader` paired with `localStorage["state"]` and `tab` with
`sessionStorage["state"]` on its own origin, with no steps yet; it shares no key with the site's,
so it does not take `@canmi/records`. A loose key outside the two records is the scatter the
mechanism exists to stop.

The sitting's record holds `scroll.at`, each path's place, and `tab.at`, each page's tab last
open, each one key holding a map from path, as the site's `scroll.at` does: the keys are addresses,
not names the console chooses.

## Kept, and where

**Whether a fact is kept for the person or for the sitting is read from the reader's intent.**

- **A preference is the person's, in `localStorage`**: a choice of how to see something, made to
  hold until it is made again, that the first response is not drawn with. A choice made inside a
  menu is kept, the menu being only the way to it.
- **A place is the sitting's, in `sessionStorage`**: where the reader had got to, which matters while
  they are moving about and is a surprise the next day. How far down each page's main area was
  scrolled, by path, and the tab last open on a page. Within one browser tab, moving from page to
  page and back keeps each page's place, and a reload keeps it, as `sessionStorage` does; a new
  tab, a closed browser, or storage the browser cleared starts every page from its top, which is
  what a reader coming back fresh expects.
- **A fact the server must know to draw the first response is a cookie, and only a cookie**: the
  theme is the kit's `theme` cookie, read as the page is drawn, and it is not kept a second time in
  either record. Two copies would disagree the first time one of them is cleared. **A preference
  that changes the first paint is such a fact**, so the server draws it as it was left rather than
  drawing the default and redrawing: the overview's span, `span`, and the map's view, `map`, a
  globe opening round rather than turning, each a cookie of a year at every path, written as it is
  chosen -- `src/lib/ui/preference.ts` -- and the span's dimension, `dimension`. **The reader's zone
  is one as well**, `timezone`, its IANA name as the browser gives it -- `America/New_York`,
  `Asia/Kolkata`, `UTC` -- written by the browser on every load where it differs from the
  browser's own, so a reader who moves is drawn right from their next load on. A name the server
  does not know is ignored. Without a usable cookie the server takes the zone Cloudflare names,
  and only that first visit may redraw once the page wakes -- `src/lib/ui/time-zone.ts`.

## Not kept

**What a reload is pressed to reset is not kept.** A reader reloading a page often means to put
something back as it was, so nothing that was open only for a moment survives one:

- **An overlay** -- the finding panel ⌘K opens, a dialog -- is closed after a reload.
- **A menu** is closed after a reload, and so is any group folded open inside it; the option chosen
  in it is a different fact, and is kept.
- **A hover, a focus, a card a mark opened**, and anything else the pointer holds open, is not a
  fact at all.

## A place comes back as near as the page still allows

**A return is at its place from its first frame, and never moves to it.** A reload, or a path come
back to in the same tab, draws the page where the reader left it: no frame of the page's top
first, and no scroll from the top down. The main area scrolls on its own, so the browser restores
nothing; two scripts the page carries do it before any module loads -- one in the head hides the
main area where a place is kept, one right after it sets the offset and shows it -- and the
hydrated page only corrects where the content has changed under the offset. A page may paint
before it is parsed whole, which is why the area is hidden rather than trusted to be set in time.

**Motion to a place is for one arrival only**: the first time this tab comes to a page, with the
address naming an anchor or a chosen state in it -- a link into a section, as the site's
articles take -- the page is carried there, since the reader has not seen it and the motion says
where they were sent. Anything kept is returned to in place.

**A page's scroll is restored in steps, each a fallback for the one before.** With the offset the
page keeps the section the reader was in, by the section's own name, and how far into it they were.
Back on the page, the offset is taken where the page is still as it was; where its content has
changed, the section is found and the reader set that far into it; where the section is gone, the
page opens at its top. A page still drawing its data follows its height until it settles, and the
reader's own scroll ends the following at once, as the site's restore does -- the site's
`spec/engagement.md`, "A path keeps its place, because Back is a link".
