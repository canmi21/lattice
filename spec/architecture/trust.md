# Trust to write

## Reading is open; a write needs a passed check, held for a day

**The site's pages, its files and every read of its API answer anyone.** What is guarded is a write
-- a like, a subscription and its cancellation, a read counted -- because each lands a row in the
database. The guard is Cloudflare Turnstile, run by the page rather than by the firewall: a
request for a page or a file meets nothing, and a reader whose script is blocked reads exactly as
before and only cannot write.

- **Every write needs trust, and only `batch` is let through**, in `UNGUARDED` in
  `apps/site/api/src/lib/trust.ts`: it is a read sent as a POST because its question does not fit
  a query, and the server rendering a page asks it with no reader's cookie. The check's own route,
  `verify`, is the other.
- **A write without trust is `428 Precondition Required`**, `invalid_token` in the envelope. The
  page answers it by running the check and asking once more; anything else that refuses a write is
  the caller's as it came.
- **Trust lasts 24 hours**, `TRUST_SECONDS`.

## The page runs Turnstile unseen, and shows it alone when it needs the reader

**On arrival the page runs the widget in the background whenever it holds no trust**, loading
Turnstile's script only then. The widget is Managed, rendered with `appearance: 'interaction-only'`
and the action `trust`: a reader Turnstile is sure of never sees it. When it needs the reader,
`before-interactive-callback` shows the overlay in `apps/site/src/lib/trust/` -- the whole screen
on any device, the page's own ground, and the widget alone. While it shows, the page under it does not
scroll and keeps its place: the root's overflow is held, never the scroll position rewritten.
Passing closes it; Escape closes it too and leaves the page as it was, since nothing on it was ever
withheld.

**A write waits for a check already running before its first attempt**, so a read counted on
landing does not race the arrival's own check into a 428. `writeFetch` is the one way a write is
sent.

**A write the page sends on its own is passive, and never brings the check back.** A read counted
is one: it waits for the arrival's check, but a 428 does not start another, and once the reader has
closed the overlay it no longer waits either -- the read is simply not counted. Without this,
Escape closed the overlay and the read counter, refused, opened it again at once. A write the
reader makes -- a like, a subscription -- asks again, since they asked for it.

## The token is spent once; the grant is a signed cookie and a row

**Turnstile's token is never kept.** It is valid for 300 seconds and verifiable once; the page sends
it straight to `POST /api/security/verify`, which asks Siteverify with the secret and the caller's
address and drops it. A real secret is held to the request's own hostname and the action `trust`,
so a token minted elsewhere or for something else is refused; Siteverify itself refuses a token
seen before.

**A passed check is a grant: a row in `trust_grants` and two cookies.**

| what           | holds                                                                                    | read by  |
| -------------- | ---------------------------------------------------------------------------------------- | -------- |
| `trust_grants` | a random id, its end, when, the country                                                  | the API  |
| `trust` cookie | the id and its end, signed with `TRUST_KEY`; HttpOnly, Secure, SameSite=Lax, `Path=/api` | the API  |
| `trust_until`  | the end alone                                                                            | the page |

A write is let through when the cookie's signature holds, its end has not passed, and the row is
still there -- so a grant is withdrawn by deleting its row, whatever the cookie says. The signature
is checked first, so a forged cookie costs no query. The database is D1, already the site's, and
not KV: a grant written and read a moment later at another location must be there, which KV's
eventual consistency does not promise. Ended rows are deleted whenever a new grant is made.

`trust_until` only spares the page a check it does not need; it grants nothing.

## The gate is off until the secret is set

**`TURNSTILE_SECRET` and `TRUST_KEY` are Worker secrets**, kept in `secrets.json` as well; while
the first is unset the gate lets every write through and logs that it did, and `verify` answers 503. The site key is public and in `site.config.yaml`, `turnstile.siteKey`, null until the widget
exists, which keeps the page from running anything. So the code ships before the widget, and the
gate opens when both are set.

**Development runs the gate with Turnstile's test keys**: the site key that passes unseen, and the
secret that passes its dummy token, with `TURNSTILE_TEST` sparing the hostname and action that a
test answer does not carry. `VITE_TURNSTILE_SITE_KEY=3x00000000000000000000FF` forces the
interactive challenge, for working on the overlay.

## The widget also leaves `cf_clearance`, for later

**The widget is created with pre-clearance**, so passing it also sets Cloudflare's own
`cf_clearance` on `canmi.net` for the zone's Challenge Passage. Nothing reads it today; a firewall
rule that challenges later lets a holder through without a second check. It works only on a zone
Cloudflare proxies, so the status page, on Vercel, gets none.
