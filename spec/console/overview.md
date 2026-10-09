# Console overview: the view at a glance

The first page of every view, the first redrawn after the shell. What the shell looks like is
[design.md](design.md), and where a page sits in the tree is [navigation.md](navigation.md).
Decided with the author on 2026-10-09, when the overview had grown to a dozen parts of one weight
and the question an operator opens it with was the third thing on its right.

## Three parts, in the order a reader asks

**The overview answers three questions and stops**: whether anything is wrong, what the whole looks
like, and what happened last. Each is one part, top to bottom, and nothing else is on the page.

## The page answers whether anything is wrong first

**A line at the top says whether anything is wrong, and it is the only part that raises its
voice.** With nothing wrong it is quiet -- the card's own ground, a green dot, `All systems normal`.
With something wrong it takes the color of the worst of it, washed, and names each thing, worst
first, each a link to where it is read: nodes not heard (bad), apps not running and deploys failed
in the last day (warn). At its right, quiet either way, is whether anything is deploying. Until the
live store holds the nodes it says it is listening, in grey, rather than guessing. It is a live
region, so a reader who cannot see the color is told the line as it changes.

## The map is the page's whole picture

**The nodes are one card: a list of them on the left, the map on the right, and the view's figures
along its foot.** The list is a line a place under quiet headings, `Location`, `CPU` and `RAM`, in
place of any switch: the country's flag with a dot on its corner, in the map's blue or red when a
node there is not heard, ringed in the card's own ground as the account's avatar wears its presence,
the place's name whole, how many nodes stand there where it is more than one -- `Tokyo, Japan 3 nodes`, one line
and never a fold -- how busy its processors are, their mean as a percent, and the memory its nodes
use together, in GiB written `G` -- `2.6G` -- each to one decimal always, in a column of its own
right-aligned, so the figures line up. Dense: 28 pixels a line, the type a step under the page's.
Everything else about a place -- its apps, each of its nodes by code -- is the map's card, which pointing at a line
opens; a node's line links to the node, and a shared place's to the nodes. A switch of figures
above the list, and a shared place that folded open to a line a node, were each tried on 2026-10-09
and taken out as more machinery than a glance needs. The figures -- nodes heard, apps running, deploys in the last day and how
long one takes -- are a strip under both, a hairline between each: figures, not tiles, with no ring
and no sparkline, since the line above already says whether a figure is wrong. The map stays as it
is drawn -- [../architecture/console.md](../architecture/console.md), "A figure is drawn before it is
written" and the paragraphs after -- **never taller than 26.25rem**, 420 pixels as Vercel's stands,
its width following from its shape and the room either side of it left empty, so a wide screen
widens the margin and not the map; its switch between flat and round is two icons in a frame at
the top right of its column, where it stays however narrow the map. The list's column is 20rem, wide
enough for a whole name and both figures. A view without the nodes, Platform's or Services', has the figures alone.
Taken, with the author, from the layout of Vercel's CDN overview on 2026-10-09: its arrangement and
its switch, not its look.

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
as fast as it was let go, easing back to its own pace. **A place's card open brakes it**: the turn
slows to a stop in about a third of a second, so the card holds still to be read, and gathers its
pace back once the card closes. For a reader who asked for less motion it
arrives round at once and stands still. The canvas exists only off the flat map: flat, the server's
dots are what is drawn.

## A place's card says what the list does not

**Pointing at a place opens a card of rows, a name and a value each**: uptime, role, apps running,
and two rings with their figures, the processor's share busy and the memory in use written in `G`
to one decimal. Uptime is its two largest units with no space inside one, `3d 2h`, and a node not
heard says so in red in its place. No state and no last-heard clock: the dot in the list and the
mark's color already say whether a node is heard. The card's title is the place's name and nothing
beside it -- no city for a node named by its country, no flag, which is the list's. **A shared
place is named once and its nodes follow one under another**, a hairline between, each headed by
what tells it from the others there -- `Tokyo`, `Narita`, `Haneda` -- never by its code, which is
the key and not a name, said only to assistive technology; each head links to its node. One under
another keeps the card narrow however many share a place; side by side it grew as wide as the map.
A row of each node's round trip to the database's primary waits on a measurement --
[../issues/console.md](../issues/console.md), "A node's latency to the database's primary is
measured nowhere".

**A country's flag stands before each place's name in the list**, drawn by Twemoji -- flat, as the
console is, where the system's emoji font is not -- from `@twemoji/svg`, the maintained fork's
package, whose graphics are CC-BY 4.0 by Twitter and its contributors; only the flags of the
countries a node stands in are imported, and the build writes each into the page, being small.

## The figures are a line and a drawing each

**Each of the four figures is its name, then the figure and what it is out of on one line, and a
small drawing of it at its right**: a pip a node, blue heard and red not; a ring of the apps
running; a ring, green, of the deploys that succeeded; the last deploys' durations as a line. A
span is written in its largest unit with no space, `58s`, `26m`, and a share as `100% ok`. The
figure is a step over the body and what it is out of a step under, so one line reads as one
figure.

## What happened is one line a step

**Under the map, two lists side by side: Activity, what is deploying and what finished last, and
Failures, what failed last.** A step is one line -- a dot for how it went, the app, the node, what
it is doing or how it ended, and how long ago -- and links to its run, or to its node's events
where no run started it. A failure's reason is on its hover and on the run's page, never written
out in the list, since three reasons written out filled the old panel. A success says so with its
dot alone, its word in grey; only what is going or went wrong is said in color. **A skip is not
activity**: a node a run had nothing for is left out, or a deploy to one app fills the list with
every node it skipped.

## Charts are their pages'

**The overview draws no chart.** Each it held went to the page that owns what it shows: the
fleet's CPU, memory and network over a span, and CPU by the hour, to Nodes; placements by node
beside runs per day, to Deployments. Deploys per day went with no new home, since Deployments
already drew runs per day. A chart a reader wants on the overview is a figure there, linked to the
page whose chart it is.
