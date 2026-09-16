# Drafts

`draft: true` in an article's frontmatter withholds it from production. Absent means published,
so an article says nothing to be ordinary and one word to be held back.

## The flag is read directly, never through a text-field reader

`draft` is a YAML boolean, not text, and a reader that only returns text fields drops it --
`cms document::fields` did exactly that, so every draft read as published and the home card
counted articles nobody could open. The fix is to read the frontmatter's own value, not go
through a text-only accessor.

**Both readers accept the quoted form, and both trim it.** `draft: "true"` is a draft to
`cms document::is_draft` and to the site, which normalises the flag once in
[compile.ts](../apps/site/src/lib/content/build/compile.ts)'s frontmatter reader rather than at
each place that asks -- so `articleFrontmatter(...).draft` is the boolean the type promises and a
caller testing `=== true` is right without knowing any of this.

**Lenient in both, rather than strict in both**, because the two directions fail differently. The
strict reading publishes an article somebody wrote `draft: "true"` on, and publishing a draft is
the single failure this flag exists to prevent; the lenient reading at worst withholds an article
whose author typed the quotes and meant them, which they find the moment they look for it. The
readers disagreed for a while -- the CMS lenient, the site strict -- which is the shape the
workspace's `code.md` warns about under two readings of one format: nothing was wrong, something
was merely different, and the difference was a draft on the public site.

## A production build drops them; every other build keeps them

The discriminator is the site build's mode, the same one that picks between the production and
development URL maps. `vite build` is production and compiles a corpus with no drafts in it;
`vite dev` and `vite build --mode development` compile one with them, which is the only way to
look at a draft.

Dropping happens in [articles.ts](../apps/site/src/lib/content/build/articles.ts), before the
article is compiled, so there is one place to read and no list of consumers to keep in step. The
homepage listing, the sitemap, the Atom feed, `/llms.txt` and the per-article markdown all read
the same compiled corpus, and a draft is simply not in it. Filtering the result instead would
leave every one of those a place the omission could be forgotten.

**The build takes its policy from the caller, and the parameter is required.** A caller that
forgets to decide is a type error; a default would be a draft quietly shipped. The two callers
answer from what they are for -- the site build from its mode, and
[search.ts](../apps/site/scripts/search.ts) from the fact that the index it writes is
production's and has no other version.

**An `::article` card naming a draft fails the production build.** The card resolves against the
same reference map the corpus is built from, and a path missing from it already throws. That is
the report worth having: two articles written to ship together, one of which is not ready, is a
thing to be told about before deploying rather than after.

## The draft still exists everywhere a draft should

It is committed. Being unpublished is a fact about the article, not a reason to keep it out of
history, and a draft that lives only on one machine is one crash away from gone.

Its slug stays in the API's compiled list, so the read counter answers normally while the draft
is previewed and the count carries over the day it is published. A slug the API will accept for
an article with no public address costs a row nobody can reach; regenerating the list at
publication time, and losing what preview recorded, costs more.

**Its pictures and clips are derived and published like anybody else's.** `cms image` and
`cms video` do not ask whether an article is a draft, and `gc` keeps what a draft references,
because a draft references it. So the bytes reach the CDN before the article does, and the day it
is published there is nothing left to wait for -- which matters most for a clip, where the wait
would be minutes of AV1 encoding.

**The difference from a card is guessability, not publicness.** A card is `opengraph/{view}/{slug}.png`
and anyone holding the slug can write the address, which is why a draft gets none. A rung or a
variant is addressed by the hash of its own bytes: there is no address to derive from the article,
and the space is not one anything can walk -- the CDN rate-limits, so a client working through even
a sliver of it is stopped long before it arrives anywhere. Published bytes with no address anybody
can reach are not a leak; a guessable address for a piece nobody decided to publish is.

## In preview it is marked, and only there

A draft renders as itself -- same layout, same apparatus -- with one label beside the title, so a
tab open on a draft is never mistaken for one open on the site. The homepage listing is not
marked: the label answers "what am I looking at", and the listing is not where that is asked.

The label lives inside the `<h1>` rather than in a wrapper around it. A wrapper would be markup
every article carried in order to serve the few that are drafts, and the side rail measures that
very box to place the return control. As written, a published article renders exactly what it
rendered before, because the branch produces nothing at all.
