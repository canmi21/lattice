import { Hono } from 'hono';
import {
	isUnsatisfiable,
	read,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
} from '@canmi/store';
import { WEEKLY } from './cache';
import { cardKeys } from './key';
import { failure } from './respond';

/**
 * Serving OpenGraph cards, one view per language.
 *
 * The address is the page's own path with `?lang=` on it -- `/opengraph/development/x.png?lang=ja`
 * -- and the view is a directory in the bucket, kept apart from the URL for the reason
 * spec/architecture/data.md gives for every key here.
 *
 * A card is named by its slug rather than a hash, so unlike the licence texts these cannot be
 * immutable. The lifetime is a week, which is also how long X holds a card.
 */
const opengraph = new Hono<{ Bindings: Bindings }>();

opengraph.get('/*', async (c) => {
	const url = new URL(c.req.url);
	const keys = cardKeys(url.pathname, url.searchParams.get('lang'));
	if (!keys) {
		return failure(c, 404, 'not_found');
	}

	// The view asked for, then the source view -- in that order and not in parallel. A page
	// whose card has not been rendered in its language should still advertise one, and a card
	// in the wrong language says more about the page than a blank rectangle does; but reading
	// both at once would spend a second bucket round trip on every request that hits the first.
	const [asked, fallback] = keys;
	const range = c.req.header('Range');
	const found =
		(asked && (await read(c.env, asked, range))) ||
		(fallback && (await read(c.env, fallback, range)));
	if (!found) {
		return failure(c, 404, 'not_found');
	}
	if (isUnsatisfiable(found)) {
		return unsatisfiableResponse(found.total);
	}

	// `?lang=` is part of the URL, so caches already key on it; nothing needs a `Vary` here.
	const response = toResponse(found);
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', WEEKLY);
	return new Response(response.body, { status: response.status, headers });
});

export default opengraph;
