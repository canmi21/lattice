# Drafts

`draft: true` in an article's frontmatter withholds it from production. Absent means published,
so an article says nothing to be ordinary and one word to be held back.

## The flag is read directly, never through a text-field reader

`draft` is a YAML boolean, not text, and a reader that only returns text fields drops it --
`local document::fields` did exactly that, so every draft read as published and the home card
counted articles nobody could open. The fix is to read the frontmatter's own value, not go
through a text-only accessor.

**Both readers accept the quoted form, and both trim it.** `draft: "true"` is a draft to
`local document::is_draft` and to the site, which normalises the flag once in
[compile.ts](../libs/compile/src/compile.ts)'s frontmatter reader rather than at
each place that asks -- so `articleFrontmatter(...).draft` is the boolean the type promises and a
caller testing `=== true` is right without knowing any of this.

**Lenient in both, rather than strict in both**, because the two directions fail differently. The
strict reading publishes an article somebody wrote `draft: "true"` on, and publishing a draft is
the single failure this flag exists to prevent; the lenient reading at worst withholds an article
whose author typed the quotes and meant them, which they find the moment they look for it. The
readers disagreed for a while -- `local` lenient, the site strict -- which is the shape the
workspace's `code.md` warns about under two readings of one format: nothing was wrong, something
was merely different, and the difference was a draft on the public site.

## Publication drops them, and nothing else compiles them

**The discriminator is that the publish pass never reads a draft**, and nothing else. It runs the
compile once, over the articles the flag did not withhold, and writes one root under
`data/bucket/metadata/`. A draft has no compiled body anywhere, so there is nothing to withhold
by omission and nothing to sweep by mistake.

There used to be a second root under `data/bucket/draft/` naming the drafts, bound to the API's
development server so that a development site could open an article production could not. It
needed a symlink to reach the published records, a second compile pass, a branch in `local gc`
keeping the bodies only it named, and a guard in `sync` refusing a source that contained it --
five places, for one capability. **The CMS renders a draft from its draft row now**, which is
where the writing already is and needs no published bytes at all, so all five are gone. See
[todo/milestones.md](todo/milestones.md), B3a.

**Objects are not what is withheld, and were never what was withheld.**
[refs.rs](../apps/local/src/refs.rs) has never read the draft flag, so a draft's pictures and clips
are derived into the published tree and mirrored with everything else. What keeps them from a
reader is that nothing hands out their content ids -- a 128-bit hash of the bytes is not something
anyone reaches without being told it. What a root added was **a name somebody can guess**: a slug
is human-readable and `findArticle` maps one to a content id, so a root naming a draft was a draft
anybody could ask for by title. Not compiling it at all is stronger than not naming it, and it is
one rule where there were two. See
[architecture/artifacts.md](architecture/artifacts.md), "Drafts leave the corpus at publication,
not at build".

Dropping happens in [articles.ts](../libs/compile/src/articles.ts), before the article is
compiled, so there is one place to read and no list of consumers to keep in step. The homepage
listing, the sitemap, the Atom feed, `/llms.txt` and the per-article markdown all resolve through
the root, and a draft is simply not in it.

**The compile still takes its policy from the caller, and the parameter is still required.** A
caller that forgets to decide is a type error; a default would be a draft quietly shipped. Both
callers now answer the same way -- the publish step and
[search.ts](../apps/site/scripts/search.ts) each write production's only version -- and the
parameter stays because the next caller may not.

**An `::article` card naming a draft fails the publish.** The card resolves against the
same reference map the corpus is built from, and a path missing from it already throws. That is
the report worth having: two articles written to ship together, one of which is not ready, is a
thing to be told about before deploying rather than after.

## The draft still exists everywhere a draft should

It is committed. Being unpublished is a fact about the article, not a reason to keep it out of
history, and a draft that lives only on one machine is one crash away from gone.

Its slug is in no compiled list until it is published, because nothing compiles it. The read
counter therefore starts at publication rather than at preview -- which is the honest reading of
it anyway: what a preview records is the author looking at their own draft.

**Its pictures and clips are derived and published like anybody else's.** `local image` and
`local video` do not ask whether an article is a draft, and `gc` keeps what a draft references,
because a draft references it. So the bytes reach the CDN before the article does, and the day it
is published there is nothing left to wait for -- which matters most for a clip, where the wait
would be minutes of AV1 encoding.

**The difference from a card is what an address is drawn for, not publicness.** A card exists to
be handed to a crawler, so drawing one for a draft would be preparing a public answer about
something nobody decided to publish -- which is why a draft gets none, and the reason survives the
cards becoming content-addressed rather than depending on it. A rung or a
variant is addressed by the hash of its own bytes: there is no address to derive from the article,
and the space is not one anything can walk -- the CDN rate-limits, so a client working through even
a sliver of it is stopped long before it arrives anywhere. Published bytes with no address anybody
can reach are not a leak; a guessable address for a piece nobody decided to publish is.

## In preview it is marked, and preview is the CMS's

A draft renders as itself -- same layout, same apparatus, the site's own components -- with one
label beside the title, so a tab open on a draft is never mistaken for one open on the site.
Preview is the CMS's surface rather than a route of the site's: it reads the draft row, which is
what the author is editing, instead of bytes a publish pass had to write first.

The label's branch is in the article components and stays there. It is reached by a compiled
article carrying the flag, which now only happens under the CMS.

The label lives inside the `<h1>` rather than in a wrapper around it. A wrapper would be markup
every article carried in order to serve the few that are drafts, and the side rail measures that
very box to place the return control. As written, a published article renders exactly what it
rendered before, because the branch produces nothing at all.
