# Reader engagement

Newsletter subscriptions and likes are mutable reader state. They belong to the standalone API
Worker at `apps/api`, never to the site Worker. The site has no embedded `/api/*` routes.

**What SSR may fetch is decided by who the answer is about, not by whether it is engagement.** A
number about the site -- how many have subscribed, how many have liked, how many have read an
article -- is the same for every reader, so a shared cache may hold it and the server may render
it. A fact about whoever is asking is never either: a page cached for one reader would tell the
next one they had clicked something they had not. That is the line `/stats` and `/like` are split
along, and the one `GET /read` and `POST /read` are split along below.

## The count is asked for and recorded separately

Reading an article is two things that were one request. `POST /read` recorded the visit and
answered with the running total, so the only way to learn the count was to add to it -- and a
`POST` is not a cacheable request, so there was no answer a shared cache could hold. The figure
could not be rendered on the server and arrived after hydration, into a gap held open for it.

So the question and the visit are two methods on one resource:

|                   | what it is              | who does it                                              | cache                          |
| ----------------- | ----------------------- | -------------------------------------------------------- | ------------------------------ |
| `GET /read?slug=` | how many have read this | the load, on the server and on a client navigation alike | `PUBLISHED`, refusals included |
| `POST /read`      | one more has            | the browser, once it has hydrated                        | `no-store`                     |

One name and two methods rather than two names, because they are the same fact approached twice.
They share an answer shape for the same reason, the `POST`'s figure differing only in that it
includes the visit it just made.

**The `POST` still answers with a count, and that is not a second way to ask.** It is the one
moment the caller's own figure is known to be wrong: what it drew came from a cached answer taken
before this visit. The browser draws the served figure, records the visit, and replaces it with
the figure that includes itself -- so the number a reader watches settle is their own arrival.

Five minutes is the same delay every other published answer has, and the same reasoning: a
counter that lags a reader's own visit is corrected by that reader's own visit. A slug the corpus
does not name is refused for five minutes too, because it stays unnamed until the next
publication.

**A count is an ornament and never a dependency.** The site's lookup does not throw: an article
that would not render because a counter was unreachable trades the thing for the thing about it.
An absent count is absent from the metadata row rather than drawn as zero -- zero is a claim that
nobody has read this, which is a different statement from having nothing to say.

## One D1 database owns API state

The API has one Cloudflare D1 database for all of its relational state. Both the database name and
the Worker name are `api`; its binding is the complete word `DATABASE`. The production database is
in WNAM, and its id lives in [wrangler.jsonc](../apps/api/wrangler.jsonc) -- the only file that
consumes it. Copying the id here would make a third home for it, and the only one nothing checks.

Drizzle owns the TypeScript schema and generates committed SQL migrations. Migration filenames use
Drizzle's indexed random-word form, such as `0000_word_word.sql`; they are not named by hand.
Wrangler, not Drizzle, applies those migrations so D1 has one migration ledger. CI and deploys apply
committed SQL but never generate it.

Every API `build` applies remote D1 migrations before producing the dry-run Worker bundle. This
keeps Cloudflare Workers Builds from deploying code before its schema and deliberately means that
both local and non-production API builds target the production database. The build credential must
therefore have D1 edit access. The fallback API `deploy` command independently applies remote
migrations immediately before uploading the Worker. Local development applies local migrations
before starting Wrangler, whose default local D1 implementation is Miniflare.

### Schema before code is right until the migration changes a key

Applying migrations first is correct for anything additive. A widened schema is one the running
code simply does not use yet, so the window between the two is a window in which nothing is wrong.

**A migration that changes what an existing key means has no such window.** For as long as the old
code is live it reads and writes the old key against rows that no longer carry it -- and it does not
fail, which is the whole difficulty. A lookup misses, and the code does the reasonable thing with a
miss: it opens a fresh row. One record becomes two, the new one plausible and small, and nothing
reports it.

