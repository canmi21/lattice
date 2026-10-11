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

**The zone in the top bar is the reader's**, as every moment on the page is written in, and it is
written as its offset from UTC with a sign -- `UTC-4`, `UTC+5:30`, and UTC itself `UTC+0` -- so
every zone reads one way, never as a city's name or Intl's `GMT`; its name is on its hover.

**The sidebar's head is the way in to finding.** It is as tall as the top bar, so the two heads read
as one band without a rule between them, and it holds one control: `Find…` drawn as a field, with
its shortcut, `⌘K`, beside the word. The view being read stays at the top bar's left, beside the
page it narrows -- the head is not a second place to choose it. **A press on the field makes it live
where it stands**, its size and its look kept, and **the first letter typed grows it**, right and
down from its corner by GSAP over 220 ms, into the panel of what is found, which stays grown though
the field is emptied, until it closes; **the shortcut opens it from anywhere in a palette over the
page**, which dims behind it, so finding something never loses the place one was at -- one body,
`find-body.svelte`, in two surfaces, decided with the author on 2026-10-10. What `Find` opens is the
site's search, its behavior taken into the author's library -- `@canmi/kit`'s shortcut, which opens
it from anywhere on `⌘K` or `Ctrl K` and closes it on the same keys from its own field, and its list
cursor, which the arrows, Home, End and Enter drive as a combobox -- and drawn here in the console's
look. It finds the view's pages, its nodes where the view shows them, each by the part of its place
that tells it from the others there, `Narita, Japan`, and found by the whole place too, and the apps
the view holds, by name or code; a name that starts with what is typed comes first, then a word in
it, then a code, then anything holding it, under the headings Pages, Nodes and Apps. Enter opens the
one the cursor is on. **It finds within the view being read**: with Platform chosen at the top bar's
left it searches the platform's layer and nothing else, Services the services', and All every layer
at once, so the switcher narrows what is found as it narrows what is shown.

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
leaves the palette as it is. Decided with the author on 2026-10-09.

## Hover and choice are one wash at two strengths

**What the pointer is over and what is chosen are the text's own color laid thin, the one at seven
tenths of the other.** A theme sets two values in `app.css`, the wash's ink -- black in the light,
white in the dark -- and its full strength, 5 percent in the light and 7 in the dark;
`--color-selected` is the full strength and `--color-hover` seven tenths of it, so the two tiers
keep one ratio in both themes and a third tier is a third share, never a third gray. A chosen option
sits a step off its frame and no more, where mono's 10 and 13 percent read as grey, and where the
sidebar's solid `paper-hover` stood a whole gray step off the dark's black. Near black a few percent
is a large step, the eye reading lightness by ratio, so the dark's strength is tuned by eye and not
by symmetry. **One state takes the stronger wash; two take both.** Where a
surface shows only the pointer -- the account's button, the bar's icons, a card's title choice, the
view switcher, a menu's rows, the overview's places -- its hover is `--color-selected`, the tier
furthest from the ground in either theme (darker in the light, lighter in the dark). Only where
something chosen stands among what can be pointed at, as the sidebar's open page among its links,
does the hover step down to `--color-hover`, so the two still read apart. Decided with the author
on 2026-10-09; the one-state rule on 2026-10-10.

## An error is the site's page, in the console's frame

**A page that fails is drawn as the site draws one, inside the console's sidebar and bar**, so a
reader who met it still has every way on. Which of two pages it is and the protocol's name for a
status are `@canmi/web/error`'s, shared with the site -- lib's `spec/web/error.md` -- and each hook
stamps an unexpected error through it, beside Sentry's. The look and the words are the console's
own: the site's layout -- the status, a hairline, a sentence for a person on one line in the middle,
and the way out at the foot -- in the console's tokens, and its English sentences written in place,
since the console speaks no other language: `This page could not be found`, `Something went wrong`,
and for a browser that broke, with no status, `This page crashed in the browser. Describing what you
were doing helps`. The way out is the site's: Sentry's report form and the support address, each
told from the muted sentence around it by its ink alone, with no underline -- the site's underlines
are its own work, which the console does not carry. The tab is named `404 Not Found`, or `Unexpected
Client Behavior`. **Where the frame itself fails, `src/error.html` stands in**: SvelteKit draws
`+error.svelte` inside the root layout, so an error in that layout, or a module it cannot load,
falls to the static page, which was SvelteKit's bare `500 Internal Error` until 2026-10-09. It is
the same page as static HTML -- the console's colors written out and following the reader's light or
dark, the address written out, a way to try again -- and needs nothing else to load. Decided with
the author on 2026-10-09.

## A choice in a card's head is its title

**A framed switch floats over a drawing and nowhere else**: the map's flat-or-globe stands in its
corner, over the land, where a box reads as a control laid on a picture. Inside a card's head the
same frame is a box set in a box, crowding the title it sits beside, so **a choice there is the
title itself** -- the chosen option's words, a chevron after them, and a menu of the others under
it, `Last 7 days ⌄` -- in `ui/title-choice.svelte`; the pages the card leads to end the same menu,
under a rule that is drawn and not laid out -- no height and no gap of its own, so the menu is as
tall with it as without -- each with an arrow, `View all deployments`, so the head
keeps only the title and a legend. A page's own range, the deployments page's `1h` to `30d`, stands
in the page's head, where there is room for a framed switch. The overview's `All` and `Failed`
beside a card's title, and its `24h` and `7d`, were framed switches inside a card's head until
2026-10-09. Decided with the author on 2026-10-09.

