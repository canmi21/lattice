import { dev } from '$app/env';
import { PUBLISHED } from '@monoflake/sdk/cache';
import { marksOf } from '@monoflake/sdk/symlink';
import { pickUrls } from '@monoflake/sdk';
import { hostOf } from '#lib/hosts.js';
import { MARK_SCOPE, MARKS } from '../params';
import type { LayoutServerLoad } from './$types';

// The path's spelling is the entry point's to settle, before any route reads it. See platform's
// spec/architecture/delivery.md, "Every address has one spelling".
export const trailingSlash = 'ignore';

/**
 * Which host was asked, the year the footer signs with, and the marks as the alias layer resolves
 * them at render. Rendered at the edge on every request and kept by `Cache-Control`.
 */
export const load: LayoutServerLoad = async ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': PUBLISHED });
	return {
		host: hostOf(url.hostname),
		year: new Date().getUTCFullYear(),
		marks: await marksOf(pickUrls(dev).symlink, MARK_SCOPE, MARKS),
	};
};