So such a migration is written to **fold rather than to skip**, and it is written to be safe to run
again. Skipping a collision is only correct if nothing can create one after the statement runs, and
the deploy order guarantees the opposite. Folding, plus a second run once the new code is live, is
what actually finishes the change -- and the second run is part of the change, not a repair.

Rehearse both runs against the live rows before either, and check the total rather than the rows:
a fold that preserves every count moves them and invents none.

This is recorded because it was measured. Keying the read counter by slug instead of by path
stranded six rows over the fifty-four minutes between the migration and the code that wanted it,
and a `0003` that skipped collisions could not have mopped them up on a second run.

## Newsletter identity is the email address

The API trims and lowercases an address, then removes the first `+` and everything after it in the
local part. It validates the resulting bare ASCII address before writing it. For example,
`Alice+notes@Example.com` becomes `alice@example.com`.

The canonical email is the subscription identity and the database primary key. Duplicate requests
do not create another subscriber. The raw `CF-Connecting-IP` value is stored with a new subscription
for future analysis only; it is not used to identify or deduplicate a subscriber.

A newly created subscription returns its canonical `email` and a `cancel_token`. API payload keys
use lowercase snake case. The token is 16 cryptographically random bytes encoded as exactly 32
lowercase hexadecimal characters. The browser stores the canonical email and raw token as JSON in
`localStorage["email"]`. The API stores only the token's SHA-256 hash. A duplicate request without
the original token still succeeds, but cannot receive a replacement token because that would let
another visitor cancel the subscription.

## The browser recognises its own subscription

That record is the only thing a returning reader is known by. HTML is rendered by a Worker that
cannot see `localStorage`, so the subscription form is what the server sends and the confirmed
state replaces it after mount.

### The homepage keeps its section; an article only offers one

The two placements are not the same thing and no longer behave the same way. The homepage's
section is a fixture: it is where a subscriber goes to cancel, so something has to stay reachable
whatever the reader's state. The section after an article is an offer, and an offer put to
somebody who has already accepted it is noise at the end of every article they read.

So `offer` marks the article's, and an offered section is **absent from the served HTML and
appended after hydration only when this device holds no subscription.** The server cannot read the
record, and the two ways round are not equally priced. Sending the section and removing it means a
subscriber is shown a form for one frame -- the one message they should never get -- and then
watches a block disappear. Sending nothing and appending it costs the unsubscribed majority a
block arriving late at the very bottom of the page, below the last thing on it, so nothing already
rendered moves. The document gets longer and that is all.

A reader with no JavaScript is therefore never offered a subscription on an article. The homepage
still serves the form, which is where the offer has to survive.

**The decision is latched at mount, not derived from the record.** Presence tracking the record
would delete the section at the instant somebody subscribed inside it, which is the 2.1-second
confirmation below playing inside an element that is removing itself. Subscribing after an article
therefore keeps the pill and the unsubscribe control for the rest of the visit, and the next
article is the first one to omit the section. That is the line the confirmation copy already sits
on: what the reader just did lasts one visit, what they are is what the next load reads.

The record is the only signal, so a device that subscribed without receiving a token is still
offered the section. That is the known cost of having no accounts, and it is where an account
system would answer instead -- a subscription bound to a login is readable by the server, which
makes this an SSR decision and retires the append.

**The pill itself is one element across both states.** Its box, its border and the place its
button occupies do not move; only what sits in them is replaced. A check mark was there first and
was the wrong shape for the moment: it re-announced what the sentence below already says, at the
cost of the one landmark the reader had just aimed at.

The button's place instead holds the outcome, so the shape somebody just used becomes the label
for what it did. It is inert -- there is nothing left to submit -- and it is the pill's whole
accessible content, the masked address being of no use read aloud.

Two things follow from it no longer being an action. It gives up the ink surface for the quiet
raised one, since ink is reserved for the thing worth pressing. And its copy states the state
rather than repeating the verb: `You're in` beside an `Unsubscribe` link, never `Subscribe`
beside it.

