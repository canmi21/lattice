import { dev } from '$app/env';
import { marksOf } from '@monoflake/symlink';
import { pickUrls } from '@monoflake/sdk';
import { MARKS } from '../params';
import type { LayoutServerLoad } from './$types';

// The path's spelling is the entry point's to settle, by the one rule every server shares, before
// any route reads it; SvelteKit's own trailing-slash redirect would answer first and by another.
// See spec/architecture/delivery.md, "Every address has one spelling".
export const trailingSlash = 'ignore';

/**
 * The year the footer signs with, from the server's clock at render and never the browser's
 * (spec/architecture/identity.md); and the marks, as the objects the alias layer resolves them to
 * at render (spec/architecture/delivery.md, "A page follows the name for the browser").
 */
export const load: LayoutServerLoad = async () => ({
	year: new Date().getUTCFullYear(),
	marks: await marksOf(pickUrls(dev).symlink, 'status', MARKS),
});
