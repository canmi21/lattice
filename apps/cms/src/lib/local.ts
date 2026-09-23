/**
 * Where `local` answers, for the two things on this side that talk to it directly: the dev
 * server's proxy, which the browser goes through, and the server-side fetch of a page being
 * rendered, which does not. One constant so the two cannot disagree.
 *
 * Read from the environment rather than restated, because the Rust half binds the same number --
 * see spec/toolchain.md, "Dev ports are pinned".
 */
export const LOCAL_ORIGIN = `http://localhost:${process.env.LOCAL_PORT ?? 26521}`;
