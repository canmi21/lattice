import { dev } from '$app/environment';
import { UNCHANGING } from '@canmi/cache';
import { pickUrls } from '@canmi/urls';
import type { RequestHandler } from './$types';

/**
 * The one icon a browser asks for without being told to.
 *
 * Every other mark is named in the head and can point anywhere; this one is fetched from the
 * origin whatever the markup says. The name is permanent and the alias layer is where it lives,
 * so this is a `301` -- what it currently means is that layer's to say, briefly. See
 * spec/architecture/delivery.md.
 */
export const prerender = false;

/**
 * A response rather than `redirect()`, which throws and carries no headers of its own.
 *
 * The year is about this hop alone: where the name lives never changes, and what it stands for
 * is the far end's answer, held for as long as that layer says. Every host answers this the same
 * way, so a crawler reaching any of them finds one permanent name.
 */
export const GET: RequestHandler = () =>
	new Response(null, {
		status: 301,
		headers: {
			Location: `${pickUrls(dev).alias}/symlink/favicon.ico`,
			'Cache-Control': UNCHANGING,
		},
	});
