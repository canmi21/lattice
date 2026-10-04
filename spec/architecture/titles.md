# Titles: the full one for a first load, the short one for a known reader

**A page has two titles: the full one a search result shows, and the short one a tab shows.** The
full one leads with the name and then says, in plain words, what the page is; the short one is the
name alone. A crawler gets the full one and a reader who has been here before gets the short one.

| Page          | Full                                                 | Short          |
| ------------- | ---------------------------------------------------- | -------------- |
| site, home    | `Canmi - Notes on the software and hardware I build` | `Canmi`        |
| site, article | `<title>: <subtitle>`                                | `<title>`      |
| status        | `Canmi Status - Is everything up right now`          | `Canmi Status` |

The home's two halves are `title` and `subtitle` in `contents/homepage.md`. Every other page keeps
the one title it had. `og:title` is the full one where the page has one, the article's title alone
where it does not.

## Which one a load shows

`@canmi/kit/behavior` decides and renders it: the full title on a fresh load in a browser this app
has no mark in, the short one after, and why that is not cloaking, are the package's, in the lib
repository's `spec/kit/titles.md`. The mark is `visit.seen` in the `reader` record, see
[engagement.md](../engagement.md), "What this site remembers is two records and one mechanism".
Each app's root layout settles it on mount, and the site's `afterNavigate` shortens it on any
navigation that is not the first.
