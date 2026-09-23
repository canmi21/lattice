/**
 * What a bundler supplies and a type checker does not.
 *
 * A stylesheet imported for its side effect is the bundler's instruction, not a module with a
 * shape; the site gets this declaration from SvelteKit's generated ambient types and a library
 * has none, so it states it. See spec/architecture/workspace.md.
 */
declare module '*.css';