**Both labels are laid out in every state and the unused one is only made invisible**, so the
button is as wide as the wider of the two and its edge does not move when the copy changes. The
alternative is animating a width no stylesheet can know, which would drag a measurement into a
component that otherwise needs none. Every locale pays for this in the same place: the subscribe
button is occasionally a little wider than its own text.

A record that does not parse, or whose token is not the 32 hexadecimal characters the API will
accept, is deleted rather than shown. The alternative is an unsubscribe control whose every use
fails, which is worse than not offering one.

**The confirmed state and the ability to cancel are separate facts.** Subscribing again from a
device that never held the token confirms the address and offers no cancellation, because that
device genuinely cannot cancel. A cancellation the API answers with `404` clears the local record
and reports success: the subscription is already gone -- most likely cancelled from another
browser -- and an error would leave the reader looking at a subscription they cannot get rid of.

Cancelling takes one click and no confirmation step. Resubscribing is the same form that is
already on the page and issues a fresh token, so the mistake costs a click to undo.

### Subscribing takes 2.1 seconds, spent in three beats

That is a long time for an interface, and it only works as a **sequence**. Two seconds of
simultaneous motion reads as a page that has stopped responding; the same two seconds spent in
order reads as three things happening because of each other. Stretching one animation to fill the
budget was the failure mode to avoid — the fix for a transition that feels rushed is more stages,
not slower ones.

The timeline is one object in [sequence.ts](../apps/site/src/lib/newsletter/sequence.ts), handed
to the stylesheet as custom properties so no duration is written twice. Its tests hold two
invariants: the stages end exactly on the stated total, and none begins after the previous one has
finished — a gap is the reader watching nothing, which is the thing the sequence exists to avoid.

1. **The address is taken in.** A clip sweeps left to right across the masked form while a plain
   copy of what was typed lifts away beneath it, both in one grid cell so the mask arrives exactly
   where the field's text was. The reading is that the address was redacted rather than swapped,
   which is the truthful account of what happened to it.
2. **The button acknowledges it**, cooling out of ink and crossfading its copy, so one control is
   seen settling rather than a second appearing in its place.
3. **The line below settles**, the count clearing before the confirmation arrives in its place.

The sweep does not use the shared spring. A spring is a settle — it covers 97% of the distance in
the first half and leaves the rest of its stage with nothing visibly happening, which is exactly
what a stage this long cannot afford. It eases in and out instead, and the spring stays where
something is landing rather than travelling.

The unsubscribe control is last, and is absent rather than merely invisible until its beat. A
control that undoes what the reader is still watching happen has nothing to undo yet, and it
arrives directly below the button they just pressed, where a second click would otherwise land on
it.

### Unsubscribing runs the same beats backwards, in 900 milliseconds

Leaving is animated too -- a state that arrives deliberately and then vanishes was never one
thing changing -- but it is deliberately much shorter, and a test holds it under half the
forward total. Committing is worth dwelling on; leaving is not, and holding somebody inside an
animation while they are trying to go is the one place a long transition turns hostile.

The line under the pill leaves along the path it arrived by -- the confirmation and the
unsubscribe control both sink back down and fade, the exact reverse of their entrance -- so the
two states read as one thing changing rather than two that happen to share a row.

**The address does not reverse its sweep, though.** Redacting is something done to it, edge and
all; letting it go is not, and a mirrored wipe would say the site was busy taking the address back
rather than simply no longer holding it. It goes soft instead of directional: blurred out of
focus, drifting slightly, gone. It is also the longest stage of the four, which is what makes it
read as dissolving rather than being cleared away.

**The pill keeps showing the address it is undoing until that finishes**, so the record outlives
the request that cancelled it by exactly that long -- which is also why a second click is refused
for the duration rather than spent on a subscription that is already gone.

The submit button is the one thing that does not fade in at the end. It is the shape the chip has
just finished warming back into and arrives at the same ink it was handed; fading it would blink
the one element that was continuous across the swap. It springs up to size instead, because the
moment it becomes pressable again is worth marking and scale carries that without touching the
colour that made it continuous.