**Every menu is built from one panel and one row, `src/lib/ui/menu-content.svelte` and
`menu-row.svelte`**: the title's choice, the view switcher at the top bar's left, a shared name's
choice of apps -- one panel, ruled and shadowed with no inset of its own, one row, edge to edge
with a mark's column each side of its words, so a rule set once holds in every menu and none
drifts into a look of its own, as the switcher had, inset and rounded and its rows taller. Decided
with the author on 2026-10-10.

**The menu opens out of its title**: its options' words stand under the title's, the menu as wide as
the title and as its longest item needs and no wider, set in the list's smaller type, the options
muted, the chosen one told by a check on its right alone, and the pointer's row on the hover's
wash: **a wash stays only where it says where one is**, as the sidebar's says which page is open, and
a menu's choice is said by its check, so its row's wash is the pointer's; **each row the menu's whole width, edge to edge, as the
site's menus run**, its wash cut only by the menu's own corners, so the rule above the links meets
no rounded row beside it and the menu needs no inset of its own. **That rule is the menu's only
one**: it parts choosing from going elsewhere, while a group needs none, its head and chevron
already where it starts. **Every row is a mark's column, its
words, and a mark's column**, either column empty where the row has no mark -- a head's chevron on
the left; the check and a link's arrow on the right -- so every row's words start and end at one
edge; a mark needs less room than words, so its columns stand nearer the edge and the words. It unfolds from a step smaller at
its top left, where the title stands, over 120 ms. **A long menu folds into groups a unit each, one
open at a time**: a group's head, its unit and a chevron, opens it in place and closes the one open,
choosing nothing, the one opening and the one closing carried together as one drawer, one GSAP timeline on one curve over 420 ms, quick at first and settling: each group's options hang whole under its head and are drawn out of it, the last first, or pushed back in, travelling with its edge rather than uncovered by it, never fading; no row lights up as it slides under a still pointer; a closed
group's options folded to nothing and out of the keys' reach; the menu opens on the chosen option's
group; and one option may stand in two groups, said in each one's unit, a mixed list having read `12
hours` and then `24 hours` above `3 days` as though 24 hours were not a day. Decided with the author
on 2026-10-10.

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

### An icon is drawn in layers

The console draws every icon with `@canmi/design`'s, whose rules -- the box, the drawing's
correction, its place among words, the dot a state is -- are lib's `spec/design/components.md`, "An
icon is drawn in layers".

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

## A card's inside is even on every side

**A card holds its content as far from each edge as from the others, measured to the ink**: the
first words' capitals, the last row's foot, and the sides' first and last marks all stand the
card's side inset, 20 pixels, from its edge, and a title stands as far from the rows under it.
What a layout adds on its own -- a choice's wash around a title, a row's room around its slots, a
measuring row taking its share of the gap -- is taken back out of the padding beside it rather than
left to widen one side, so the timeline's card head gives 12 pixels over a title choice where a
plain title has 16, and its legend stands as tall as the choice beside it. Measured 2026-10-10:
the top had been 27, the foot 24.5, the title to the rows 25.5. Decided with the author on
2026-10-10.

## A card's point runs on from its rule

**A card that points at what it is about -- the map's card at its mark, the timeline's tip at its
slot -- does it with one point, `lib/design/point.svelte`**: a triangle of the card's rule, and
over it a triangle of the card's ground standing in by the rule's width, both from the card's
inner edge, the ground's reaching a pixel into the card to cover the rule across the opening. The
slanted sides run on from the card's rule with no step at the joint. **The rule's width is read
off the card as the browser drew it**, since the browser snaps a rule to whole device pixels --
one at 1.8x, two at 2x -- and a width written once would be right on one screen only; the slant
takes half a device pixel more, because a slanted line smoothed over its neighbors reads thinner
than a straight one as wide. A square turned a quarter with two sides ruled, as the map's card had
first, sat its corners on the rule's inner edge and stood a pixel proud of it at the joint, and
its slanted rule read thin. Decided with the author on 2026-10-10.

## A surface the pointer opened holds the pointer

**What the pointer opens -- a tip, a card over a mark -- stays while the pointer is on it, on what
opened it, or on the unseen bridge between, and goes the moment it leaves all of them**, with no
delay to wait out. It takes the pointer rather than letting it through to what lies under it:
a reader moving toward it is following what they read, so it holding the pointer is the intent
met, and what it covers is reached by leaving it first. A grace period would blunt the crispness
of every close for the sake of a path the bridge already covers. The overview's timeline tip is
the first, spec/console/overview.md, "A line is any of three things, or the worst of them".
Decided with the author on 2026-10-10.

**Every such surface holds the pointer one way**: `Held` in `src/lib/design/held.ts` -- its anchor,
the surface, and `close`, which the anchor's and the surface's leaving call unless the pointer went
from the one into the other -- and `Bridge` in `src/lib/design/bridge.svelte`, inside the surface.
**The bridge goes the way the point does**: out from the edge the point is on, across the gap to
the anchor and as long as the anchor is along that edge, so a tip pointing down at its slot
bridges below it and a card pointing left at its mark bridges to the left. The map's card is the
second: every place's card holds the pointer now, a lone node's as well as a shared place's, and
no longer waits 150 ms before closing once the pointer has left both.

**A size changed inside a resize callback is changed before layout instead.** A frame carried to
its words' new size -- `reshape` in `motion.ts` -- is held at its old size when its words change,
not in the callback that sees them, and to the fraction: the browser reports a `ResizeObserver
loop` error when a callback resizes anything an observer watches higher up, and the map's watch on
its card is higher up. Rounding is a resize too: `offsetWidth` and GSAP's own `autoRound` each moved
a frame held at 310.05 px to 310, which raised the error on every value the card's nodes sent until
2026-10-10.

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
