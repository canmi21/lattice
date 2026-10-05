import { dev } from '$app/env';
import { PUBLISHED } from '@monoflake/sdk/cache';
import { marksOf } from '@monoflake/sdk/symlink';
import { pickUrls } from '@monoflake/sdk';
import { APP_ICON_MARKS, APP_ICONS, type AppIcon } from '#lib/manifest.js';
import { site } from '#lib/site.js';
import type { RequestHandler } from './$types';

/**
 * The web app manifest, written per request so its icons are the objects their marks resolve to
 * now, as the head's are; from this origin, which a manifest's start address has to share. The
 * Apple touch icon is not one of them -- iOS reads its own link. See spec/architecture/manifest.md.
 */
export const prerender = false;

export const GET: RequestHandler = async ({ fetch }) => {
	const icons = await marksOf(pickUrls(dev).symlink, 'site', APP_ICON_MARKS, fetch);
	const manifest = {
		name: site.name,
		short_name: site.author.name,
		icons: Object.entries(APP_ICONS).flatMap(([mark, sizes]) => {
			const src = icons[mark as AppIcon];
			return src ? [{ src, sizes, type: 'image/png', purpose: 'maskable' }] : [];
		}),
		theme_color: '#ffffff',
		background_color: '#ffffff',
		display: 'browser',
	};
	return new Response(JSON.stringify(manifest), {
		headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': PUBLISHED },
	});
};
