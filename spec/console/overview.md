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
along its foot.** The list is a line a node -- a dot in the map's blue, or red when it is not heard,
its place, its code, and one figure of it, the one a switch above the list picks: how busy its
processor is, how much of its memory is in use, or how many apps it runs, a share always to one
decimal so the column lines up. Pointing at a line opens that node's card on the map, and the line
is a link to the node. The figures -- nodes heard, apps running, deploys in the last day and how
long one takes -- are a strip under both, a hairline between each: figures, not tiles, with no ring
and no sparkline, since the line above already says whether a figure is wrong. The map stays as it
is drawn -- [../architecture/console.md](../architecture/console.md), "A figure is drawn before it is
written" and the paragraphs after -- and its switch between flat and round is two icons in a frame
at its top right. A view without the nodes, Platform's or Services', has the figures alone.
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
as fast as it was let go, easing back to its own pace; for a reader who asked for less motion it
arrives round at once and stands still. The canvas exists only off the flat map: flat, the server's
dots are what is drawn.

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
