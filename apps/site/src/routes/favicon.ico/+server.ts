import { dev } from '$app/env';
import { followSymlink, symlinkOf } from '@monoflake/sdk/symlink';
import { pickUrls } from '@monoflake/sdk';
import type { RequestHandler } from './$types';

/**
 * The one icon a browser asks for without being told to, followed for it: what the name means is
 * the alias layer's to say. See platform's spec/architecture/delivery.md, "A page follows the name
 * for the browser".
 */
export const prerender = false;

export const GET: RequestHandler = () =>
	followSymlink(symlinkOf(pickUrls(dev).symlink, 'site', 'favicon.ico'));
