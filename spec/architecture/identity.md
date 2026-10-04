# Identity: who the author is, and where they are found, declared once

**`@canmi/me/identity` holds the author**, declared once for every app: what the record holds and
how Rust reads it are the package's, in the lib repository's `spec/me/identity.md`. Every app reads
it; none spells the name. The site's `site.config.yaml` keeps what is the site's own and takes its
`author` from here, so `site.author` reads as it always has. A service's address is
`@monoflake/sdk`' and a handle is the author's: the link is the two put together.

**`@canmi/social` is the row of links to where the author is found, and only its shape**: the row's
layout, each icon drawn as it needs to read at the same weight as the rest, and each link's default
address, in the order the site shows them. An app names the entries it shows, may give any of them
another address -- its own sitemap and feed always -- and colors the row itself: the icons draw in
the current color, and the library sets none. **An icon's link carries its name as text**, hidden from sight
inside the link rather than as an `aria-label`: a screen reader reads either, but a crawler or a
translator takes a link's text and nothing else, and to them a label-only icon is a link with no
name.

| App    | Shows                                                                          |
| ------ | ------------------------------------------------------------------------------ |
| site   | all nine: GitHub, X, fediverse, Bluesky, Telegram, sitemap, two webrings, feed |
| status | the first five, the author's own accounts                                      |

**`@canmi/social/structured` is the author as one entity**, derived from this record, under one
identifier every page of every app refers to. What it says and why is
[entities.md](entities.md).

## One name, said plainly

**The author goes by Canmi, bare, and that is the name every page uses.** The full name, `fullName`,
is said only where the author is introduced: the home page and its card, the homepage's agent view
once, and the structured data, where `alternateName` lets an engine join the two. Anywhere else that
names the author in full -- an article's agent view, an index -- says `Canmi <t@canmi.icu>`, the
name and the address, which is `mailbox` in `@canmi/me/identity`; anywhere that only mentions the
author says `Canmi`. The homepage's agent view says which name to use.

**The author's own Telegram account is said in the structured data alone.** `sameAs` lists it, so
an engine can join it to the rest; everywhere a page or a document shows Telegram -- the row of
links, `llms.txt`, the homepage's agent view -- it is the group the author runs, and `rel="me"`
names no Telegram at all, the group not being the author.

**A page signs itself `© <year> <name>`**, the year the server's when the page was rendered, and not
moved by the browser after: a page rendered on New Year's Eve says the old year until it is rendered
again.
