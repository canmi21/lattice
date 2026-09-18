import { describe, expect, it } from 'vitest';
import app from './index';
import { correctionFor } from './address';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';

/** A bucket that holds nothing, so what is being tested is the address rather than the object. */
const empty = { STORE: { get: async () => null, head: async () => null } } as never;

// A literal rather than an interpolation: the reference check reads URLs out of source and a
// template one reads as an undeclared address. The host is never resolved -- only the path matters.
const HOST = 'https://cdn.example';

async function ask(path: string): Promise<Response> {
	return app.fetch(new Request(HOST + path), empty);
}

/**
 * The two codes say different things and the difference is worth keeping.
 *
 * `400` is the shape: nothing could ever live at this address. `404` is the bucket: the shape is
 * right and the object is not there, which means it was never uploaded or has been swept -- a real
 * and temporary fact, and one worth telling apart from a typo.
 */
describe('what this host can express', () => {
	it('refuses a single segment that is not a name it mounts', async () => {
		const res = await ask('/anything');
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ status: 'error', message: 'not_an_address' });
	});

	it('mounts the two names that are not objects', async () => {
		expect((await ask('/robots.txt')).status).toBe(200);
		// A permanent name, pointing at the layer that owns it.
		expect((await ask('/favicon.ico')).status).toBe(301);
	});

	it('refuses a type it does not know', async () => {
		expect((await ask(`/nonsense/${CID}.json`)).status).toBe(400);
	});

	it('refuses a name that is not a content id', async () => {
		const res = await ask('/content/not-a-hash.json');
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ status: 'error', message: 'not_a_content_id' });
	});

	// Deeper than a type and a name is not an address either: the id is one segment and the fan-out
	// it is stored under is the bucket's business, never a link's.
	it('refuses an address carrying the storage layout', async () => {
		expect((await ask(`/image/44/b6/${CID}.avif`)).status).toBe(400);
	});

	it('answers 404 for a well-formed address the bucket does not hold', async () => {
		const res = await ask(`/content/${CID}.json`);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ status: 'error', message: 'not_found' });
	});
});

/**
 * The id is what identifies an object, so a wrong type still finds it -- which is why it is
 * corrected rather than served. An address that resolves under any type has no canonical spelling.
 */
describe('a type that cannot carry the extension', () => {
	it('is corrected to the one that can', async () => {
		const res = await ask(`/video/${CID}.avif`);
		expect(res.status).toBe(301);
		expect(res.headers.get('Location')).toBe(`/image/${CID}.avif`);
	});

	it('leaves json alone, because two types carry it', () => {
		expect(correctionFor('content', 'json')).toBeUndefined();
		expect(correctionFor('page', 'json')).toBeUndefined();
	});

	it('refuses an extension no type carries', async () => {
		expect((await ask(`/image/${CID}.exe`)).status).toBe(400);
	});
});
