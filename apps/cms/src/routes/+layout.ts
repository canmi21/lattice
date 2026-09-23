/**
 * Rendered in the browser and nowhere else.
 *
 * Every route here reads `local`, which is a process on this machine: there is no crawler to
 * render for, no cache to fill, and a server-side pass would only be a second place the same
 * fetch could fail. See spec/todo/milestones.md, group B.
 */
export const ssr = false;
export const prerender = false;
