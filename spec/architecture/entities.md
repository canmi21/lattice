# Entities: the author and their work as one graph every page refers into

**Structured data here is written for an engine that wants to know who someone is and what they
made, not for a rich result.** The aim is entity-first GEO: answer engines and generative search
resolve a page to entities -- a person, a site, an article, a program -- and the more certain they
are that two mentions are one entity, the more they can say about it. The vocabulary is
schema.org, the mechanics are entity SEO's, and what a rich result needs is a floor rather than the
plan. A field goes in when schema.org defines it for that type and the data behind it is true; it
does not wait for Google to use it.

**What this is worth, as far as anyone has shown.** Bing has said on the record that schema
markup helps its LLMs understand content for Copilot, which grounds its answers in Bing's index.
Google says nothing special is needed for its AI features beyond structured data that matches the
visible page. No study has shown markup raising how often an answer engine cites a page. What the
practice is agreed on is resolution: stable identifiers and `sameAs` let an engine merge every
mention of one entity into one, and a person written out inline on each page is, to an engine, as
many people as pages. So the graph is for being understood, and what gets cited is still the
writing -- sources, figures, quotations.

## One entity, one identifier, declared once

Every node a page emits has an `@id`, and a node another page also names is referred to by that
`@id`, never repeated. Where another node names the author -- `author`, `publisher`, `creator` -- the
reference carries the author's name and address beside the `@id`: JSON-LD merges it into the one
person all the same, and a reader that does not follow identifiers still finds a name there. Two nodes sharing an `@id` are merged into one by JSON-LD, so a site and the
person who runs it can never share one; each takes a fragment of its own.

| Entity                     | `@id`                               | Emitted by               |
| -------------------------- | ----------------------------------- | ------------------------ |
| the author, `Person`       | `https://canmi.net/about#person`    | every page of both sites |
| the site, `WebSite`        | `https://canmi.net/#website`        | every page of the site   |
| an article view            | `{that view's canonical}#article`   | the article page         |
| the status site, `WebSite` | `https://status.canmi.app/#website` | the status page          |
| the status page, `WebPage` | `https://status.canmi.app/#webpage` | the status page          |
| the status program         | `https://status.canmi.app/#app`     | the status page          |

**The author's identifier is their entity home, `/about`, which does not exist yet.** An entity
home is the one page that says, first-hand, who an entity is; the identifier names it now so it
never has to move when the page arrives. Until then the IRI does not resolve, which a parser does
not mind. `/about` is a fixed address because of this: see [todo/site.md](../todo/site.md), "The
author has no entity home yet". The site's identifier sits beside its address rather than on it,
so the root is the site's and the author is not standing on it.

`@canmi/social/structured` holds the identifiers, the person, and `graph()` and `ldJson()`, which
every page writes its block with.

## The author is derived from `@canmi/identity`, whole

The `Person` node is built from the identity record and nothing else, so a new account is one line
there and every page says it next render:

- `name` is the name a page signs with; `alternateName` is every other name the author goes by,
  derived: the full name, then each handle -- GitHub, X, the fediverse, Telegram, the Telegram
  group's -- once each and never the name itself. A handle is a name somebody searches for.
- `sameAs` is each account's profile, the author's own: the Telegram account, not the group, since
  the group is a place the author runs rather than the author. The row of links on a page points at
  the group, which is a different question -- see [identity.md](identity.md).
- `identifier` is GitHub's numeric user id, which outlives a renamed handle.
- `jobTitle`, `url`, `email` and `image` are the role, the site, the address the home page already
  shows, and the GitHub avatar.

## The head says who wrote it too

**Every page of both sites names its author in plain HTML as well as in the graph**, for a reader
that parses a head and not a script: `<meta name="author">` with the author's name, and a
`<link rel="me">` to each of their own accounts that are shown -- the profiles `sameAs` lists, but
the Telegram account, which is said in the structured data alone. `rel="me"` is how a profile that links back to the site verifies the two are one person,
which the fediverse checks and IndieWeb tools read. The Telegram group gets neither, and the row of
links that does point at it carries no `rel="me"`, since the group is not the author.
`twitter:creator` names the author's X account on both sites.

`article:author` and `<link rel="author">` wait for `/about`: both would point at the author's
page, and a link to a page that does not exist yet is worse than none.

## What each page emits

- **Every page of the site**: the `WebSite`, with `alternateName` the author's name and the author
  as `author` and `publisher`, and the `Person`. One block, from the root layout.
- **An article page** adds its article in a block of its own, naming the author and the site by
  reference: `headline`, `alternativeHeadline` from the subtitle, `description`, `image` from its
  card, the two dates, `inLanguage`, `url` and `mainEntityOfPage`, `articleSection` from its
  category, `wordCount` from the same count the page shows, and `abstract` from the summary the page
  shows above the article, where it has one.
- **`citation` lists the works an article names by a block of their own**: a link card as a
  `CreativeWork` with its title, a repository as `SoftwareSourceCode`, an embedded post as a
  `SocialMediaPosting`, each once. A link inside a sentence points somewhere and cites nothing, so
  it stays out. On the page the card's title is a `<cite>`, which is what HTML calls the title of a
  cited work; a quotation is a `<blockquote>`, which the compiler already writes.
- **Each translated view is a work of its own** with its own identifier, and says which it is a
  translation of with `translationOfWork`; the original lists every translation with
  `workTranslation`. A locale that has no view of its own shows the source, and is the source work
  under the source's identifier. `translator` is not set: a model translates these, and the
  property takes a person or an organization.
- **The status page** emits its own site, the page, and the program behind it, which are three
  things: the page is `about` the program, the program's `creator` is the author, and the site's
  `publisher` is the author. It is a site of its own, on its own host, so it does not claim to be
  part of the author's site; the author is what joins the two.

**An article's type is what kind of writing its category is**, from one table in
`apps/site/src/lib/article/entity.ts`:

| Category                      | Type          | Because                                   |
| ----------------------------- | ------------- | ----------------------------------------- |
| `architecture`, `development` | `TechArticle` | technical depth                           |
| `milestone`                   | `BlogPosting` | a post about what happened                |
| `mirror`                      | `Article`     | reflection, which no narrower type fits   |
| anything else                 | `Article`     | the general type is true of every article |

## Only what is true, and only what the page shows

- A field is written only where there is data behind it. `TechArticle.proficiencyLevel` waits for
  the author to state one; guessing it from the category would be a claim nobody made.
- A node says what the page says. The graph is a second rendering of the visible page, never a
  place for words the page does not carry.
- `status` is not a property of a service: schema.org defines it for medical types only. Whether a
  service is up is the page's content, not a fact the markup asserts.
- `isPartOf` and `hasPart` take creative works. A service or a list relates to a page by `about` or
  `mainEntity`.
