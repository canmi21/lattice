# Identity: who the author is, and where they are found, declared once

**`@canmi/identity` holds the author**: the name a page signs with, the full name, the role, the
email, and the handle on each service -- GitHub, X, the fediverse, Bluesky, Telegram. Every app
reads it; none spells the name. The site's `site.config.yaml` keeps what is the site's own and takes
its `author` from here, so `site.author` reads as it always has. A service's address is `libs/urls`'
and a handle is this library's: the link is the two put together.

**`@canmi/social` is the row of links to where the author is found**, one catalog entry per link --
its icon, drawn as the icon needs to read at the same weight as the rest, and the address it goes
to -- in the order the site shows them. An app names the entries it shows and passes the addresses
only it can know, such as its own sitemap and feed; nothing else is written twice.

| App    | Shows                                                                          |
| ------ | ------------------------------------------------------------------------------ |
| site   | all nine: GitHub, X, fediverse, Bluesky, Telegram, sitemap, two webrings, feed |
| status | the first five, the author's own accounts                                      |

**A page signs itself `© <year> <name>`**, the year the server's when the page was rendered, and not
moved by the browser after: a page rendered on New Year's Eve says the old year until it is rendered
again.
