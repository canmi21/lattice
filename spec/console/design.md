# Console design: the shell, and what it is drawn with

The console's own look, kept apart from what it does --
[../architecture/console.md](../architecture/console.md). It covers the shell, the sidebar and the
top bar, and the parts they are built from, all in `apps/console/src/lib/design/`; where the reader
is, which the shell draws, is [navigation.md](navigation.md). **The pages are
not in it yet**: they were put together to bring the data through, and each is redrawn, and its
rules written beside this file, as it is taken up -- the overview first,
[overview.md](overview.md). Until then nothing on a page is a precedent for the shell.

## Color and icons

**It is black and white, drawn with semantic names** -- ground, surface, line, text, good, warn,
danger and the series -- that a palette fills. The kit's `mono.css` paints the interface in light or
dark; the icon at the top bar's right edge, Tabler's filled brightness mark, switches the two,
mirrored in the dark so its filled half changes side, and keeps the choice in the kit's `theme`
cookie. Nord supplies the chart series alone, so data keeps its distinctions while the interface
remains monochrome. **Tabler is the console's icon family**, with 18 px navigation and theme icons,
16 px inline controls and 14 px compact state marks. Navigation has a lighter stroke; small state
marks have a heavier one. Its charts are drawn as SVG by the app itself with d3's scales and shapes,
so the server renders them whole: a chart library drawing on a canvas would paint nothing until the
browser ran it.

## The shell

**The shell is three fixed regions, and only the page scrolls.** The sidebar runs down the whole
left edge with its rule, the top bar sits right of it alone, and the page between them is the one
scrolling element; the document itself never scrolls or bounces. Their sizes are in `rem`, so the
three keep their proportions as the reader's text size changes. The top bar carries the scope on its
left, the page's name at its center and the page's actions on its right -- creating something,
whatever comes later, then the zone every moment on the page is written in, then the light-and-dark
switch at the outside edge. The zone is the page's and not the account's, which is why it sits
beside the page's actions: it decides how every time and every chart is written, and a choice of
zone, when there is one, is what it becomes. The account sits at the foot of the sidebar, last, in a
region of its own. Who is signed in and through where -- the avatar, the name, the relay's country
-- is one button: the menu it opens waits on accounts, and the whole group raising on hover is what
says it opens one, with no icon to say it. Beside it, at the region's right edge, are two icons: a
merge, a link to the commit the console was built from -- by lib's `spec/web/build.md`, its short
hash on the link's hover -- and a bell for notifications, which waits on a feed of them as the menu
waits on accounts. Until the platform's accounts exist it shows the author, from `@canmi/me`'s
identity and their GitHub avatar through the CDN, so the region has its final shape before it has
anything to sign in to -- web's `spec/todo/milestones.md`, D3. The avatar sits on a neutral disc
until the picture arrives; a placeholder of its own is platform's `spec/issues/services.md`, "An
avatar has no placeholder a page can paint before it arrives".

**Whether the console is live is a dot on the avatar's corner and nothing else**: green while the
socket is up, red while it is down and the page polls, and quiet for the moment before the socket
has tried, so no load paints a red it is about to take back. It is ringed in the sidebar's ground,
as a presence dot is. How many nodes are heard is the pages' to say, not the shell's. Under the
name is the country of the relay the console is reached through, in full -- `Japan`,
`United States`. The commit is an icon rather than a line of text: the region holds two lines, and
a third fact written out made it a column of small type. No moment is shown, the build's or the
reader's. The relay is the node nearest the reader, worked out on the server from where Cloudflare
says they are without asking any node -- the order the Worker itself tries them in -- until the
socket has gone through one and names it.

**The zone in the top bar is the request's**, as every moment on the page is written in, and it is
written as its offset from UTC with a sign -- `UTC-4`, `UTC+5:30`, and UTC itself `UTC+0` -- so
every zone reads one way, never as a city's name or Intl's `GMT`; its name is on its hover.

**The sidebar's head is the way in to finding.** It is as tall as the top bar, so the two heads read
as one band without a rule between them, and it holds one control: `Find…` drawn as a field, with
its shortcut, `⌘K`, beside the word. The view being read stays at the top bar's left, beside the
page it narrows -- the head is not a second place to choose it. What `Find` opens is the site's
search, its behavior taken into the author's library without the site's look and drawn here in the
console's; until then the field opens nothing. **It finds within the view being read**: with
Platform chosen at the top bar's left it searches the platform's layer and nothing else, Services
the services', and All every layer at once, so the switcher narrows what is found as it narrows what
is shown.