**A record read at mount animates nothing.** Someone returning to the page did not just do
anything, and replaying the confirmation would claim they had. The animation belongs to the
interaction, not to the state.

Reduced motion goes straight to the confirmed pill. The typed copy exists only to be animated
away, so without the animation it is not rendered at all rather than left behind for a timer to
remove.

This is a clip rather than the measured masks the Support rail uses. That geometry depends on the
rendered width of two labels and cannot be written down in advance; this one is always the whole
box, which puts it on the CSS side of the rule in [styling/controls.md](styling/controls.md).

### One row under the pill, in every state

Below the pill sits a single line: status text on the left, the unsubscribe control on the
right. It is present whether or not anyone is subscribed, so nothing further down the page moves
as the section changes state.

The left slot carries whatever the reader most recently needs to know -- an error, a
cancellation, a fresh confirmation -- and otherwise falls back to the subscriber count. The
confirmation therefore lasts one visit rather than persisting: by the time the page is reloaded
the pill already says the reader is on the list, and the sentence has been read. Stacking these
as separate lines was the first attempt and it made the section grow a row at a time as it
changed state.

The right slot is the only place a destructive action appears, and it is a text link rather than
a button surface. Reserving one edge for it keeps it from ever being the thing under a cursor
aimed at the subscribe button.

### The address is shown masked, and the domain is the identifying half

A confirmed subscription shows the address it is for, because the reader needs to tell their
address from a typo of it, and shows it masked, because a page may be read over somebody's
shoulder or on a shared screen. The first character of the local part survives and the rest
becomes bullets.

The domain is treated separately, since the two carry different amounts of identity. A mail
provider names nobody: thousands of readers share `gmail.com`, so it stays legible and is what
makes the masked address recognisable at all. A domain the reader controls is the opposite --
`canmi.net` identifies one person as surely as the full address -- so everything but the final
label is masked. A short allowlist of providers separates the two; anything absent is treated as
the reader's own.

The public suffix list is deliberately not used to find the registrable domain. Its payload
cannot be justified for this, and approximating it would leave `example.co.uk` exposed while
hiding `example.com` -- a rule that is wrong only for some readers is harder to trust than one
that always keeps a single label.

## A like is one active row per IP

The raw `CF-Connecting-IP` value is the like identity and database primary key. An IP can contribute
at most one active like. Liking inserts the row if absent; unliking deletes it. A state query returns
the current IP's `liked` boolean together with the global like and subscriber counts.

The stored IP values are not D1 rate-limit counters. The state query and mutation endpoints use
separate Cloudflare Workers Rate Limiting bindings keyed by the raw IP, with a wider allowance for
reads. This is deliberately approximate, inexpensive abuse resistance rather than a globally
strict quota.

## A read is counted by the browser that performed it

An article's read count follows its slug -- the site's own article path, such as
`development/rust-cargo-cranelift-tuning` -- and not any one of its nine language views. The
same article read in Japanese and in the original is the same article being read.

`POST /read` takes the slug in the body and answers with the count it now has. The slug is not
a path parameter because an article path contains a slash. The count is incremented and read in
one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement, so concurrent readers cannot be
handed the same number and an article's first read is the row's creation rather than a case of
its own.

**Which slugs exist is read from the published root, not learned from requests.** An
unrecognised slug is a `404` and never reaches the database. The list comes from the same object
that tells the site what exists, so the two cannot disagree about which articles there are.

**This used to be a module compiled into the Worker**, walked out of `contents/` at build time by
`scripts/slugs.ts` and committed so the root-level checks could read it without a build. That
arrangement is gone with the build it depended on: publishing an article no longer deploys
anything, so a generated list would have gone stale with nothing to regenerate it. What it bought
-- a slug validated without a round trip -- survives, because the root is parsed once per isolate
and cached. What it cost was a deploy of this Worker per article, and that is what was wrong with
it. See [architecture/artifacts.md](architecture/artifacts.md).

