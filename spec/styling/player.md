# The video player's own surface

The one place on the site whose colours do not answer to the page theme, and the one icon set that
is not the site's. What the controls _do_, and when each of them is on screen, is
[architecture/video/player.md](../architecture/video/player.md). Which of the three systems writing CSS is
entitled to say each decision here, and what happens where two of them say the same thing, is
[architecture/css/layers.md](../architecture/css/layers.md).

## The player brings its own colours, because it cannot know what is behind them

Every colour in `colors.css` is a page colour: it has a light value and a dark one because it is
read against the page, and the reader picks which. A player's controls are read against a _video
frame_ -- a surface this site does not choose, cannot know, and which changes twenty-four times a
second. A control tinted for a light page disappears over a bright sky; one tinted for a dark page
disappears over a night interior. So the player does not ask what theme the page is in. It brings
its own ground, the way every native player does, and `libs/tokens/src/player.css` is deliberately
not derived from any `--color-*` -- a derivation would re-introduce the theme the file exists to
escape. What the player _does_ take from the page is the focus ring, and only that:
see [focus.md](focus.md).

The scheme is the one macOS and IINA arrive at from the same constraint. White ink at less than
full opacity, floating on a dark translucent plate, blurred so the frame behind reads as texture
rather than as detail. Two things carry it over content bright enough to swallow white:

- **`--player-veil` is a gradient laid under the controls, not a solid bar.** Dark at the bottom
  edge and nothing at the top, so it darkens what the controls sit on without drawing a band
  across the picture.
- **`--player-shadow` is cast on the ink itself**, not on the plate, which is what keeps a white
  glyph legible in the case the veil cannot reach: a title card filling the frame.

**The disc in the middle is glass, and the row along the bottom is a plate.** The difference is
what is behind them. The row sits on the bottom strip of a frame and is mostly ink; the disc is
64px of surface over the middle of the picture, and what it covers is worth seeing. So it takes
less of its own colour, more blur, and the saturation push that stops a blurred frame going grey
-- blur alone averages colour towards nothing, which is why every native vibrancy effect pairs the
two. At `0.45` the frame behind reads at 55%, against the plate's 34%. Alpha is the share of the
disc's own colour, so **more of it is less glass, not more**.

**The menu has its own ground.** It wore the disc's glass until it was looked at beside the disc:
the same tokens read differently, because the disc floats in the middle of the picture and the
menu sits on the veil, and because the disc is one glyph while the menu is a list of words at
12px. So `--player-menu` is still glass, with the frame showing through as colour, but a little
more of its own ground (0.5 against 0.45), a little less blur (24px against 32) and a little less
saturation (170% against 180%). It has no edge: a light line round it read as a frame drawn on
the glass, and a dark one still read as a line. `--player-menu-shadow` lifts it off the picture,
and a row under the pointer takes 6% of white (`--player-wash`): light over a ground this dark
reads as far more than its alpha, and 16% and then 10% both outshone the menu around the row. The
row's ink rising from dim to full carries the rest. The disc keeps the glass.

**It opens where it stands.** Opening and closing fade it and grow it from 98%, from the corner
nearest the cog, over 150ms on `cubic-bezier(0.22, 1, 0.36, 1)` -- the site's dropdowns, in
`apps/site/src/lib/components/menu-content.svelte`, move exactly so, and the player's menu is one
of them. Reduced motion shows and hides it at once.

**A control lights up rather than growing a plate under it.** Hover and keyboard focus used to put
a rounded translucent rectangle behind each 16px glyph, on a row that already sits on its own
veil: a plate on a plate, and a bigger visual event than the state it reports. Dim ink to full ink
is the whole signal, which is what a native player does. The settings menu keeps its wash, because
there the highlighted surface _is_ the row rather than an ornament on it.

**The cover's glyph is sized against the disc, not against its own box.** At 1.5rem the triangle
was 30% of the diameter and the disc read as the bigger object; at 1.875rem it is 38%, which is
where a native play button sits.

What the player's controls _do_, and when each of them is on screen, is in
[architecture/video/player.md](../architecture/video/player.md).

## The player's glyphs are Phosphor, at two weights, plus three this repository draws

Icons on this site come from Lucide and mingcute through `unplugin-icons`, and the player's do
not. The rest sit in prose at text size with a word beside them; a player's sit on a picture at
16px with nothing to read them against, and Phosphor's heavier, rounder strokes hold up where
Lucide's thin geometry starts to disappear. The two never meet -- no component outside
`video-controls.svelte`, the `video-chrome.svelte` and `video-settings.svelte` it draws its row
with, and its `video-glyphs/` directory imports from `phosphor-svelte`.