**The sidebar keeps one edge and one column.** Every region's box -- the field, a section's link,
the account's button -- starts and ends on the same gutter, `0.75rem` in from the sidebar's sides,
and every icon inside them, the avatar included, is centered on one column, so the eye runs down
the left without a step. The sections' links are spaced apart by `0.25rem`, enough that the raised
one never reads as touching the next.

## A card is lifted, not outlined

**A card stands off its ground by its own ground first and its rule last.** In the light the ground
is a step grey and a card white on it, with a shadow too faint to read as one; in the dark the
ground is black and a card a step above it, with no shadow, which the dark cannot show. The card's
rule is a share of the text's own color -- black at 8 percent in the light, white at 9 percent in the
dark -- rather than a gray of its own, so it sits as lightly on any ground and never reads as a line
brighter than both sides of it. Mono, the palette the console takes its grays from, has the
opposite: a card a step darker than a white ground in the light, and in the dark a solid gray rule
that glowed around every card; the console names its grounds the other way round in `app.css` and
leaves the palette as it is. **A chosen option sits a step off its frame and no more** -- black at
5 percent in the light, white at 7 percent in the dark, each about as far from the card as the
other -- where mono's 10 and 13 read as grey; near black a few percent is a large step, the eye
reading lightness by ratio, so the dark's value is tuned by eye and not by symmetry. Decided with
the author on 2026-10-09.

## Words in the sans, figures in the shell's face

**What a reader reads as words is in the sans; what they read as a figure is in the shell's face.**
The shell's face is the site's Ioskeley Mono, `--font-shell`, from `@canmi/fonts`'s `mono.css`:
the same chunks in the object store the site's code blocks take, its host filled in by the console's
build as the site's is -- the CDN in production, the local gateway in development, where the
avatar is read from too. A percent, a count, a size in `G`, a span like `3d 2h` or `58s`, a time
ago, and a code name are figures; a heading, a label, a place's or an app's name are words. The
regular cut is the one reached: nothing in the console sets a figure bold or italic, so the cuts
the site's fonts spec calls unreachable stay unreached here too -- web's
`spec/architecture/fonts.md`, "Only the regular cut of the monospace face is reachable, and the
rest stay". A figure's label stays a word, short: `Nodes`, `Deploy time`, not a phrase.

## A page is named once, in the top bar

**A page's name is the top bar's trail and nowhere else on the screen.** The page itself carries no
visible title: what it is about is the trail's last step, and a title under it would say it twice.
Each page keeps its name as a heading for assistive technology alone, so a reader moving by headings
still lands on it, and what a title row used to hold beside the name -- a state, a count, the facts
of the thing, the time range -- stays, as the page's first row.

## Icons

**A button that is only an icon is one component, `src/lib/design/icon-button.svelte`, in one of two
kinds, square or round.** `ghost` has no ground of its own and rises on hover -- a bar's own
controls, the top bar's light-and-dark switch. `framed` is filled with the surface and ruled by a
one-pixel shadow rather than a border, as Geist's secondary button is, so the rule takes no room and
the button is exactly its size; its hover lifts the fill and leaves the rule -- a control set apart
from what is around it, the sidebar foot's commit and notifications, round at 1.75rem around an 18
px icon. A kind is added to it rather than drawn again where it is wanted, so every icon on the
console answers a hover the same way; its name is its label and its hover both.

### An icon is drawn in three layers

**An icon's box, its drawing's offset, and its drawing's scale are three things, and only the first
is layout's.** The box is a square of the size asked for, and its center is the one point everything
around it aligns to. The drawing is then moved off that center, and scaled about it, by the icon's
row in `src/lib/design/optics.ts` -- in the units of its own 24-unit grid, so one correction holds at
every size it is drawn at. Both are done through the drawing's `viewBox`, as the player's cog is --
web's `spec/styling/player.md` -- so the box, and any focus ring or frame around it, never moves;
and a scaled drawing is given its stroke back, so it keeps the weight of the icons beside it.
`src/lib/design/icon.svelte` draws every icon that way.

**A correction is measured, and then judged.** An outline icon's ink is weighed by rendering it and
taking its centroid against the grid's center: `git-merge` centers at x 9.97, two units left,
because two circles and the stem sit on the left and one on the right. Its correction is three
quarters of that, 1.5 units right, since a drawing moved all the way to its centroid reads as having
overshot. The table holds one row per icon, so an icon is corrected once and is the same wherever it
appears.

