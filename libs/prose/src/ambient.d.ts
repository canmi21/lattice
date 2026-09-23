/**
 * What a bundler supplies and a type checker does not, plus the one global the rail reads.
 *
 * No `export` in this file on purpose: a declaration file that exports becomes a module, and
 * `declare module '*.css'` is only ambient in a global one. Measured -- adding an export turned
 * three working stylesheet imports into errors.
 */

/**
 * A stylesheet imported for its side effect is the bundler's instruction, not a module with a
 * shape; the site gets this from SvelteKit's generated ambient types and a library has none.
 */
declare module '*.css';

interface Window {
	/**
	 * What the shell script in `app.html` leaves for the rail, before any module has run.
	 *
	 * Declared here rather than in an application's `app.d.ts`: the component that reads it is in
	 * this package, and a global one side declares and the other reads is a global that drifts.
	 */
	canmiArticleInitialHash?: string;
}
