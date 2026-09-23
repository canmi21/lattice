/**
 * Rendered on the server, then taken over in the browser.
 *
 * Every route reads `local`, so what it shows depends on a process on this machine -- which is
 * also true of the server rendering it, through `hooks.server.ts`. What is rendered there is the
 * frame and every value a load returns: the sidebar, the article list, the fields of a draft. The
 * rich-text editor is the one part that exists only in the browser, and it mounts into a region
 * the server leaves empty. See spec/architecture/local.md.
 *
 * Not prerendered: nothing here is the same twice.
 */
export const prerender = false;
