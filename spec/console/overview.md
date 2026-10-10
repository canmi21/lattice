# Console overview: the view at a glance

The first page of every view, the first redrawn after the shell. What the shell looks like is
[design.md](design.md), and where a page sits in the tree is [navigation.md](navigation.md).
Decided with the author on 2026-10-09, when the overview had grown to a dozen parts of one weight
and the question an operator opens it with was the third thing on its right.

## Three parts, in the order a reader asks

**The overview answers three questions and stops**: whether anything is wrong, what the whole looks
like, and what the day has been. Each is one part, top to bottom, and nothing else is on the page.

## The page answers whether anything is wrong first

**A line at the top says whether anything is wrong, and only its dot changes color.** It stands
on the card's own ground whatever it says -- a whole bar washed amber read as louder than anything
it named -- with a green dot and `All systems normal` when nothing is wrong, and otherwise a dot the
color of the worst of it and each thing named, worst first, each a link to where it is read: nodes not heard (bad), apps not running and deploys failed
in the last day (warn). At its right, quiet either way, is whether anything is deploying. Until the
live store holds the nodes it says it is listening, in grey, rather than guessing. It is a live
region, so a reader who cannot see the color is told the line as it changes.

## The map is the page's whole picture

**The nodes are one card: a list of them on the left, the map on the right, and the view's figures
along its foot.** The list is a line a place under quiet headings, `Location`, `CPU` and `RAM`, in
place of any switch: the country's flag with a dot on its corner, in the map's blue or red when a
node there is not heard, ringed in the card's own ground as the account's avatar wears its presence,
the place's name whole, how many nodes stand there where it is more than one -- `Tokyo, Japan 3
nodes`, one line and never a fold -- how busy its busiest processor is, as a percent, and the memory
its nodes use together, in GiB written `G` -- `2.6G` -- each to one decimal always, in a column of
its own right-aligned, so the figures line up. Dense: 28 pixels a line, the type a step under the
page's. **A shared place's processor is its busiest node's**, not their mean, which would hide one
hot node behind two idle ones; its memory stays the sum, what the place holds in use. **The busiest
place is first, and the order is taken again every five seconds**, not on each reading, so a line
stays put long enough to be read: by whole percents, two places a fraction apart keeping the order
they had, a place never read last, and no order taken while the pointer is on a line, which would
move it out from under the pointer. The lines slide to their new places by GSAP, over 450 ms, or at
once for a reader who asked for less motion and for a tab nobody is looking at; a page come to is
drawn in order from the readings already held, never shuffled into it. Decided with the author on
2026-10-09. Everything else about a place -- its apps, each of its nodes by code -- is the map's
card, which pointing at a line opens; a node's line links to the node, and a shared place's to the
nodes. A switch of figures above the list, and a shared place that folded open to a line a node,
were each tried on 2026-10-09 and taken out as more machinery than a glance needs. The figures --
nodes heard, apps running, deploys in the last day and how long one takes -- are a strip under both,
a hairline between each: figures, not tiles, with no ring and no sparkline, since the line above
already says whether a figure is wrong. The map stays as it is drawn --
[../architecture/console.md](../architecture/console.md), "A figure is drawn before it is written"
and the paragraphs after -- **never taller than 26.25rem**, 420 pixels as Vercel's stands, its width
following from its shape and the room either side of it left empty, so a wide screen widens the
margin and not the map; its switch between flat and round is two icons in a frame at the top right
of its column, where it stays however narrow the map. The list's column is 20rem, wide enough for a
whole name and both figures. A view without the nodes, Platform's or Services', has the figures
alone. Taken, with the author, from the layout of Vercel's CDN overview on 2026-10-09: its
arrangement and its switch, not its look.

## A flag's dot is how its node is

**The dot on a node's flag says how the node is, the worst of what is wrong with it**: blue where it
is heard and every app that should run does, amber while it is leaving, quiet while a relay just
started has not heard it yet, and red where an app that should run does not or the node is gone. Its
hover says why -- `2 apps down: Object Storage, PostgreSQL`, `Upgrading`, `Not heard` -- and names
an app held on purpose without counting it. A place takes the worst of its nodes and names each. The
place list and the timeline draw the same dot from one rule, `health.ts`, so it means one thing
wherever a flag stands; it said only whether a node was heard until 2026-10-09, when the timeline's
count of apps down at each line's end crowded the line and moved onto the dot. Decided with the
author on 2026-10-09.

## The globe is the flat map turned round

**The globe is the flat map's own dots, carried onto a sphere.** Each dot of land stands for a
place, which the browser works out by undoing the flat map's Mercator projection -- no projection
library and no data beyond the dots the server already sent -- and each has a place on the flat map
and one on an orthographic globe, tipped 15 degrees north. Turning is a value from 0 to 1 that GSAP
carries over 700 ms, most of the way in the first third and the rest settling (`power4.out`), and
every dot and every mark is drawn that far between its two places; a mark stays the flat map's own
element throughout, so its card, its link and its halo come with it. **The whole map moves at
once**: a dot on the far side is carried too, to where the sphere's formula puts it, inside the
disc, and fades out on the way, rather than standing where it was while the rest moves -- which
tore the map down the middle until 2026-10-09, when frames of Vercel's turn showed every dot going.
**The sphere has no edge of its own to show a seam**: a dot fades as it nears the globe's rim, from
70 percent of the quarter turn to it, and the outline is a hairline in the card's rule color, so in either theme the globe is its
dots on the card's own ground. Its colors are read off the page and read again when the theme
switches. Once round it turns slowly on its own, and a drag turns it by hand and leaves it spinning
the way it was thrown, as fast as it was let go: thrown faster than its own pace it slows to that
pace in the thrown direction, thrown slower it gathers to it, and it turns that way from then on.
**Every mark is pointed at as the largest is**: its target is the largest size's whole, with what
is drawn at its own size in the middle, so a small mark on a turning globe is as easy to hold as a
large one. **A place's card open brakes it**: the turn
slows to a stop in about a third of a second, so the card holds still to be read, and gathers its
pace back once the card closes. For a reader who asked for less motion it
arrives round at once and stands still. The canvas exists only off the flat map: flat, the server's
dots are what is drawn.

## A place's card says what the list does not

**A place's card points at its mark**: a small point at the card's edge toward the mark, level
with it and kept off the corners when the card is pushed up or down by the map's edge, the card and
its point lifted by one shadow so they read as one shape. **A card whose words change its size is
carried to the new one**, quickly, over 160 ms, rather than cut to it: a node going from its uptime
to `Upgrading`, a figure gaining a digit. **Pointing at a place opens a card of
rows, a name and a value each**: uptime, role, apps running
of listed as `15/15`,
and two rings with their figures, the processor's share busy and the memory in use written in `G`
to one decimal. Uptime is its two largest units with no space inside one, `3d 2h`, and a node not
heard says so in red in its place. No state and no last-heard clock: the dot in the list and the
mark's color already say whether a node is heard. The card's title is the place's name and nothing
beside it -- no city for a node named by its country, no flag, which is the list's. **A shared place is one table, read across**: the rows' names once at the left, a little apart,
and the place's nodes as close columns, each headed by what tells it from the others there --
`Tokyo`, `Narita`, `Haneda` -- with the country in the corner over the names, `Japan`, and no title
above. One under another made the card as tall as the map, side by side with the names repeated
made it as wide; the names once at the left keep it to both. A node's code is never its head --
the code is the key and not a name, said only to assistive technology -- and each head links to
its node.

**The last row is latency, each node's round trip to the database's primary**, as its relay
times its ping to that node's -- platform's `spec/architecture/relay.md`, "The round trip to each
neighbor" -- carried in seconds, as every duration is, and written by the page in milliseconds, a
tenth under ten and whole above, `0.4ms`, `151ms`: the wire keeps the one rule and the page wraps
it for a reader, as it wraps a node's code in its city. The primary
says `Primary` in its own row rather than a zero, and a node its relay has not timed lately says
`–`, which is not the same as slow. Which node is primary the page reads once, from the `primary`
proxy's health through the nearest node that answers, since the proxy runs on every node and
routes to the one primary; the round trips themselves move live, in the snapshots.

**A country's flag stands before each place's name in the list**, drawn by Twemoji -- flat, as the
console is, where the system's emoji font is not -- from `@twemoji/svg`, the maintained fork's
package, whose graphics are CC-BY 4.0 by Twitter and its contributors; only the flags of the
countries a node stands in are imported, and the build writes each into the page, being small.

## The figures are a line and a drawing each

**Each of the four figures is a one-word name, then the figure and what it is out of on one line,
and a small drawing of it at its right**: `Nodes`, `8/8`, a pip a node, blue heard and red not;
`Apps`, `102/105`, its total against it as the place's card writes it, a ring of those running;
`Deploys`, `23 24h`, a ring, green, of those that succeeded; `Deploy time`, `58s p95 26m`, the last
deploys' durations as a line. A run of words was what made the strip read badly -- `Median deploy,
30 d`, `100% succeeded` -- so a name is one word or two, the window is a figure beside the count,
and the median is the figure a deploy time means. Figures are in the shell's face --
[design.md](design.md), "Words in the sans, figures in the shell's face"; the figure is a step over
the body and what it is out of a step under, so one line reads as one figure.

**The strip is laid out by its own width, not the window's**: four abreast where it has the room and
two and two where it does not, a pixel's rule between every two cells across and down. **A cell
narrowing gives up its drawing first, then its second figure** -- the drawing below twelve rems of
room, `p95 9m` below nine -- so the figure itself is the last thing standing. Decided with the
author on 2026-10-09.

## The week is a line a node

**Under the map, the last seven days are one card, a line a node, drawn as a status page draws
one**: a row of slots left to right, grey where nothing ran and, where one did, white done, blue
while one goes, amber where a run partly failed -- some of its apps or nodes failing and the rest
not -- and red where it failed, so only what went wrong or is going carries a color; no line runs
through them and no tick between, the way the map above lays the nodes out in space. Its title is
the choice of span, `Last 7 days` until the reader chooses another, its menu folded into `Hours`,
`Days` and `Months`, each said in its own unit -- 1, 6, 12 and 24 hours; 1, 3, 7 and 30 days; 3, 6
and 12 months -- the day standing in both the hours and the days, and the card titled as it was
chosen, `Last 24 hours` or `Last day`, and the same menu ends, under a rule, with `View all
deployments` and an arrow off its edge -- [design.md](design.md), "A choice in a card's head is its
title" -- and the legend stands on the head's right, a bar of each color as a slot is drawn, in the
reader's words -- `Done`, `In progress`, `Partly failed`, `Failed`, never host's `succeeded` or
`running` -- its words giving way to the bars alone where the head is narrow, each naming itself on
its hover. Each line is headed by the node's flag, its dot saying how the node is -- "A flag's dot
is how its node is" -- and the part of its place that tells it from the others there, `Tokyo`,
`Narita`, `Haneda`. A run is one mark a node however many of its apps it placed there, in the slot
it started in, and a slot takes the worst of its runs; one run's slots stand one above another, so a
rollout reads down the card. A skip draws nothing. **A slot is as dark as its runs rank among the
slots of its color**, in ten shades: the share of them holding as many runs or fewer, taken in
tenths, a quarter's opacity at the palest and whole at the darkest. Ranked rather than measured
against the busiest, so one hour of forty deploys is the darkest without washing every other out to
the palest, and not cut out of the range either; equal counts share a shade, and each color ranks
apart, so the few red slots have their own range. A slot's hover says the time it covers, then the
apps of each run in it, what became of them, when, how long it took and why where it failed; it
links to the run in it that failed, else its latest. Nothing is written under the rows: the title
says where they start, and a slot's hover when it is. **The slots fit the row**: each 3 to 8 pixels
wide and 1 to 3 apart, the slots widening first and the gap after them, and where neither can
stretch far enough the count changes, the finest that fits -- each span with lengths of its own,
whole seconds, minutes or days -- 15 seconds to 5 minutes over an hour, half an hour to 6 hours over
a week, a day to a week over a year -- so a narrow window draws coarser slots rather than slivers.
The server draws an hour or a quarter each until the row is measured. In a view without nodes the
lines are its eight busiest apps instead. It took the place on 2026-10-09 of two cards, the latest
runs as lines beside the apps not running, which repeated one app's runs down the card and left the
other mostly empty: the history is the deployments page's, and the overview's is the shape of the
week. It was ticks on a hairline first, then hourly cells shaded by how busy they were, before the
slots. The load carries every step the relay's mirror holds for it, 30 days, beside the verdict's; a
span longer than that is drawn from the mirror until the relay's `/history` answers the rest --
platform's `spec/architecture/relay.md`, "Each node's minutes, kept for a year"; see `fromHistory`'s
`since`. Decided with the author on 2026-10-09.

## A line is any of three things, or the worst of them

**The timeline's card is asked two things in its title, `Overview ⌄  Last 7 days ⌄`**: what a slot
is the verdict of, and over how long. What it is of is one of four, the choice kept as the span's
is, in a cookie the server draws with:

- **Deploys**: what ran on the node, as the runs above say it -- done, in progress, partly failed,
  failed -- each slot as dark as its runs rank among its outcome's.
- **Services**: whether every app that should have run did. An app down for a few rounds, under
  ten seconds, is a blip and the slot stays up; down for part of the slot, the slot dipped; down
  for half of it or more, the slot is down.
- **Connectivity**: whether the node was heard. Minutes unheard after a minute that said the node
  was leaving are announced, drawn as planned; one or two unheard minutes unannounced are missed,
  three or more lost.
- **Overview**, the default: the worst of the three, in five steps mildest first -- nothing to say,
  fine, planned, degraded, down -- drawn grey, white, blue, amber and red. Its hover says each of
  the three, so a red slot names which went wrong.

**Services and connectivity are never empty once a node's history begins**: a node down for a whole
slot is lost there, not blank, since a minute is due whether or not it is heard. Only a slot before
the node's first minute is grey for them, and its tip says so -- `Unrecorded` -- rather than
reading as a node with nothing to report; deploys alone have slots with
nothing in them. **Fine is drawn quiet, at four tenths, so trouble is what the eye finds**; a slot fine because a
deploy ran there is as dark as its runs make it. A view without nodes draws its busiest apps, each
app's services the worst any node had of it, and is not asked about connectivity, having no node
to hear. The legend names the dimension's own steps, one word each, the words its tip uses: `Fine,
Planned, Degraded, Down`; `Done, Running, Partial, Failed`; `Up, Dipped, Down`; `Heard,
Announced, Missed, Lost`; and `Unrecorded` before a node's history begins.

**A slot pointed at is ringed flush in the focus ring's color**, two pixels of the accent with no
gap, as the keyboard's focus is drawn -- the kit's `interaction.css` -- the shade on what the slot
holds rather than on the slot, so the ring is never faded with it. **What it holds is a tip of the
console's own, not the browser's title, in as few words as it can**: when, strong, with what it
leaves out quiet beside it -- `9 PM` and `Oct 9`, `Oct 9` and `Thu`, `Oct 7 – 9`; a line for each
thing it says, an icon -- a rocket for deploys, packages for services, an access point for being
heard -- its name, its verdict's dot and one word; and under a rule what it holds by name, how
long each lasted aside in the figures' face: each app down, the minutes unheard, each run, four at
most and the rest counted. It stands over the slot, under it near the window's top, and inside the
window, and goes with a scroll.

**The row's slots begin on whole times of the reader's clock** -- the hour, the day -- the last
holding now, so a slot is `9 PM`, never `9:27 PM`, and a reload a few minutes on draws the same
slots.

**Each span's history is read once, at its finest slot, and gathered in the page to the row's
width**: the relays' `/history`, through the console's `/history`, the span a whole number of its
finest slots -- a minute up to a day, an hour past two days, a day past 30 -- so a slot's length
is always one the relays answer. A slot of history goes to the row's slot the middle of its part
inside the span falls in, the last one running past now. The server reads the span the page is
drawn with; another span is asked when chosen, and the span drawn again each minute, a minute being
what a relay adds. Past the runs mirror's 30 days, deploys are read from the history's day counts.
Platform's `spec/architecture/relay.md`, "Each node's minutes, kept for a year". Decided with the
author on 2026-10-09; drawn 2026-10-10.

## Charts are their pages'

**The overview draws no chart.** Each it held went to the page that owns what it shows: the
fleet's CPU, memory and network over a span, and CPU by the hour, to Nodes; placements by node
beside runs per day, to Deployments. Deploys per day went with no new home, since Deployments
already drew runs per day. A chart a reader wants on the overview is a figure there, linked to the
page whose chart it is.
