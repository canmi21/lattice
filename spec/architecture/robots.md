# Robots: what each host lets a crawler fetch, and what its pages may be used for

**Every host's `robots.txt` is declared in `@canmi/robots`, by service, and nowhere else.** A host
asks for its own by its internal name -- `robotsFor('site')` -- so a change to one policy is one line
there, and the rules every host shares are written once.

| Service  | Rules                                     | Content signals |
| -------- | ----------------------------------------- | --------------- |
| `site`   | all but `/@/`, the internal namespace     | yes, and the sitemap |
| `status` | all                                       | yes             |
| `cdn`    | all                                       | no              |
| `aka`    | all                                       | no              |
| `api`    | only the site's scope, `/site/`           | no              |

**The API lets in the one scope a page asks.** A crawler that renders a page -- Google's does -- asks
the API for what the page fetches after hydration; shut out, it renders a page with nothing in it.
Every other scope stays out, since its URLs in an index would compete with the pages that call them.

## Content signals are for pages, and say yes to all three

**A service that serves pages says how their content may be used; a store of bytes or an API does
not.** A signal is a statement about content -- whether it may be indexed, quoted into an answer,
trained on -- and an object store or an API has rules about fetching and nothing else to say. The
signals are said once, as `SIGNALS`, and written in both spellings, since crawlers read one or the
other:

```
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Content-Usage: search=y, ai-use=y, train-ai=y
```

- `Content-Signal` is Cloudflare's, from contentsignals.org: `search` is an index and results with
  links and short excerpts, AI summaries excluded; `ai-input` is content fed to a model as it
  answers -- retrieval, grounding, generative search; `ai-train` is training or fine-tuning.
- `Content-Usage` is the IETF AI Preferences working group's draft, the standards-track form of
  the same idea: `search`, `ai-use` and `train-ai`, each `y` or `n`, in robots.txt or as an HTTP
  header. An unstated one is unknown rather than either answer.

**All three are yes.** This site wants to be found, quoted in answers, and known to models -- see
[entities.md](entities.md) -- and a no on any of them would work against the rest. Cloudflare's
legal preamble, which turns a no into a reservation of rights under EU copyright law, is left out:
with nothing reserved there is nothing for it to say.

**The policy is the repository's, not the edge's.** Cloudflare can write content signals into a
zone's `robots.txt` itself; that setting stays off, for the reason the security headers came into
the repository -- see [referrer.md](../referrer.md): a header the edge sets is one nobody can grep
for.
