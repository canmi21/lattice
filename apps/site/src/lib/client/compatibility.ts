/**
 * One canary, and the whole of core-js behind it.
 *
 * Why this check, why `toSorted`, why one check and not a list, why `stable` and not `es` or
 * `actual` -- see spec/compat.md, "The API floor: one canary, and all of core-js behind it".
 */
export async function prepareBrowserRuntime(): Promise<void> {
	if (typeof Array.prototype.toSorted === 'function') return;
	await import('core-js/stable');
}
