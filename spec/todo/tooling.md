# Deferred: the toolchain and the record

Findings about the things that describe the repository rather than the things that run: ignore lists, commit messages, and the gates over both.

The rules over an entry are the index's; see [todo.md](todo.md).

## `.gitattributes` is a list only a long file is held to

The paths marked `linguist-generated=true` keep a forge reading this repository as what somebody
wrote, and since the workspace's line check began measuring every file, they are also what it
passes over -- the workspace's `spec/architecture/repos.md`, "Machine output is
marked, so the language statistics describe the repository". A generated file over the hard limit
that nobody marked now fails the gate, which is how `data/record/metadata.json`, marked under a
path it had left, was found. One under the limit still goes on being counted and nothing fails.

Deciding the rest costs a definition: a gate that answers "is this machine output" without a
person needs the set of paths the generators write, a second list kept by hand. Worth doing only
alongside a reason to enumerate those outputs anyway.

## Over the line limit, and deferred

The workspace's line check measures every file, prose and data included, and these are over its
hard limit of a thousand lines. Each is marked `lines=deferred` in `.gitattributes`, so the check
reports it and passes, and each is split after the migration into layers rather than during it.

- `data/record/media.yaml` and `tags.yaml`, the curated records, which A2 moves into the database
  -- see [milestones.md](milestones.md); they leave rather than split.
- `spec/todo/css.md`, the CSS backlog, split by area.
- six of the translation sidecars, `contents/**/*.i18n.yaml`, the longest at 9329 lines, whose shape waits
  on the segment layer's redesign -- see [cms.md](cms.md), "The segment layer waits for its
  redesign".

A deferral whose file falls under the limit is reported too, so the mark does not outlive it.

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
