# Markdown: every page's source, first-party, at its own address and beside it

**A page's markdown is the site's own, never converted at the edge.** Every article and the
homepage publish their source, and it is served two ways: at `<page>.md`, the llms.txt convention,
and at the page's own address to a reader whose `Accept` asks for markdown first -- the convention
Cloudflare's "Markdown for Agents" serves, which is therefore left off, so nothing at the edge turns
the HTML into a second, different markdown.

## Which reader gets it

**`Accept` names `text/markdown` and weighs it no lower than `text/html`.** A browser never names
markdown, so it always gets the page; an agent asking `Accept: text/markdown` gets the source at the
same URL. A document -- an address with an extension -- does not negotiate, as
[locale/addressing.md](../locale/addressing.md), "Every page negotiates; the exceptions are
documents", has it.

## What it says about itself

**The source is the source: one language, as written.** Translations exist as HTML only, so a
markdown answer is always the original, and its first line after the front matter says so in
English -- `> This is the source of this page, provided as written, in Chinese (zh).` Asked for at
the page's address in a language that is not the source's -- by `?lang=`, the cookie or
`Accept-Language`, negotiated as the page would be -- the line says that, and where that language
is: no markdown in it, the source below, the asked language available as `text/html` at the page's
`?lang=` address. A regional variant of the source's language is the source's language.

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
