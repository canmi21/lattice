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

**The map is the overview's center, with the view's four figures beside it**: nodes heard, apps
running, deploys in the last day and how long one takes -- as one column of figures at the map's
right, a hairline between each, and under the map where the page is too narrow. They are figures,
not tiles: no ring and no sparkline, since the line above already says whether a figure is wrong.
The map stays as it is drawn -- [../architecture/console.md](../architecture/console.md), "A figure
is drawn before it is written" and the paragraphs after -- full width of its half, flat by default
and a globe when asked for. **The globe is painted in the page's theme** and again when the theme
switches: a light sphere with dark land in the light, the reverse in the dark, its glow the card's
own ground so its edge fades into what it stands on. A view without the nodes, Platform's or
Services', has the figures alone where the map would be.

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
