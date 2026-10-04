# Hints: what a page reaches early, declared once

A page names the hosts it will ask before it asks them, so the lookup and the handshake are behind
it by the time it needs them. Which hosts, and how early, used to be written out in each app's
`<head>`; the addresses repeated, and the reasoning with them. **`@canmi/hints` holds the hosts in
groups and the rules for each level of priority; an app declares only which groups it wants, and
at which level.**

## A catalog of hosts, each with its policy, grouped

**Every host a page here reaches early is an entry in the catalog, and the entry carries its
policy**: how early it is reached, whether it is asked anonymously, and, where the page loads a
script from it, that script's priority. An address is from `platform/libs/sdk`; a policy is written once,
on its entry, and never again where the entry is used. Entries sit in groups by the kind of request
they serve:

| Group       | Entries                                                                               | Default   | Loads                          |
| ----------- | ------------------------------------------------------------------------------------- | --------- | ------------------------------ |
| `fonts`     | `stylesheets`, Google Fonts' css host; `files`, its file host, anonymous              | `connect` |                                |
| `api`       | `public`, the API host's public side, anonymous                                       | `connect` |                                |
| `ours`      | `cdn`, anonymous; `alias`, anonymous                                                  | `connect` |                                |
| `jsdelivr`  | `files`, jsDelivr, anonymous                                                          | `resolve` |                                |
| `data`      | `status`, the Supabase project, named at run time, anonymous                          | `connect` |                                |
| `analytics` | `umami`, its tracker host; `umamiCloud`, `openpanel`, where each cloud is reported to | `resolve` | `defer`, `fetchpriority="low"` |

**A level is how early an entry's host is reached:**

- **`connect`** -- `preconnect`: the lookup, the socket and TLS, before the first paint. For what
  the first paint itself waits on, since a handshake competes with the page for the little a first
  paint has.
- **`resolve`** -- `dns-prefetch`: the lookup alone, the part slow on a cold cache, for what the
  page asks once the reader has it.

**A load's priority is a hint within the page's own batch, never a delay**: the analytics loader
is fetched with everything else, deferred and at low priority, so it waits behind what the reader
is waiting for without waiting for anything to finish.

## An app declares what it uses, entry by entry

**An app names, group by group, the entries its pages actually reach -- never a whole group by
default -- and a level for any it moves off the entry's own**; the library writes the tags from the
catalog. Naming a group does not reach all of it: what a page reaches is its business, and the
declaration says so. The same entry at the same level is the same tag in every app.

| App    | Declares                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------- |
| site   | `fonts` both; `ours.cdn`; `api.public`; `jsdelivr.files` raised to `connect`; `analytics` all three |
| status | `fonts` both; `data.status`                                                                         |

**The site connects to the API, not to the alias layer.** After hydration the page asks the API for
what it renders, and its marks are written into the head as the objects they resolve to, so a page
never reaches the alias layer; only the feed, assembled on the server, names it. See
[delivery.md](delivery.md), "A page follows the name for the browser".

**The site's analytics were already this** -- resolved, not connected, the loader at low priority;
see [analytics.md](../analytics.md), "The analytics hosts are resolved early, not connected early".
