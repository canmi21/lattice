import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { pickUrls } from '@canmi/urls';
import type { RequestHandler } from './$types';

/**
 * The one icon a browser asks for without being told to.
 *
 * Every other mark is named in the head and can point anywhere; this one is fetched from the
 * origin whatever the markup says. The name is permanent and the alias layer is where it lives,
 * so this is a `301` -- what it currently means is that layer's to say, temporarily. See
 * spec/architecture/delivery.md.
 */
export const prerender = false;

export const GET: RequestHandler = () => {
	redirect(301, `${pickUrls(dev).alias}/favicon.ico`);
};