A newly published article is still briefly unknown here, for a different and smaller reason: the
root is cached, so the window is the cache rather than a deploy. It heals itself.

**Asking is not reading, and it is a different route.** `POST /read-counts` answers a count per
slug for a list of them and records nothing. A list is a body, so it is a batch entry rather than
a parameter repeated in a URL, and it is `read-counts` rather than `reads` because `/read` sits
beside it and has an effect -- two routes a letter apart where only one writes is a name waiting
to be called by mistake.

It is not cached, for the reason everything else here is not: a counter is a statement about right
now. That is also why the count does not travel with an article's metadata, which is cached for
five minutes per locale -- nine snapshots of one number that could disagree. A slug naming no
article is dropped from the answer rather than refusing it, so one bad entry in a listing does not
cost the rest.

Deduplication is one Cloudflare rate limit of one count per IP per article per minute, with the
wider per-IP engagement allowance above it to bound somebody walking every slug in turn. **Being
deduplicated is answered with the current count, not with `429`.** The page still needs the number
to display, and a second look inside the minute is the same read rather than a failure.

The counts the four original articles carried in their frontmatter came from the old site and are
not reconstructible; they were seeded once as a data migration and the `views:` key was then
removed from the markdown. That edit did not touch `lastmod`, because nothing about the articles
changed.

## What this site remembers is two records and one mechanism

`localStorage["state"]` holds the site's own small facts about the reader. `cache` belongs to
TanStack Query and `email` to the newsletter; each is somebody else's record with its own lifetime
and eviction, and neither is this. What was left was facts like whether the Support slot's first
favour has been done, and the first of those arrived as a loose key of its own. A second would
have arrived the same way, and a tenth -- which is how a reader's storage becomes a scatter of
names nothing owns and nothing can move together.

The persisted query cache is where the shape comes from: one container, edited in place. What is
deliberately not taken from it is the machinery. There is no eviction, no staleness and no
serialisation beyond `JSON`, because none of these facts expire and all of them are small.

**Keys are flat and dotted, like the message catalogue's.** `support.preferred`, not a `support`
object with a `preferred` inside it. Nesting buys grouping the dot already expresses and costs
every reader and writer a walk down a path that may not exist yet. A component simple enough to
hold one fact names the key after the component and stops.

**The version is an integer, and it is there from the first write.** `migrations[0]` takes a
record at version 1 to version 2, and a step edits in place and may assume every earlier one has
run. It was introduced while both lists were empty, which is exactly when the mechanism is
cheapest: a record written without a version cannot be migrated later, because the code that
would migrate it has no way to know what it is looking at. This section said the lists are empty
today and they no longer are -- the reader's record is still at version 1 with no steps, while
the per-tab record below is at version 2 with one, carrying `video.at` from a position to a
position and a picture of it. Three hundred versions from now it is still an integer.

**A record from a later version is left alone rather than reset.** That is a reader whose other
device runs a newer build -- the case cloud sync exists to make ordinary -- and the keys this
build understands are still readable inside it. Discarding it would throw away facts this build
merely has no opinion about. A record that is not an object, or carries no usable version, is
replaced, because nothing in it can be placed.

**Per-tab facts stay out of it, and have a record of their own.** `sessionStorage["state"]` is the
same container with the same mechanism, and the difference is whose fact it is: the `reader`
record is what is true of the person, the `tab` record is what is true of this sitting. A clip's
position belongs to the sitting -- coming back tomorrow to a twenty-five second clip that starts
at 0:18 is a surprise rather than a courtesy -- and the storage area is what says so. So does
`support.preferred`, which is in both: the reader has a preference, and this tab has already acted
on it.

**The two share everything except what cannot be shared:** the key, the version, and the
migrations. Two records hold different facts and will version independently, and a step written
for one running against the other is the failure the whole mechanism exists to prevent. Both are
called `state`, because the storage area already says which record it is.

