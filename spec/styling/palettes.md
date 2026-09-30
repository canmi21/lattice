# Palettes: one set of color names, several sets of values

Every page here paints from the same color names -- `page`, `border`, `border-strong`, `text`,
`text-muted`, `text-soft`, `text-strong`, `ink`, `paper`, `paper-hover`, the native and selection
colors, and the accents `blue`, `green`, `amber` and `red` with their `-ink` pairs -- so a component written
for one app reads right in another. **What differs between apps is the values, and a set of values
is a palette.** `@canmi/theme` holds them, each a stylesheet defining every name for light, and
again under `.dark`; an app imports the one it wears.

| Palette    | Look                                                                         | Worn by   |
| ---------- | ---------------------------------------------------------------------------- | --------- |
| `concrete` | the site's: a black that is not quite black, a white that is not quite clean | site, cms |
| `mono`     | black and white, Vercel's restraint, with the site's grey ramp step for step | status    |

- **`mono` keeps the ramp, not just the ends.** Vercel's own greys are few; here every name above
  gets a value of its own, so a page built on `concrete`'s tiers -- a heading over a row over a
  column name -- keeps them when it changes palette. Its accents are the three the names already
  have, chosen for a monochrome page: saturated enough to mean something on it, and nowhere else.
- **A palette is chosen by the app, not by the reader.** There is no control and no cookie for it
  yet; the `palette` cookie the theme script still reads is a leftover and paints nothing. Light
  and dark are the reader's, by the `theme` cookie, as below.
- **The panel keeps its own Nord colors for now**, under names of its own; it moves onto these
  names, as a `nord` palette, when the panel is redesigned.

## Light and dark are one cookie, read the same way everywhere

**`theme` is `light` or `dark`, and `@canmi/theme` is the only code that reads or writes it**: the
inline script that settles it before the first frame, the server's reading of it, and the control's
writing of it. An app wires the script into its `app.html` and, where its render is its own, the
server's reading into its hooks -- the site does both, so its first byte already carries the class.
**The status page runs the script alone**, because its render is kept at the edge and shared
between readers, and a render that differed by cookie could not be; the script sets the class
before anything is painted, so no reader sees the other theme first.
