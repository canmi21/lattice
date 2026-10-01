# Identity: who the author is, and where they are found, declared once

**`@canmi/identity` holds the author**: the name a page signs with, the full name, the role, the
email, and the handle on each service -- GitHub, X, the fediverse, Bluesky, Telegram. Every app
reads it; none spells the name. The site's `site.config.yaml` keeps what is the site's own and takes
its `author` from here, so `site.author` reads as it always has. The data is a JSON file,
`libs/identity/author.json`, so the Rust that draws the home card and the scripts that compile the
corpus read the same file the TypeScript does. A service's address is `libs/urls`'
and a handle is this library's: the link is the two put together.

**`@canmi/social` is the row of links to where the author is found, and only its shape**: the row's
layout, each icon drawn as it needs to read at the same weight as the rest, and each link's default
address, in the order the site shows them. An app names the entries it shows, may give any of them
another address -- its own sitemap and feed always -- and colors the row itself: the icons draw in
the current color, and the library sets none.

| App    | Shows                                                                          |
| ------ | ------------------------------------------------------------------------------ |
| site   | all nine: GitHub, X, fediverse, Bluesky, Telegram, sitemap, two webrings, feed |
| status | the first five, the author's own accounts                                      |

**`@canmi/social/structured` is the author as schema.org reads a person**, built from the same two
libraries: the name, the full name as `alternateName`, the site as `url`, and each account's profile
in `sameAs`, so a search engine can tell the accounts are one person and the site is theirs. Every
app's JSON-LD names it as `author`, and `ldJson` there is the one way any page writes JSON-LD.

**A page signs itself `© <year> <name>`**, the year the server's when the page was rendered, and not
moved by the browser after: a page rendered on New Year's Eve says the old year until it is rendered
again.