**The reading trail is in the tab record too, and this paragraph used to say it was not.** It
stayed outside on two arguments: that it carried its own self-validating shape and its own
module, and that moving it would be churn with nothing on the other side of it.

The first never distinguished it. `video.at` also has its own module and its own per-value
check, and it lives in the container: what the container owns is where a fact is kept, not
whether the fact is well formed. A module still decides what its own value means -- `isTrail`
is unchanged and is still the whole of that question.

The second was a fair reading of its time and stopped being true. The record has since taken
`scroll.at` and `measured`, which left the trail as the only loose key in `sessionStorage` --
the exact scatter the container was introduced to prevent. It is also now half of one gesture:
Back needs where to go, which is the trail, and where the reader was on that page, which is
`scroll.at`. Two halves of one gesture should version together.

Nothing carries a live tab's old loose key across. A trail lives for one sitting and its absence
already means the homepage, so the cost of losing one is a Back control pointing where it points
on a first visit -- see [styling/rail.md](styling/rail.md).

**A fallback names the kind of thing wanted, and `undefined` is not a kind.** Reading the trail
with `undefined` as its fallback discarded every stored trail, because the container compares
what it found against the kind it was asked for. The fallback is `{}`, which an absent record
answers with and `isTrail` refuses like anything else that is not a trail.

### A path keeps its place, because Back is a link

A browser restores a scroll position on a history pop and nowhere else. That is right, and it is
not what this site's Back does: a trail step is a _forward_ navigation to an earlier path -- see
[styling/rail.md](styling/rail.md), "Back is one step up the reading trail" -- so nothing native
can tell it is a return, and a reader who opened an article from halfway down the homepage was
put back at the top of it.

So `scroll.at` holds where each path had got to, written in `beforeNavigate` for the page being
left. It is restored on a `link` or `goto` navigation to a path with a record, and on nothing
else: `enter` is a document the browser has already placed, `popstate` is one it restores itself,
and a fragment in the address is a reader naming where to be.

**It is restored on arriving at a path, not on going back to one.** Returning to a page is the
case that made this necessary, but it is not a narrower rule worth writing -- following a link to
a page this tab was reading is the same reader wanting the same place, whichever control they
used to get there. The cost is that a reader who wanted the top of a page they had been down
finds it where they left it, which is one gesture to undo and is what every tabbed application
does.

**The restore follows the page while it is still finding its height.** A client navigation
renders from data it already holds, so the document is usually the right height on the frame it
appears and the first attempt lands. What the following is for is the part of a page measured
after mount -- the homepage's cards do not know their pictures' shapes until they have them, so
the list is briefly shorter than it will be and an offset near the bottom would be clamped to
whatever fitted. It gives up after half a second, and it gives up instantly on any scroll of the
reader's own, who has answered the question by starting to read.

That half second is a consequence of measuring after paint, and [styling/first-paint.md](styling/first-paint.md)
is where that is being removed. When a client navigation knows its own layout before it paints,
the first attempt always lands and the following costs one frame.

**A collection is the exception to flat and dotted.** `video.at` is one key holding a map from
clip reference to position, because its keys are not names this repository chooses: they are
whatever the articles refer to. The rule is about names, not about depth, and one fact whose shape
is a map is not a group of facts that wanted a prefix. It also makes the collection readable and
clearable in one go, where a scatter of `video.at.<reference>` would not be.

**A fallback describes the kind of thing wanted, not just its `typeof`.** That was enough while
every fact was a boolean, a number or a string, and stopped being enough the moment one was a map:
`typeof null` and `typeof []` are both `'object'`, so a record holding either would have handed it
back as if it were the map and the first read off it would have thrown. Inside a collection the
check is per value, because the container can only answer whether the record holds a map at all --
what is in it came from an older build, another tab's idea of the key, or a reader with a console.

