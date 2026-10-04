# Old browsers, and the two floors that are not the same floor

A browser can fail this site in two unrelated ways, and conflating them is what made the first
attempt at this wrong. Keep them apart:

|                  | What decides it                | Failure looks like                                                         |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------- |
| **Syntax floor** | `build.target`, i.e. esbuild   | The bundle does not parse. Nothing runs, including any code meant to help. |
| **API floor**    | Which built-ins the code calls | The bundle runs and throws when it reaches the missing method.             |

**A build target lowers syntax and supplies no runtime built-ins.** That is why a target of
`chrome111` does not mean "runs on Chrome 111" -- it means "the syntax parses there". Nothing in
the build has an opinion about whether `Array.prototype.toSorted` exists, and nothing can: the
call site is indistinguishable from any other method call.

This was learned the expensive way. `toSorted` reached production, threw for a real reader, and
arrived as a Sentry issue. No configuration would have predicted it.

## The API floor: a short list of canaries, and all of core-js behind it

`@canmi/web/compat` checks for a short list of canaries -- `Array.prototype.toSorted`,
`URL.canParse` -- and, if any is absent, dynamically imports `core-js/stable` before hydration. The
mechanism, why a list of met cases rather than a complete one, and why `stable`, are the package's,
in the lib repository's `spec/web/compat.md`. A canary is added there, one line, when this site
meets a new edge case in production; `URL.canParse` was a Chrome 99 reader of the status page.

## The syntax floor is set to the same line, deliberately

`browserslist` in [apps/site/package.json](../apps/site/package.json) is the only place the
syntax floor is written, and `esbuildTarget` from `@canmi/web/compat/build` derives esbuild's
`build.target` from it in [vite.config.ts](../apps/site/vite.config.ts). Why the two floors must
agree, and why a floor and never a relative query, is the package's, in the lib repository's
`spec/web/compat.md`.

It names Chrome 110, Edge 110, Firefox 115 and Safari 16.0 -- the canary's line. This listed three
and the file declares four, which is a correction, though only of the enumeration: **Edge is not a
fourth line.** Edge 110 is Chromium 110, so it is the Chrome entry stated a second time under the
name browserslist matches on -- browserslist keys on the browser, not the engine, and an unnamed
Edge is an unconstrained one. The canary section above names three because three engines shipped
`toSorted`; this list names four because four browsers have to be told about it.

Stated rather than left to Vite's default, which is a baseline of somebody else's choosing and can
move under a major -- it was `chrome111, edge111, firefox114, safari16.4` when this was written,
which is above the canary for Firefox and would have had precisely the effect described above.

The site and the status page declare one, the same, through `@canmi/web/compat`, which holds the
canary, the lazy import and the reading of `browserslist` into esbuild's target, so the two cannot
drift. The site's API runs on workerd inside the site's Worker, and the CMS is opened in whatever browser
its author uses; neither meets an arbitrary browser.

**The floor binds every line a browser runs, the shared libraries' included.** `URL.canParse` is
Chrome 120, above the canary: `@canmi/hints` called it, a Chrome 99 reader of the status page
crashed on hydration, and on the site a Chrome 110 to 119 reader would have too, since the canary
passes there and loads nothing. An API newer than the floor is written around, not relied on.

### Tailwind's floor is higher and is not this one

Tailwind 4 requires Chrome 111, Safari 16.4 and **Firefox 128** -- it compiles to `@property` and
`color-mix()`, which is a hard requirement rather than a degradation.

That floor is deliberately not adopted here. A reader on Firefox 120 gets broken styling either
way; the choice is whether they also get broken scripts. Serving them working JavaScript on a
badly styled page is the better half of a bad situation, so the CSS floor stays where Tailwind
puts it and the JavaScript floor stays where the canary puts it.

## What was tried first, and why it is gone

A `mise run compat` task ran `babel-plugin-polyfill-corejs3` over the built client to report which
core-js modules the code needed, so the hand-written list could be kept honest. It worked, and it
answered a question worth abandoning rather than automating: once every stable polyfill loads
behind one check, there is no list for a report to be about.

Two findings from it are worth keeping, because both are traps to fall into again.

**Asking `core-js-compat` what a baseline lacks is the wrong question.** It answers with everything
the baseline lacks -- around seventy stable modules -- rather than what this code reaches for.
Computing the intersection needs a tool that reads call sites, and `usage-global` has no type
information, so a bare `.map()` is charged to `Iterator` as well as to `Array`.

**core-js's version numbers do not mean what they appear to mean.** They record the version from
which core-js considers a native implementation _fully spec-correct_, not the version that first
shipped the feature. Measured against features whose age is not in doubt:

```
es.json.stringify   {chrome: 114, firefox: 135, safari: 18.4}   ES5, 2009
es.array.push       {chrome: 122, firefox: 55,  safari: 16.0}   ES1
es.array.includes   {chrome: 53,  firefox: 102, safari: 27.0}   ES2016
```

Read as support data, that says `JSON.stringify` needs Chrome 114. It does not. Any floor derived
by taking a maximum over these numbers is meaningless, and one was derived that way before the
check above was run -- it claimed the bundle required Chrome 145.
