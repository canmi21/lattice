# Hints: what a page reaches early, declared once

A page names the hosts it will ask before it asks them, so the lookup and the handshake are behind
it by the time it needs them. Which hosts, and how early, used to be written out in each app's
`<head>`; the addresses repeated, and the reasoning with them. **`@canmi/hints` holds the hosts in
groups and the rules for each level of priority; an app declares only which groups it wants, and
at which level.**

## Groups of hosts, levels of priority

**A group is the hosts one kind of request goes to**, every address from `libs/urls`:

| Group       | Hosts                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| `fonts`     | Google Fonts' stylesheet host, and its file host, asked anonymously           |
| `ours`      | the API host's public side, the CDN and the alias layer                       |
| `github`    | GitHub's file CDN, where the site's embedded code comes from                  |
| `data`      | the status database, a Supabase project, named at run time by the app          |
| `analytics` | umami's tracker host and the hosts both counters report to, ours and theirs   |

**A level is what the page does for a group:**

- **`connect`** -- `preconnect`: the lookup, the socket and TLS, before the first paint. For what
  the first paint itself waits on, since a handshake competes with the page for the little a first
  paint has.
- **`resolve`** -- `dns-prefetch`: the lookup alone, the part slow on a cold cache, for what the
  page asks once the reader has it.
- **`idle`** -- `resolve`, and what the group loads is started only once the page is idle, at
  `fetchpriority="low"`: a script nobody reading is waiting for never competes with one they are.

**An app declares its groups and their levels where it renders its head, and the library writes
the tags**: the same group at the same level is the same tags in every app, and a host is changed
in one place. A group an app does not name gets nothing.

| App    | `connect`                 | `resolve` | `idle`      |
| ------ | ------------------------- | --------- | ----------- |
| site   | `fonts`, `ours`, `github` |           | `analytics` |
| status | `fonts`, `ours`, `data`   |           | `analytics` |

**The site's analytics were already this**: resolved, not connected, and its loader at low
priority -- see [analytics.md](../analytics.md), "The analytics hosts are resolved early, not
connected early". The status page takes the same level; it does not connect to what counts it.
