import { dev } from '$app/environment';
import { serveSymlink, symlinkOf } from '@canmi/symlink';
import { pickUrls } from '@canmi/urls';
import type { RequestHandler } from './$types';

/**
 * The sitemap's stylesheet, from this origin because a browser applies one from nowhere else; the
 * bytes are the one shared object the alias layer names. See spec/architecture/robots.md.
 */
export const prerender = false;

export const GET: RequestHandler = () =>
	serveSymlink(symlinkOf(pickUrls(dev).symlink, 'site', 'sitemap.xsl'), 'text/xsl; charset=utf-8');
