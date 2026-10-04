# Referer: where a reader came from, taken out of the address bar

**Every web page here accepts `?ref=` and takes it out once it has hydrated**, through
`@canmi/web/referer`: what it takes and why it is not a page view are the package's, in the lib
repository's `spec/web/referer.md`. What the site sends to others is a different matter, in
[referrer.md](../referrer.md). Nothing reads the values yet; a report of where readers arrive from is
one more line where they are taken.

| App    | Takes                                                    |
| ------ | -------------------------------------------------------- |
| site   | `ref` on mount; `lang` on load, per locale/addressing.md |
| status | `ref` on mount                                           |
