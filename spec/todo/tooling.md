# Deferred: the toolchain and the record

Findings about the things that describe the repository rather than the things that run: ignore lists, commit messages, and the gates over both.

The rules over an entry are the index's; see [todo.md](todo.md).

## `.gitattributes` is a list nothing keeps complete

Two paths are marked `linguist-generated=true` so a forge reads this repository as what somebody
wrote rather than as what its tools emit -- [architecture/workspace.md](../architecture/workspace.md),
"Machine output is marked, so the language statistics describe the repository". A third path that
becomes machine output and is not added goes on being counted, and nothing fails.

The evidence that this drifts is the file itself. It carried ten lines of reasoning citing
`spec/architecture.md`, a file that does not exist, and the citation survived because
`mise run refs` reads code under `apps/` and `libs/` and the documents, and `.gitattributes` is
neither.

Deciding it costs a definition. A gate has to answer "is this machine output" without a person,
and the only honest proxy is the set of paths this repository's own generators write -- which is
a second list, kept by hand, with the same failure. Worth doing only alongside a reason to
enumerate those outputs anyway.

## A commit said less than it carried, because the paths were a directory

`72f00943`, "fix: the twenty-six frame declarations leave the visual layer", also carries six
`:global()` selectors narrowed to their attribute form in `article.svelte` and `body.svelte`, and
the matching class writes removed from `compile.ts` and its test. Those belong to the anchor
migration's second step, not to the utilities move, and the message names only the second thing.

**The cause is the commit, not the workers.** It was taken as `jj commit apps/site/src ...` while
two workers were writing in that tree, and a path list takes everything under the path rather
than the change the message describes. The workspace's `spec/toolchain.md` already says a path
list silently omits what it does not name; this is the same mechanism running the other way, and
reading `jj st` in full before committing is what catches both.

Nothing is wrong in the tree -- both changes were verified and both are wanted. What is wrong is
that the log no longer separates them, so a bisect over the anchor migration lands on a commit
about utilities.

## A commit subject says sixteen rules where twelve were moved

`d662919f`, "refactor: sixteen ordinary scoped rules become utilities and surfaces", is wrong in
its subject and right in its body. Twelve rules were acted on, not sixteen; the body's figures --
twenty-six declarations, eighteen StyleX keys, thirteen markup tokens -- are machine-checked and
stand. The census reads 33 ordinary rules before and 24 after, because three of the twelve were
split rather than moved: `github`'s and `twitter`'s `.corner` still hold `right`/`bottom` and
`dial`'s `.face` still holds `place-items`, all three unruled by the enumeration.

The arithmetic that makes 33 whole, since a later reader will try: 12 moved, 13 keyframe-bound,
1 `.focus-input` held by its own section, and 7 held by rules already written down -- the code
block's three by migration.md's set rule, tokei's two by this file, `support`'s `.reveal-mask` by
that same set rule, and `footnotes`' `.notes-fold:not(...)` whose only declaration is an unruled
`mask-image`.

**Declarations are the honest unit here**, because a rule that splits is neither moved nor kept.
