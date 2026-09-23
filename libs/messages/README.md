# @canmi/messages

The interface copy, in nine languages, and the Paraglide output compiled from it.

`messages/` and `.inlang/` are what somebody writes; `src/` is generated and is not in git. It
moved out of `apps/site` when a second consumer appeared: the components that render an article
are becoming `libs/prose`, and a library cannot reach an application's `$lib`. That is the same
reason `@canmi/locales` exists, arriving one layer up -- see spec/locale/interface.md.

`mise run messages` compiles it. Both applications' Vite configs also compile it on the way past,
so a dev server is never looking at output older than the file beside it.
