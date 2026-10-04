# `shot`: a page, as a picture

`apps/shot` renders a web page -- or an API, which a browser shows as its JSON -- in Chromium and
answers with a PNG and a WebP of it. It is for the pictures of each of our services, as a deploy
dashboard shows them, and for an article's external links, captured as they are cited. It keeps
nothing: a capture lives five minutes on disk and is gone.

## Asking for one

**Starting a capture answers at once, and the picture comes later.** A browser takes seconds, so
nothing waits on it:

**One question a route**: whether a capture was taken, how it stands, whether its picture is there.
Each tells its own and nothing of the others'.

| Request                                                             | Answer                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /v1/shot/tasks`                                               | always `202 { id, state, retry_after }` and `Location: tasks/<id>`: its state, nothing more |
| `GET /v1/shot/tasks/<id>`                                           | `202 { id, state, retry_after }` while queued or rendering; `200` with all it found, done   |
| `GET /v1/shot/pictures/<id>.png`, `GET /v1/shot/pictures/<id>.webp` | `200`, the picture itself; or `404`, and no more said                                       |

**A task is a thing and starting one is a write**, as the workspace's `spec/addresses.md` has it:
there is no `GET` that starts a capture. What a capture asks is the JSON below, and the version is
in the path as the gateway's `api` host has it -- `api.monoflake.com/v1/shot/...`; a caller on the
private side asks `api.internal.ixc.one/shot/v1/...`, which Caddy takes the scope off.

- **The id is said once, in the body; where to ask is the `Location` header's**, never a second
  field repeating the id.
- **A capture asked for again answers the same way** whether it waits or is done: one flow for the
  caller, who reads what it found from the task. One that failed is queued afresh.
- **A picture is there or it is not.** Waiting, failed and forgotten are the task's to tell apart,
  so a picture asked for early is `404 no_such_picture`, said `no-store` so that no cache on the way
  holds it past the moment the picture is made.

- Every route is under `/shot/`, the bare scope included, because the zone's firewall admits a
  scope's paths by that prefix.
- **The page is its parts, never one address inside another:** `scheme`, `http` or `https`, and
  `https` when absent; `host`, a name or an address, IPv6 with or without its brackets; `port`, the
  scheme's own when absent; `path` and `hash`, each optional and without the mark that opens it;
  and the page's own query as its pairs, **`query.<name>=<value>`, one parameter each**, repeated
  for a name the page takes more than once and written in the order sent. The service writes the
  page's address and escapes it; a caller escapes only what any query value needs, `&` and the
  like. A part holding more than itself -- a host with a port or a path, a path with a query -- is
  refused rather than read, and so is `query` itself, which once held the query whole.
- **`POST /shot/capture` asks the same in JSON, grouped by what each part is about:**

  ```json
  {
  	"target": {
  		"scheme": "https",
  		"host": "github.com",
  		"port": 443,
  		"path": "/rust-lang/rust",
  		"query": { "tab": "readme-ov-file", "tag": ["a", "b"] },
  		"hash": "readme"
  	},
  	"viewport": { "width": 1440, "height": 900, "full": true },
  	"timing": { "timeout": 20, "delay": 1.5 },
  	"access": { "insecure": true, "internal": false },
  	"browser": { "javascript": false }
  }
  ```

  Every group and field is optional but `target.host`; numbers and booleans are JSON's own; a
  query value is a string or a list of them, kept in the order written. A field the service does
  not know, at any level, is `400 invalid_body`, since it would otherwise be quietly not what was
  meant. The same ask by GET and by POST is one capture.

- The rest: `width` and `height`, `full`, `timeout` and `delay`, `insecure` and `internal`, and
  `javascript`, each below.
- `width` and `height` are the viewport in CSS pixels; `full=true` captures the whole page rather
  than what the viewport shows.
- Every answer but the picture is the envelope, and says `no-store`, but a done task: it may be
  kept until the capture is forgotten, and says so in `max-age`. A task that failed is
  `502 page_unavailable` with why, in the browser's words; one expired or never made is
  `404 no_such_task`; a full queue is `503 queue_unavailable` with `Retry-After`.
- **A picture is named by its whole public address**, `png: "<shot>/pictures/<id>.png"` where
  `<shot>` is the scope's public address in `libs/sdk`, never written into the code, so an answer
  read anywhere -- saved, pasted, passed on -- still reaches the picture. It is the public one
  whichever door the task was asked through, since the pictures are the same behind both.
  `Location: status?task=<id>` stays relative, which an HTTP client resolves against the address
  asked. A `status` asked without a `task`, or with one that is not an id, is `404 no_such_task`,
  as an id never made is.
- **An id is a random UUID**, so a picture cannot be found by guessing what somebody else asked
  for. The same parameters while a capture of them is kept get the same id, and are not captured
  twice.
- **Both formats are made from one capture.** WebP is quality 85: past the point where text looks
  any different from the PNG, at a fraction of its size. A page taller than WebP's 16,383 pixels is
  kept as PNG alone, and `webp` is empty.
- `retry_after` is an estimate in seconds, never a place in the queue: the captures ahead of it,
  over how many run at once, plus one, times how long a capture has lately taken, between 1 and 60.

## What an answer tells

**A done task tells the capture's story as well as its state**, the same to the public as to us: the public reaches public addresses alone, so nothing in it is ours to hide.

- `task`: `asked_at`, `started_at`, `finished_at` and `expires_at`, as RFC 3339 instants, and
  `queued_ms` and `rendered_ms` between them. Asked again after failing, a capture's story starts
  over.
- `request`: what the capture was asked, normalized -- the page's address put together from its
  parts, the viewport, `full`, `timeout` and `delay` in seconds, `insecure`, `internal` and
  `javascript`.
- `pictures`, once done: `width` and `height` in pixels, `png_bytes`, and `webp_bytes` or null.
- `page`: the address it ended at, each `redirects` hop with its status, the document's `status`
  and `type`, its `title`, `description` and `language`, and its whole `width` and `height`.
- `load`: `dns_ms`, the name's lookup as the proxy made it, since the browser resolves nothing;
  `connect_ms`, `tls_ms`, `first_byte_ms`, `dom_content_loaded_ms` and `load_ms` from the browser's
  navigation timing, whose connection is to the proxy's tunnel; `requests` and `bytes` over the
  whole page; and `resources`, the same two split by what each response was, as the browser names
  its type -- `document`, `script`, `stylesheet`, `font`, `image`, `media`, `fetch` for both
  `XHR` and `Fetch`, and `other` for the rest -- each `{ count, bytes }`, every kind present even
  at zero. `bytes` is what crossed the wire, compressed as it came.
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
  refuses it with a 403 -- as a query parameter, or as a key anywhere in a JSON body -- and `shot`
  ignores it on a marked request as well. Without it a capture reaches public addresses alone.
- The public starts three captures a minute from one address, by GET and POST together, at the
  gateway; asking after one and fetching it are not counted. Cloudflare's zone rate rule is the
  floor under that.

## Kept on disk, four gigabytes, oldest first

**Nothing held in memory is a picture.** Each capture is written beside its id in the service's
directory, through a temporary file and a rename: its pictures, and what its task says -- the
record `status?task=<id>` answers with -- as `<id>.json`. The directory is kept across restarts.

**The store holds four gigabytes, and the oldest capture goes when a new one would pass it.** A
capture's pictures and its record leave together; until then `status?task=<id>` and `pictures/<id>.png`
answer for it however long ago it was made. A failure keeps its record alone.

**The same page asked again within thirty minutes is the capture already made**; after that it is
captured again, and the older one stays by its own id until the store rolls it out. **`fresh=true`
captures anew even so, and only ours may send it**, refused and ignored exactly as `internal` is:
the probe checks a page every minute, and a check answered from a capture half an hour old checks
nothing. A fresh capture takes a new id, and the one it passed over keeps its own. It is not part
of what makes two asks one: the capture it makes is the one the next plain ask of the same
parameters is answered with. In a POST body it is `access.fresh`.

**Every capture is a record in the ledger**, queued, running and done, sent as it happens, and kept
there after the store has let the pictures go. See [ledger.md](ledger.md).

## Only public addresses

**Every request a capture makes leaves through a proxy inside `shot`, and the browser resolves no
name.** Judging the page's address before it loads would not be enough: the page loads more,
redirects, and a name can answer one address when it is judged and another when it is fetched. So
the proxy is the only way out, and it resolves each name itself and connects to the address it
judged:

- Names are asked of Cloudflare's and Google's DNS over HTTPS, both at once, for A and AAAA, and by
  their addresses (`libs/sdk`' `external.doh`), so the asking needs no DNS of its own and the
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
- **`javascript=false` captures the page as it is without scripts**: the browser is told to run
  none on the capture's page before it navigates, so what is taken is the markup and styles alone
  -- the page a crawler or a reader without scripts sees. Not asked, scripts run. It is part of
  what makes two asks one.
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

## Open

- **A picture is served at its id, to whoever holds it, for as long as it is kept.** What it lacks is
  a place that issues a temporary file -- an address signed for a while and then refused -- which
  `pictures/<id>.png` would give way to. Until one exists the route stays as it is.
