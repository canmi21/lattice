# The desktop client, kept as a reference

This was the Tauri window: a Rust adapter over the same operations the command line calls, and a
Milkdown editor in `client/`. It is here because the lessons are in it -- what the window needed
from the application layer, how the editor was wired, which capabilities Tauri had to be given --
and because that is cheaper to read than to rediscover.

**Nothing here builds.** There is no `Cargo.toml` and no package: the crate left the workspace and
the frontend left the build. Reading it is the only supported use; a file that has to run again is
one somebody moves back out deliberately.

The icons and everything under `gen/` went rather than came: both are generated, and the marks
they were generated from are in `data/source/brand`.

When none of this is worth reading any more, delete the directory. Git has it, and the commit that
moved it here says where it came from.
