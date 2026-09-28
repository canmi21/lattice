# `shot`: a page, as a picture

`apps/shot` renders a web page -- or an API, which a browser shows as its JSON -- in Chromium and
answers with a PNG and a WebP of it. It is for the pictures of each of our services, as a deploy
dashboard shows them, and for an article's external links, captured as they are cited. It keeps
nothing: a capture lives five minutes on disk and is gone.

## Asking for one

**Starting a capture answers at once, and the picture comes later.** A browser takes seconds, so
nothing waits on it:

| Request                                     | Answer                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `GET /shot/capture?host=&…`                 | `202 { id, state, retry_after }`, or `200` when it is already done   |
| `GET /shot/<id>`                            | `202` while queued or rendering, `200 { id, state, png, webp }` done |
| `GET /shot/<id>.png`, `GET /shot/<id>.webp` | the picture itself, `Cache-Control: max-age=900`                     |

- Every route is under `/shot/`, the bare scope included, because the zone's firewall admits a
  scope's paths by that prefix; a UUID is never `capture`.
- **The page is six parameters, each one part of its address, never one address inside another:**
  `scheme`, `http` or `https`, and `https` when absent; `host`, a name or an address, IPv6 with or
  without its brackets; `port`, the scheme's own when absent; and `path`, `query` and `hash`, each
  optional, each without the mark that opens it. A part holding more than itself -- a host with a
  port or a path, a path with a query -- is refused rather than read. Only `query` ever needs
  escaping, and only when it holds an `&`.
- The rest: `width` and `height`, `full`, `timeout` and `delay`, `insecure` and `internal`, each
  below.
- `width` and `height` are the viewport in CSS pixels; `full=true` captures the whole page rather
  than what the viewport shows.
- Every answer but the picture is the envelope, and says `no-store`. A capture that failed is
  `502 page_unavailable` with why, in the browser's words; one expired or never made is
  `404 no_such_shot`; a full queue is `503 queue_unavailable` with `Retry-After`.
- **The addresses in an answer are relative** -- `Location: <id>`, `png: "<id>.png"` -- because the
  service does not know the scope it is reached under; resolved against the address asked, they
  land beside it.
- **An id is a random UUID**, so a picture cannot be found by guessing what somebody else asked
  for. The same parameters while a capture of them is kept get the same id, and are not captured
  twice.
- **Both formats are made from one capture.** WebP is quality 85: past the point where text looks
  any different from the PNG, at a fraction of its size. A page taller than WebP's 16,383 pixels is
  kept as PNG alone, and `webp` is empty.
- `retry_after` is an estimate in seconds, never a place in the queue: the captures ahead of it,
  over how many run at once, plus one, times how long a capture has lately taken, between 1 and 60.

## What an answer tells

**An answer about a capture tells its story as well as its state**, the same to the public as to
us: the public reaches public addresses alone, so nothing in it is ours to hide.

- `task`: `asked_at`, `started_at`, `finished_at` and `expires_at`, as RFC 3339 instants, and
  `queued_ms` and `rendered_ms` between them. Asked again after failing, a capture's story starts
  over.
- `request`: what the capture was asked, normalized -- the page's address put together from its
  parts, the viewport, `full`, `timeout` and `delay` in seconds, `insecure` and `internal`.
- `pictures`, once done: `width` and `height` in pixels, `png_bytes`, and `webp_bytes` or null.
- `page`: the address it ended at, each `redirects` hop with its status, the document's `status`
  and `type`, its `title`, `description` and `language`, and its whole `width` and `height`.
- `load`: `dns_ms`, the name's lookup as the proxy made it, since the browser resolves nothing;
  `connect_ms`, `tls_ms`, `first_byte_ms`, `dom_content_loaded_ms` and `load_ms` from the browser's
  navigation timing, whose connection is to the proxy's tunnel; and `requests` and `bytes` over the
  whole page.
- `connection`: the `addresses` the name resolved to, as the proxy judged them, the first it could
  reach being the one connected; the document's `protocol`; its `tls` -- protocol, cipher, issuer,
  subject and validity; and, for an `insecure` capture alone, `overlooked`: what a strict client
  would have refused the certificate for, found by asking the host again with the platform's roots,
  or null when it would have taken it.
