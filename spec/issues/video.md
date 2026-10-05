# Issues: video

What [architecture/video/pipeline.md](../architecture/video/pipeline.md) has not settled. The rules
over an entry are the index's; see [issues.md](issues.md).

## What a software decoder actually manages, measured on a device that needs one

It is the only
number in this directory nobody has taken, and it decides two things at once: how long a progress bar
would be, and whether a source that publishes a single 1080p rung would leave that path with
something it cannot finish. It is not blocking while the branch is unbuilt, and it is the first
thing to measure on the day it is. Estimating it would be worthless.

## What the sampling interval lets through

Measured on the three real clips it is 2.57s, 3.43s
and 3.12s between frames, and anything on screen for less than that can be missed silently. The
first real batch caught every title card there was to catch -- two names and a tagline off the Mac
Pro film, a road marking off the event clip, two lines of Chinese subtitle off the third -- so on
this evidence the interval is not obviously too wide. Three clips is not a measurement, and none of
them cuts fast. It stays open until something with a rapid montage has been through it.

## Whether a caption track is part of what the runner is shown

It is text, it is already cut to
the excerpt, and for a clip whose substance is narration it carries more than the frames do. It is
also the thing most likely to be restated instead of observed, which is the failure the prompt
already has to guard against for the context.

## Following `cid://` at render time

Nothing resolves it yet. A poster's credit is meant to
resolve through its video to whoever published it, and until something walks that link the scheme
is a convention with no consumer.
