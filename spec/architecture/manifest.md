# The web app manifest

## Each page names a manifest, and its icons are marks

**`/site.webmanifest` is written on each request by the site and by the status page**, each from
its own `src/routes/site.webmanifest`. Its icons are marks like the favicons --
`web-app-manifest-192x192.png` and `web-app-manifest-512x512.png`, in the app's own scope of
`data/record/symlinks.json`, `site` or `status`, and each app draws its own -- resolved to
their objects when it is asked, as the head resolves its own; see platform's
`spec/architecture/delivery.md`, "A page follows the name for the browser". So an icon changes by
publishing, never by redeploying, and the manifest is not itself an object: it would have to name
the icons by content id, which nothing here writes down.

- **It is served from the page's own origin**, because a manifest's start address must share the
  document's.
- **The head names it only once every app icon resolves**, through `<link rel="manifest">`, since
  a manifest whose icons are missing installs as nothing.
- **Its name is the one the page already says.** The site's is `site.config.yaml`'s, with the
  author's from `@canmi/me/identity` as its short name; the status page's is `NAME` in its
  `lib/manifest.ts`, which its title reads too, with `Status` as its short name.

## What it says

- **`display` is `browser`.** The page opens as a page in a tab, and a browser offers to install
  it only when asked; a standalone window is a decision about how the site is read, not made here.
- **`theme_color` and `background_color` are white**, though both pages have a dark theme: a manifest
  takes one value, and the places it shows -- a task switcher, a splash -- are brief enough that
  white is accepted.
- **Both icons are `maskable`.** They are drawn on a white ground with the mark inside the safe
  zone, so a platform that crops them to a circle cuts nothing.

## The Apple touch icon is not an app icon

**`apple-touch-icon.png` stays as it is and is not in the manifest.** iOS reads its own link, and
the app icon drawn on a white ground would show as a white border there. The two are separate
marks on purpose, and so is the favicon: each is drawn for where it is shown.

## Every favicon is framed as the sakura is

**A mark's `favicon.svg` is framed on its own shape, and sized to look as large as the status
page's sakura**, which is the reference because it was the one that read right in a tab. Its
viewBox is square and centered on the shape's visible box, with no `width` or `height`; it is then
tightened until the shape covers about as much of the square as the sakura does -- 55% -- unless
that would push the shape's box past 99% of the square, where it stops. A shape with deep gaps, a
star, stops at the cap and still reads a little smaller; that is the limit of compensating without
cropping it. The `favicon.ico` beside it is drawn from that svg, as PNG frames at 16, 32 and 48.

On 2026-10-08 the clover was drawn on a canvas with an eighth of it empty on every side -- 41% of
the square covered against the sakura's 55% -- and its ico was converted from it, so the two were
small together. The clover and the star were reframed this way; the cake, a picture in an svg, was
not measured.
