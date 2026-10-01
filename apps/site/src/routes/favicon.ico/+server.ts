import { dev } from '$app/environment';
import { followSymlink } from '@canmi/symlink';
import { pickUrls } from '@canmi/urls';
import type { RequestHandler } from './$types';

/**
 * The one icon a browser asks for without being told to, followed for it: what the name means is
 * the alias layer's to say. See spec/architecture/delivery.md, "A page follows the name for the
 * browser".
 */
export const prerender = false;

export const GET: RequestHandler = () => followSymlink(`${pickUrls(dev).alias}/symlink/site/favicon.ico`);
