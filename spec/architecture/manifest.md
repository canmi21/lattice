# The web app manifest

## The site names a manifest, and its icons are marks

**`/site.webmanifest` is written by the site on each request**, from `apps/site/src/routes/site.webmanifest`.
Its icons are marks like the favicons -- `web-app-manifest-192x192.png` and
`web-app-manifest-512x512.png` in the `site` scope of `data/record/symlinks.json` -- resolved to
their objects when it is asked, as the head resolves its own; see platform's
`spec/architecture/delivery.md`, "A page follows the name for the browser". So an icon changes by
publishing, never by redeploying, and the manifest is not itself an object: it would have to name
the icons by content id, which nothing here writes down.

- **It is served from the site's own origin**, because a manifest's start address must share the
  document's.
- **The head names it only once every app icon resolves**, through `<link rel="manifest">`, since
  a manifest whose icons are missing installs as nothing.
- **Its name is the site's and its short name the author's**, from `site.config.yaml` and
  `@canmi/me/identity`, so neither is spelled a second time.

## What it says

- **`display` is `browser`.** The site opens as a page in a tab, and a browser offers to install
  it only when asked; a standalone window is a decision about how the site is read, not made here.
- **`theme_color` and `background_color` are white**, though the site has a dark theme: a manifest
  takes one value, and the places it shows -- a task switcher, a splash -- are brief enough that
  white is accepted.
- **Both icons are `maskable`.** They are drawn on a white ground with the mark inside the safe
  zone, so a platform that crops them to a circle cuts nothing.

## The Apple touch icon is not an app icon

**`apple-touch-icon.png` stays as it is and is not in the manifest.** iOS reads its own link, and
the app icon drawn on a white ground would show as a white border there. The two are separate
marks on purpose, and so is the favicon: each is drawn for where it is shown.
