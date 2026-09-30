# Hints: what a page reaches early, declared once

A page names the hosts it will ask before it asks them, so the lookup and the handshake are behind
it by the time it needs them. Which hosts, and how early, used to be written out in each app's
`<head>`; the addresses repeated, and the reasoning with them. **`@canmi/hints` holds the hosts in
groups and the rules for each level of priority; an app declares only which groups it wants, and
at which level.**

## Groups of hosts, each with a default an app may raise or lower

**A group is the hosts one kind of request goes to**, every address from `libs/urls`, and **each
group carries its default**: how early its hosts are reached, and, where it loads something itself,
the priority that request is made at.

| Group       | Hosts                                                                       | Default   | Its loads                      |
| ----------- | --------------------------------------------------------------------------- | --------- | ------------------------------ |
| `fonts`     | Google Fonts' stylesheet host, and its file host, asked anonymously         | `connect` |                                |
| `ours`      | the API host's public side, the CDN and the alias layer                     | `connect` |                                |
| `jsdelivr`  | jsDelivr, the third-party CDN the site's embedded code comes from           | `resolve` |                                |
| `data`      | the status database, a Supabase project, named at run time by the app       | `connect` |                                |
| `analytics` | umami's tracker host and the hosts both counters report to, ours and theirs | `resolve` | `defer`, `fetchpriority="low"` |

**A level is how early a group's hosts are reached:**

- **`connect`** -- `preconnect`: the lookup, the socket and TLS, before the first paint. For what
  the first paint itself waits on, since a handshake competes with the page for the little a first
  paint has.
- **`resolve`** -- `dns-prefetch`: the lookup alone, the part slow on a cold cache, for what the
  page asks once the reader has it.

**A load's priority is a hint within the page's own batch, never a delay**: the analytics loader
is fetched with everything else, deferred and at low priority, so it waits behind what the reader
is waiting for without waiting for anything to finish.

**An app names the groups it wants, and a level for any it would move off its default**; the
library writes the tags. The same group at the same level is the same tags in every app, and a
host, a default or a priority is changed in one place. A group an app does not name gets nothing.

| App    | Groups                                                       |
| ------ | ------------------------------------------------------------ |
| site   | `fonts`, `ours`, `jsdelivr` raised to `connect`, `analytics` |
| status | `fonts`, `ours`, `data`, `analytics`                         |

**The site's analytics were already this** -- resolved, not connected, the loader at low priority;
see [analytics.md](../analytics.md), "The analytics hosts are resolved early, not connected early".
