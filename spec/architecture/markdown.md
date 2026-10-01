# Markdown: every page's agent view, first-party, at its own address and beside it

**A page's markdown is the site's own, never converted at the edge.** Every article and the
homepage have an agent view -- the page as an agent reads it, ranked with the page rather than
beneath it -- served two ways: at `<page>.md`, the llms.txt convention,
and at the page's own address to a reader whose `Accept` asks for markdown first -- the convention
Cloudflare's "Markdown for Agents" serves, which is therefore left off, so nothing at the edge turns
the HTML into a second, different markdown.

## Which reader gets it

**`Accept` names `text/markdown` and weighs it no lower than `text/html`.** A browser never names
markdown, so it always gets the page; an agent asking `Accept: text/markdown` gets the source at the
same URL. A document -- an address with an extension -- does not negotiate, as
[locale/addressing.md](../locale/addressing.md), "Every page negotiates; the exceptions are
documents", has it.

## What a view is

**The same as the page shows a person, and what the page only implies, without its styling.** One
for humans, one for agents, and no third file holding the source alone: the view is complete.

- **No front matter.** Structure is markdown's own: a title, a line saying what this is, then one
  section per kind of fact, so what belongs together is visible rather than flattened into keys.
- **It opens by saying what it is**: the agent view of a named page, when it was generated, that
  the page for humans is the same address without `.md`, and the rule -- every page's view is its
  address with `.md` appended. An agent that negotiated its way here once can ask for `.md` from
  then on, while a crawler indexing the bare address still gets the page. Then where it sits -- the site's
  homepage view, then the section, which has no page yet and so is text.
- **Every section says where its data came from and when.** Facts from the published corpus carry
  the corpus's publication time; a live count says when it was counted and how long it is held; a
  summary says a model wrote it.
- **Facts are tables**, field and value, scannable and extractable alike.
- **An article**: about the article -- the title, the subtitle, the short pair, the description,
  its kind and section, the author, the language, the dates, the length, the page's address and
  the view's -- then its reads, its other languages, its summary, its contents linked into the page,
  the article itself with every heading one level down, the works it cites, and where else to go.
- **The homepage**: about the site, its readers, the introduction, every article with its date,
  section, titles, length and both addresses, the author with every name and account, and where
  else to go.
- **Each ends with the page's structured data**, the JSON-LD graph its HTML carries, for a reader
  that parses rather than reads -- one source for the facts, not a second copy in front matter.

**The text is in its original language.** Translations exist as HTML only, so the body is the
original, and the opening says so in English: `> The text below is in its original language,
Chinese (zh), as written.` Asked for at the page's address in a language that is not the original's
-- by `?lang=`, the cookie or `Accept-Language`, negotiated as the page would be -- the line also
says no markdown exists in that language and where it is as `text/html`. A regional variant of the
original's language is the original's language.

**The homepage's view is `/homepage.md`**, `/.md` and `/index.html.md` -- the llms.txt convention's
name for a root page -- redirecting to it.

**The headers say the rest**:

| Header                             | On                     | Says                                                    |
| ---------------------------------- | ---------------------- | ------------------------------------------------------- |
| `Content-Type: text/markdown`      | both                   | what it is                                              |
| `Content-Language`                 | both                   | the source's language, from its front matter            |
| `Link: <page>; rel="canonical"`    | both                   | the page is the address that counts                     |
| `x-markdown-tokens`                | both                   | about how many tokens it is, Cloudflare's convention    |
| `Content-Signal`, `Content-Usage`  | both                   | what [robots.md](robots.md) says, as headers            |
| `Vary: Accept`, `Content-Location` | the page's address     | it varies by `Accept`, and its own address is `.md`     |

The count is a CJK character as one token and four other characters as one: an estimate, as
Cloudflare's own is. The answer at a page's address varies by what was asked, so nothing shared
keeps it; `.md` keeps the publication delay.

**And the page says where its markdown is**: every article and the homepage name it in the head as
`<link rel="alternate" type="text/markdown">`, and their HTML responses carry the same as a `Link`
header with `Vary: Accept` and the two signals, so a reader that asks for headers alone finds it.