- `health`: `errors` thrown in the page and `failed_requests`, those the page did not call off
  itself -- a service of ours captured is checked by it as well as seen.

What the page did is listened for before it is asked for, from the browser's network and runtime
events, and what it says of itself is read once it has settled.

A failure is the envelope's, a code and a message, and carries none of this.

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

## Only public addresses

**Every request a capture makes leaves through a proxy inside `shot`, and the browser resolves no
name.** Judging the page's address before it loads would not be enough: the page loads more,
redirects, and a name can answer one address when it is judged and another when it is fetched. So
the proxy is the only way out, and it resolves each name itself and connects to the address it
judged:

- Names are asked of Cloudflare's and Google's DNS over HTTPS, both at once, for A and AAAA, and by
  their addresses (`libs/urls`' `external.doh`), so the asking needs no DNS of its own and the
  system's resolver is never read for the public. What they give is the union, kept for its TTL and
  a minute at most; one server failing is not a failure, since the other's addresses meet the same
  rule.
- **For the public, every address a name has must be public**, or none is reached: one private
  address among public ones is still a way in. Public is routed across the internet -- not this
  machine, a private or link-local range, carrier space (which the tailnet uses), documentation,
  benchmarking, multicast or reserved, and for IPv6 only global unicast, with an IPv4 address carried
  inside IPv6 judged as the IPv4 address it is.
- **With `internal`, any address is reached**, and a name public DNS does not know -- a container's
  -- is asked of the system.
- A tunnel for HTTPS is opened to the judged address; a plain HTTP request is sent on in origin form
  with `Connection: close`, so a browser reusing the connection for another host is judged again.
  Two ports, one per reach, and each capture's browser context is given the one its ask may use.

## One browser, a context per capture

**Chromium runs for the life of the service, and each capture is a browser context of its own**,
given the proxy for its reach and disposed of when it is done, whether it worked or not; two share
the browser at once. A browser that has died is started again for the next capture.

- **A capture is taken when the page has loaded, and then a moment**: loaded is the browser's load
  event, so a fast page is taken fast and a slow one when it is ready. `timeout` is how long it may
  take, 1 to 30 seconds and 15 when not asked, and a page slower than that fails saying so. `delay`
  is how long to wait once it has, for what the load set going -- an animation, a late render --
  0.1 to 10 seconds when asked and 210 milliseconds when not. Both are seconds to one decimal place,
  and anything else is `400 invalid_timing`. A capture as a whole may take its timeout and delay
  and ten seconds more before it is called failed. Both are part of what makes two asks one.
- **A certificate is checked unless `insecure=true`**, which accepts one the browser would refuse --
  self-signed, expired, for another name -- and only for an https page. It is set on the capture's
  own page and reaches no other, checked with two captures of one bad certificate at once, one of
  them asking; and it is part of what makes two asks one. The proxy's judgment of addresses is not
  touched by it. chromiumoxide overlooks every certificate unless told to respect them, which it
  is.
- `full` measures the page and captures that much beyond the viewport, at the width asked; it is
  cut at 16,383 pixels, WebP's limit, so both formats are always made.
- Chromium runs without its own sandbox, since the container gives it no capabilities to build one
  with; the container is the sandbox. QUIC is off and WebRTC may not use UDP, since either would
  leave around the proxy; Chromium's own habit of sending loopback around a proxy is undone, so a
  request for this machine meets the proxy's judgment too.
- The page's address is judged before it is loaded, so a refusal says which address and why. What
  the proxy refuses on the way -- a redirect, a resource -- reaches the browser as a failed
  response, and the capture fails with the browser's words for it, which do not say which.
- The browser is Debian's headless shell, not Debian's Chromium, which brings a desktop's libraries
  along: 1.14 GB against 1.38. Google builds no Chromium for Linux on arm64. The fonts are Noto --
  Sans for Latin, Sans CJK for Chinese and Japanese -- and no emoji.
- The image's root is read-only and its `/tmp` small, so `HOME` and `TMPDIR` point inside the
  service's directory, where the browser keeps its profile, cache and shared memory.
