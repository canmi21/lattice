# Robots: what the site and the status page let a crawler fetch

**This repository declares its two page hosts' robots.txt, sitemaps and security.txt, in
`libs/robots`.** What every host shares -- the opening, content signals, the sitemap, security.txt
and the layout of the word to an agent -- is `@canmi/me/robots`, and the rule that each repository
declares its own hosts is the workspace's `spec/robots.md`. The CDN, the alias layer and the API
are the platform's, declared there.

| Host     | Rules                                   | Content signals      |
| -------- | --------------------------------------- | -------------------- |
| `site`   | all but `/@/`, `/cgi-bin/`, `/cdn-cgi/` | yes, and the sitemap |
| `status` | all                                     | yes, and the sitemap |

**Both serve pages, so both say how their content may be used**, yes to all three -- see lib's
`spec/me/robots.md`, "Content signals are for pages, and say yes to all three". The site wants to
be found, quoted in answers, and known to models -- see [entities.md](entities.md) -- and a no on
any of them would work against the rest. The site sends the same signals as headers on its pages
and their markdown, from `SIGNAL_HEADERS`.

## The two page hosts name each other

`PAGE_HOSTS` is the list every sitemap follows: the site, then the status page, each with how
often its root changes and how much it weighs in the whole. Each host's robots.txt names both
sitemaps, its own first, and each sitemap lists the other host by its root alone -- see lib's
`spec/me/robots.md`, "Every page host names every other". Each answers `/sitemap.xsl` on its own
origin by following the one stylesheet through the alias layer -- see platform's
`spec/architecture/delivery.md`, "A page follows the name for the browser".

## Each says its own word to an agent

**The site and the status page end both files with a note of their own**, four in all, held apart
from each other and to the layout `@canmi/me/robots` checks, and send the agent to this repository,
`SOURCE` in `@canmi/me/urls`. Why a host says it at all is lib's `spec/me/robots.md`, "A word to an
agent sent to break in".