**Fill for a mass, bold for an opening.** Phosphor's `fill` is not "the same drawing, heavier": it
is a second drawing in which the outline is filled and most of the negative space inside is gone.
So which weight a glyph takes follows from where its meaning lives. Play, pause and the speaker
are masses and take `fill`. The boxes -- captions, picture-in-picture, the window frame, and the
cog -- are openings, and filling them returns a rounded blob that says none of caption, window,
window-within-window or settings. Those take `bold`, the heaviest weight that keeps the hole.

**Three shapes the set does not have live in `libs/prose/src/components/video-glyphs/`.**
Phosphor's `CornersOut` and `CornersIn` mark the corners of a _square_, which is right for a
generic expand and wrong in a row where captions, picture-in-picture and the frame are all
landscape; and `FrameCorners` is drawn only in its enter state, with no partner for leaving. So
the landscape corner pair and the frame's exit state are drawn here, in Phosphor's hand and from
Phosphor's own parts -- the brackets are its brackets at 24 thick, 52 long and 12 radius, and the
frame is its frame unaltered. Only where each mark sits has changed.

The rectangle is not invented either. At bold Phosphor draws no two of its boxes alike:
`ClosedCaptioning` is 12..244 x 44..212, `PictureInPicture` 20..236 x 44..212, `FrameCorners`
20..236 x 36..220. Two of the three share each axis, and the box they agree on is
`PictureInPicture` exactly.

**An enter state and its exit occupy the same footprint.** Phosphor's own pair does not:
`CornersIn`'s brackets are 60 long against `CornersOut`'s 52, on a 160 square against a 184, so
the glyph changes size as well as direction. Two icons sitting apart in a set can do that; one
button whose label toggles cannot, because a footprint that moves reads as the row twitching under
the press. Here each mark is turned 180 degrees where it stands, and what carries the meaning is
where the elbows end up -- out at the rectangle's corners for large, in toward the middle for
small, which is the signal Phosphor's pair uses too.

These take Phosphor's props and default them the same way, minus `weight`: they are drawn at bold
and nothing else, and a prop offering five more weights would be five lies.

**A round glyph in a row of rectangles is sized against them, not against its box.** Every other
glyph in the control row is landscape -- 216 units wide and 168 tall in a 256 box, which is 13.5
by 10.5 at the 16px they render -- and a cog has one number where a rectangle has two. Phosphor
draws `GearSix` at 232 by 216, so at the same nominal size its diameter is wider than their width
and a third again their height, and it reads as the big one in the row. A diameter is comparable
to a rectangle at the number between the rectangle's two, which is 192 here.

It comes down by growing the canvas under it and not by shrinking the element: the `viewBox` is
replaced with a larger one centred on the same point, which every Phosphor component accepts
because props are spread after it. The element stays 16 by 16, so **the focus ring is unchanged**
-- the ring is the site's and belongs to the control, and an optical correction to the drawing
inside it must not move it.

**Shrinking a drawing shrinks its strokes, and a glyph in a row is read by its weight before its
size.** The first version of this correction stopped at the canvas and the result was a cog the
right size drawn in a lighter hand than the six glyphs beside it. A filled path has no stroke to
thicken, so the weight is put back as an actual stroke laid along the outline the fill already
has: `stroke-width` of w user units adds w to the apparent thickness, and w/2 to every edge -- so
it changes the size too, and the two corrections have to be solved together rather than in
sequence. Wanting a 1.5px stroke and a 12.0px mean diameter at once gives w = 4.571 on a 304.76
canvas. Measured after: stroke 1.500px against the neighbours' 1.500px, ink 12.42 by 11.58 against
13.5 by 10.5, both a mean of 12.0.

`stroke` inherits, so Phosphor's transparent sizing rect inherits it too and draws a square around
the glyph. It is turned off in the same rule; a presentation attribute on that rect is not
something a consumer of the component can reach.

**Check whether the set has already corrected something before correcting it.** A triangle carries
its mass behind its point, so a box drawn around a play glyph sits right of where the eye puts the
shape, and this site nudged its play glyphs left to compensate. Phosphor had already done it:
sampling the outline and taking the area centroid off the shoelace puts `Play` at fill weight with
its bounding box at x 64..240, centre 152, and its centroid at 127.65 -- the path is drawn 24
units off its own box on purpose, and the centroid is already on the viewBox's centre line.
`Pause` is two equal bars at 40..108 and 148..216, symmetric about 128. So the nudge was a
correction on top of a correction and pushed the triangle past centre; both glyphs are now placed
by the grid and nothing else, measured at 0.04px from the disc's centre. The rules stay in the
stylesheet with the numbers in them, because "no offset" is a result and not an omission.
