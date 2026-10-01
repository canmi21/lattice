# Anchors: every block a reader can be pointed at, named for what it is

**A heading's anchor is its slug; every other block's is its kind and its number among that kind**,
in the order the article has them: `#diagram-2` is the article's second diagram, `#code-1` its first
code block. Mechanical, not chosen -- nobody names a block -- but read at a glance, and inserting a
code block moves only the code blocks after it.

| Block                  | Anchor    |
| ---------------------- | --------- |
| `code`                 | `code`    |
| `image`                | `image`   |
| `video`                | `video`   |
| `svgCanvas`, `mermaid` | `diagram` |
| `quadrant`             | `chart`   |
| `tokei`                | `stats`   |
| `cargo`                | `crate`   |
| `github`               | `repo`    |
| `twitter`              | `tweet`   |
| `linkcard`             | `link`    |
| `article`              | `card`    |

Prose, headings, footnotes and placeholders take none. A name is what a reader sees, so the two ways
of drawing a diagram are one kind and counted together. The table is `BLOCK_ANCHORS` in
`@canmi/artifacts/anchors`, which every consumer reads: the page, the compiler, the hash landing.

**Worked out wherever blocks are, never stored** -- see [artifacts.md](artifacts.md), "What is stored is what cannot be worked out". The page numbers its blocks as it draws them, and
the compiler numbers them the same way as it writes the markdown, both with `blockAnchors`. Storing
the anchor would change the published shape, which asks for a new `ARTIFACT_VERSION`, which a
Worker deployed ahead of its corpus refuses; derived, it costs the corpus nothing and is live the
moment the code is. A translated view has the source's blocks in the source's order, so `#code-2`
names the same block in every language.

## A heading may not take a block's name

`{kind}-{n}` -- a kind from the table and a whole number from 1 -- is reserved, and a heading whose
slug has that form fails the build, saying which and asking for an explicit `{#id}`. Only that form:
`code-review` or `image-credits` is a heading's to take. The reservation is as narrow as the names
the table makes, so it costs headings almost nothing and catches every collision.

## Every anchor behaves the same

**A block shows the heading's `#` when hovered**, at its top left, from the one `anchor-button`
both use; clicking it puts the anchor in the address. **A load with any hash takes the one landing**
the headings already had: held until the page is drawn, from the top, then a smooth scroll to the
target. A block anchor that names nothing -- an old link after blocks moved -- lands on the nearest
of its kind, the lower on a tie, and the address is corrected to it; one of a kind the article has
none of lands nowhere.

## The agent view says where each block is

Every block's markdown ends with `> On the page: {article}#{anchor}`, so an agent reading the
article's view can point a person at the block itself. See [markdown.md](markdown.md).
