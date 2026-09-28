# `shot`: a page, as a picture

`apps/shot` renders a web page -- or an API, which a browser shows as its JSON -- in Chromium and
answers with a PNG and a WebP of it. It is for the pictures of each of our services, as a deploy
dashboard shows them, and for an article's external links, captured as they are cited. It keeps
nothing: a capture lives five minutes on disk and is gone.

## Asking for one

**Starting a capture answers at once, and the picture comes later.** A browser takes seconds, so
nothing waits on it:

| Request                                                 | Answer                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /shot/capture?url=&width=&height=&full=&internal=` | `202 { id, state, retry_after }`, or `200` when it is already done   |
| `GET /shot/<id>`                                        | `202` while queued or rendering, `200 { id, state, png, webp }` done |
| `GET /shot/<id>.png`, `GET /shot/<id>.webp`             | the picture itself, `Cache-Control: max-age=900`                     |

- Every route is under `/shot/`, the bare scope included, because the zone's firewall admits a
  scope's paths by that prefix; a UUID is never `capture`.
- `width` and `height` are the viewport in CSS pixels; `full=true` captures the whole page rather
  than what the viewport shows.
- Every answer but the picture is the envelope, and says `no-store`. A capture that failed is
  `502 page_unavailable` with why, in the browser's words; one expired or never made is
  `404 no_such_shot`; a full queue is `503 queue_unavailable` with `Retry-After`.
- **The addresses in an answer are relative** -- `Location: <id>`, `png: "<id>.png"` -- because the
  service does not know the scope it is reached under; resolved against the address asked, they
  land beside it.
- A capture has thirty seconds from when a browser takes it, and fails with why after that.
- **An id is a random UUID**, so a picture cannot be found by guessing what somebody else asked
  for. The same parameters while a capture of them is kept get the same id, and are not captured
  twice.
- **Both formats are made from one capture.** WebP is quality 85: past the point where text looks
  any different from the PNG, at a fraction of its size. A page taller than WebP's 16,383 pixels is
  kept as PNG alone, and `webp` is empty.
- `retry_after` is an estimate in seconds, never a place in the queue: the captures ahead of it,
  over how many run at once, plus one, times how long a capture has lately taken, between 1 and 60.

## Two queues, and ours go first

**A request from the public is one the gateway marked**; one without the mark is ours -- the LAN,
the tailnet, or a Worker over VPC. See [services.md](services.md), "The gateway marks what it passes
on".

- Ours queue ahead of the public's, always, and up to fifty may wait; the public's up to thirty.
  Two captures run at once.
- **`internal=true` lets a capture reach private addresses, and only ours may send it.** The gateway
  refuses the parameter with a 403, and `shot` ignores it on a marked request as well. Without it a
  capture reaches public addresses alone.
- The public starts three captures a minute from one address, at the gateway; asking after one and
  fetching it are not counted. Cloudflare's zone rate rule is the floor under that.

## Kept on disk, five minutes

**Nothing held in memory is a picture.** Each capture is written beside its id in the service's
directory, through a temporary file and a rename, and a sweep every thirty seconds deletes what is
older than five minutes, failures included. The directory is emptied when the service starts. The
queue itself -- ids and their states -- is memory, and lost with the process, which only means a
caller asks again.
