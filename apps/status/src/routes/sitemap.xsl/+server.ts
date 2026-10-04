import { dev } from '$app/env';
import { serveSymlink, symlinkOf } from '@monoflake/sdk/symlink';
import { pickUrls } from '@monoflake/sdk';
import type { RequestHandler } from './$types';

// The sitemap's stylesheet, from this origin; see spec/architecture/robots.md.
export const GET: RequestHandler = () =>
	serveSymlink(
		symlinkOf(pickUrls(dev).symlink, 'status', 'sitemap.xsl'),
		'text/xsl; charset=utf-8',
	);