**The collection is not capped, and that is a decision rather than an omission.** No eviction was
decided when every fact was small and fixed; this is the first whose _number_ of entries is not. An
entry also carries a still, measured at 999 characters (see [video/player.md](architecture/video/player.md), "The
selector names the frame and not the `<video>`"), so one entry is about a kilobyte and a thousand
clips is about a megabyte -- a single-digit fraction of a quota measured in megabytes, not the
negligible fraction of it an earlier, byte-sized estimate of the entry once suggested. What still
makes that fraction affordable is that a thousand clips is not a session's worth: a tab is short,
and the number of distinct clips a reader can open in one sitting is nowhere near the corpus.

The store is passed in rather than reached for, the way `readTrail` takes one, so the tests hand
over a plain object and no global is installed to reach this. The record and the store are named
separately at every call site for the same reason: in production they always pair, and a test is
the place where they do not.

## What everyone sees is public; what you did is yours

`GET /engagement` answered three things at once -- two counters and whether the asker had liked --
so the whole answer was keyed by an address and none of it could be shared or rendered on the
server. It is two routes now:

| Route    | Answers                        | Lifetime              |
| -------- | ------------------------------ | --------------------- |
| `/stats` | subscriber count, like count   | `public, max-age=300` |
| `/liked` | whether this address has liked | `private, no-cache`   |

**What forced the split is not tidiness.** A page cached for one reader would have told the next
one they had clicked something they had not, so as long as the two travelled together the counts
could not be in the HTML. Now the server renders them and the heart is unmarked until the browser
asks -- which is the honest order, because the mark is the only part of it that is nobody else's
business. `/stats` is answered without a client address at all: a shared cache asking on
everyone's behalf carries none of its own.

### A counter that may be five minutes old is not refetched after a click

The consequence, and it cost a wrong number before it was written down. A mutation used to
invalidate the counter afterwards, which refetches `/stats` -- and `/stats` is public, so the
browser answers from its own cache with a copy that is allowed to be five minutes behind the click
that just happened. Measured: the cached answer said 0 while the API held 1, and the refetch
overwrote the right number with the stale one.

So a mutation's own reply is the last word. It carries the count the write produced, which is
fresher than any cacheable GET can be by construction, and `onSuccess` writes it into both caches.
Nothing is invalidated. The rule generalises: **do not revalidate against a cache that is allowed
not to know yet.**

### An answer is parsed, not assumed

Every engagement answer has a valibot schema in [libs/artifacts](../libs/artifacts/src/engagement.ts),
and both sides use the same one -- the Worker builds an answer satisfying the inferred type, the
browser parses what arrives against the schema it was inferred from. It used to be a hand-written
`typeof` beside each fetch: the same sentence six times, each only as current as whoever last
edited the route, and none of it checking more than the field it happened to name.

The corpus answers are not parsed this way and that is deliberate. They are checked by their
envelope instead, which is what a content-addressed object needs and all it needs; nothing under
engagement is content-addressed. See
[architecture/artifacts.md](architecture/artifacts.md), "Validation is heavy where it is free".

## Engagement data is a persisted client query

The site fetches engagement state in the browser from the standalone API origin. TanStack Query
deduplicates the shared request used by Newsletter and Support. Its sync-storage persister writes
all successful TanStack Query query data into the single global `localStorage["cache"]` container
across page reloads. All queries remain fresh for five minutes; once stale, normal TanStack Query
refresh triggers update them. Unused in-memory data and cross-reload persistence may remain for up
to three days as a fallback while a stale query refreshes in the background.

The read count is a query rather than a mutation despite having an effect, because what the page
wants back is the number and the number is what has to survive a reload. That makes the count and
the request that produces it the same thing, so its refetch triggers are off: a read is somebody
opening the article, not somebody returning to the tab.

Mutations and errors are never persisted. Email addresses and cancellation tokens never enter the
query cache. The dedicated `localStorage["email"]` capability record is independent application
logic and is not part of TanStack Query cache eviction or hydration.
