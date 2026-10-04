import { dev } from '$app/environment';
import { serveSymlink, symlinkOf } from '@canmi/symlink';
import { pickUrls } from '@canmi/urls';
import type { RequestHandler } from './$types';

// The sitemap's stylesheet, from this origin; see spec/architecture/robots.md.
export const GET: RequestHandler = () =>
	serveSymlink(symlinkOf(pickUrls(dev).symlink, 'status', 'sitemap.xsl'), 'text/xsl; charset=utf-8');