## Styles are written in three layers

**The console writes CSS the way the site does: a Svelte `<style>` block, StyleX and Tailwind, each
deciding what it may say by the questions web's `spec/architecture/css/layers.md` asks, in its
order.** An element with no class -- what Bits UI portals out and keys off a state attribute, a
keyframe, a pseudo-element -- is the `<style>` block's. A declaration that is a member of a named
recipe, or of the type ramp -- color, radius, border, shadow, opacity, transition, the type -- is
StyleX's, on the kit's vocabulary tokens and the palette's semantic names, never a literal:
`duration.base` rather than `120ms`, `radius.full` rather than a large number. Everything else is a
one-off on one element and is Tailwind's, in the markup: layout, spacing, size, position, and a
`cursor` that no recipe carries.

**What the console borrows is the layering and the kit, never the site's look.** The site's surfaces
are the site's; the console's recipes are in `src/lib/style.ts` and beside each component in
`src/lib/design/`, and a recipe is named there once a second component needs it.

## Accessibility

**Every control the keyboard reaches shows where it is, by the site's own rules**: the ring is
`@canmi/kit/tokens/interaction.css`'s -- a `0.125rem` outline flush with the control, its color
declared at rest so it never fades in from the text, the placements for a ring on a child or a
frame, and the browser's own replaced rather than removed -- and the kit's `focus-source` tracker
records what the last input was, so a press positively known to be a pointer draws none. Why each of
those is so is web's `spec/styling/focus.md`; the console takes them whole rather than writing a
ring of its own. **The ring and a selection are the site's blue**, concrete's accent, `oklch(0.623
0.214 259.815)`, in light and dark alike, set over mono's in `src/app.css`. A selection is that blue
solid with white on it, written outside every layer, since mono's own selection is unlayered and
would otherwise win.

**The shell is landmarks a reader can jump between, and the keyboard's first stop skips it.** The
sidebar is an `aside` labeled `Console`, its links a `nav` labeled `Sections`, the trail a `nav`
labeled `Breadcrumb`, and the page `main#content`; `Skip to content`, the first thing Tab reaches,
is out of sight until it is focused and lands on the page.

**What is seen is also said, and nothing is said that is not so.** The presence dot is hidden from
assistive technology and told in words by a status region beside it -- `Live, through rdu` -- as it
changes. A button whose menu waits on a feature -- the account, notifications -- does not claim
`aria-haspopup` until there is a menu to open: a promise read aloud that the click does not keep is
worse than none. Menus are Bits UI's, which carries their roles, keys, focus return and dismissal.

## What can be selected

**Selectable is what a reader would quote, and nothing else.** A drag across the console takes the
page's text and the facts beside it, not the words on its controls, so three rules decide every
element, read in this order:

1. **The chrome is not selectable.** The sidebar and the top bar are `select-none` at their roots,
   and everything inside them inherits it.
2. **A control never is**, wherever it stands: a button, a link drawn as a control, a keycap, a menu
   item, a toggle. Its words are its name, not something to copy -- `⌘K` beside `Find`, the view's
   name on its switcher, the account's name on its button.
3. **What a reader would quote is reopened with `select-text`**, where the chrome would otherwise
   close it: the page's name and its code in the top bar, which are an app's name, a run's number;
   the zone. The text inside a field is selectable as a field's always is -- `Find`, once it opens
   one.

Written in the markup, as Tailwind's `select-none` and `select-text`, since each is one element's
one-off -- web's `spec/architecture/css/layers.md`. The site decides this component by component
with no rule above it; its departures from these three are recorded in web's `spec/issues/site.md`,
and it moves to them later.

## Motion is GSAP

**The console animates with GSAP, and a reader who asks for reduced motion sees none of it.** The
author chooses the animation library per project -- the site and the apps around it move with
`@canmi/kit`'s motion, and an operator's panel, which wants timelines over a dashboard's many small
parts rather than a component's springs, moves with GSAP. Every animation in the shell starts in
`src/lib/design/motion.ts`, whose `stilled()` answers `prefers-reduced-motion` once for all of them,
and true on the server, which draws no motion. A surface that opens -- the view's menu -- arrives
from a step above where it rests, in 160 ms. A level of the sidebar giving way to the next leaves by sliding a step
toward the side it is left by while the next arrives from the other, 140 ms out and 180 ms in,
overlapped; the copy it slides away is inert and hidden from assistive technology, and is removed
when it has gone -- [navigation.md](navigation.md).
