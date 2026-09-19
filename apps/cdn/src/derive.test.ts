import { storageKey } from '@canmi/store';
import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import app from './index';
import derive from './derive';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';
const BYTES = 'stored bytes for the derive tests';

const YEAR = 'public, max-age=31536000, immutable';
const MINUTES = 'public, max-age=300';

/**
 * The codecs cannot run here, so the conversion is stubbed and the routing is what is held.
 *
 * vitest.config.ts replaces every `.wasm` import with an empty object, which is what makes this
 * module loadable at all; a test that actually encoded would fail inside a codec initialised
 * from nothing rather than honestly. What these tests are about is which of the five rules a
 * request lands on, and that decision is made before a codec is reached.
 */
vi.mock('./transcode', async (importOriginal) => {
	const real = await importOriginal<typeof import('./transcode')>();
	return {
		...real,
		transcode: async () => new TextEncoder().encode('re-encoded').buffer,
	};
});

/** A bucket holding exactly the entries named, with a size that need not match the body. */
function bucketWith(held: Record<string, { body?: string; size?: number }>) {
	return {
		STORE: {
			head: async (key: string) => {
				const entry = held[key];
				return entry ? { size: entry.size ?? (entry.body ?? '').length } : null;
			},
			get: async (key: string) => {
				const entry = held[key];
				if (!entry) return null;
				return { body: new Response(entry.body ?? '').body, httpMetadata: {}, httpEtag: '"e"' };
			},
		},
	} as never;
}

/** The usual case: one stored object, holding the bytes above. */
function holding(extension: string) {
	return bucketWith({ [storageKey(CID, extension)]: { body: BYTES } });
}

describe('the source object comes first', () => {
	it('is 404 when nothing is stored under the id, which is temporary rather than wrong', async () => {
		const response = await derive.request(`/${CID}.avif.webp`, {}, bucketWith({}));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ status: 'error', message: 'not_found' });
	});

	// The redirect below is cheap and would still be a wrong answer: a client sent to an address
	// that answers 404 spends two round trips to learn nothing is there.
	it('is 404 even when the two extensions would have redirected', async () => {
		const response = await derive.request(`/${CID}.avif.avif`, {}, bucketWith({}));
		expect(response.status).toBe(404);
	});

	// A zip is refused on the size, and a size is what a head answers: the presence check and
	// the cap are one question asked once.
	it('is 404 without reading the object', async () => {
		const bucket = {
			STORE: {
				head: async () => null,
				get: async () => {
					throw new Error('the bucket must not be read when the head says nothing');
				},
			},
		} as never;
		expect((await derive.request(`/${CID}.avif.zip`, {}, bucket)).status).toBe(404);
	});
});

describe('two extensions that are the same', () => {
	it('redirects permanently to the object itself', async () => {
		const response = await derive.request(`/${CID}.avif.avif`, {}, holding('avif'));
		expect(response.status).toBe(301);
		expect(response.headers.get('Location')).toBe(`/object/${CID}.avif`);
	});
});

describe('an image format the worker can produce', () => {
	it('re-encodes a source it can decode', async () => {
		const response = await derive.request(`/${CID}.avif.webp`, {}, holding('avif'));
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/webp');
	});

	// The encoder that was deliberately absent from `/image`, where a caller asking for a
	// fallback already cannot read AVIF. Here the caller named the source, so it is reachable.
	it('encodes AVIF, which the image route does not offer', async () => {
		const response = await derive.request(`/${CID}.png.avif`, {}, holding('png'));
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/avif');
	});

	it('refuses a source nothing here decodes', async () => {
		const response = await derive.request(`/${CID}.mp4.webp`, {}, holding('mp4'));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ status: 'error', message: 'not_derivable' });
	});
});

describe('the object in an archive', () => {
	/**
	 * The archive, read back field by field.
	 *
	 * Stored entries, so the source bytes sit unaltered between the local header and the data
	 * descriptor -- which is what makes a round trip checkable without an unzipper.
	 */
	function unpack(archive: Uint8Array, nameLength: number, size: number) {
		const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
		const data = 30 + nameLength;
		return {
			localSignature: view.getUint32(0, true),
			name: new TextDecoder().decode(archive.subarray(30, data)),
			body: archive.subarray(data, data + size),
			descriptorSignature: view.getUint32(data + size, true),
			crc: view.getUint32(data + size + 4, true),
			storedSize: view.getUint32(data + size + 8, true),
			centralSignature: view.getUint32(data + size + 16, true),
			endSignature: view.getUint32(archive.length - 22, true),
		};
	}

	it('packages the single object under the name it has outside the archive', async () => {
		const response = await derive.request(`/${CID}.avif.zip`, {}, holding('avif'));
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/zip');

		const name = `${CID}.avif`;
		const archive = new Uint8Array(await response.arrayBuffer());
		const unpacked = unpack(archive, name.length, BYTES.length);

		expect(unpacked.localSignature).toBe(0x04034b50);
		expect(unpacked.name).toBe(name);
		expect(new TextDecoder().decode(unpacked.body)).toBe(BYTES);
		expect(unpacked.descriptorSignature).toBe(0x08074b50);
		expect(unpacked.centralSignature).toBe(0x02014b50);
		expect(unpacked.endSignature).toBe(0x06054b50);
		// Against node's own implementation rather than a second copy of this worker's.
		expect(unpacked.crc).toBe(crc32(BYTES));
		expect(unpacked.storedSize).toBe(BYTES.length);
		// The whole archive: header, bytes, descriptor, one central entry, and the end record.
		expect(archive.length).toBe(30 + name.length + BYTES.length + 16 + 46 + name.length + 22);
	});

	// A source that is not an image at all: packaging asks nothing of the bytes.
	it('packages a format no codec here reads', async () => {
		const response = await derive.request(`/${CID}.mp4.zip`, {}, holding('mp4'));
		expect(response.status).toBe(200);
	});

	it('refuses a source past the cap before a byte is read', async () => {
		const bucket = {
			STORE: {
				head: async () => ({ size: 60 * 1024 * 1024 }),
				get: async () => {
					throw new Error('the object must not be read once the size has refused it');
				},
			},
		} as never;
		const response = await derive.request(`/${CID}.mp4.zip`, {}, bucket);
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ status: 'error', message: 'too_large_to_package' });
	});
});

describe('anything else', () => {
	it('refuses a target nobody can produce', async () => {
		const response = await derive.request(`/${CID}.avif.exe`, {}, holding('avif'));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ status: 'error', message: 'not_derivable' });
	});

	it('refuses a name that is not exactly an id and two extensions', async () => {
		const bucket = holding('avif');
		const asked = async (name: string) => (await derive.request(`/${name}`, {}, bucket)).status;
		expect(await asked(`${CID}.avif`)).toBe(400);
		expect(await asked(`${CID}.avif.webp.png`)).toBe(400);
		expect(await asked(`${CID}..webp`)).toBe(400);
		expect(await asked('not-an-id.avif.webp')).toBe(400);
	});
});

/**
 * The rule these two routes keep and the middleware above them does not.
 *
 * A `3xx` from here is a fact about the address -- the two extensions were the same -- and can
 * no more change than the bytes can, so it earns the year rather than the five minutes the
 * floor gives a redirect. The literal strings are the point: a change to @canmi/cache's values
 * has to be seen rather than pass.
 */
describe('what a derived answer may be kept for', () => {
	it('keeps a 2xx for a year', async () => {
		const response = await derive.request(`/${CID}.avif.zip`, {}, holding('avif'));
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	it('keeps a 3xx for a year too, which is where this parts company', async () => {
		const response = await derive.request(`/${CID}.avif.avif`, {}, holding('avif'));
		expect(response.status).toBe(301);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	it('holds a refusal for five minutes', async () => {
		const missing = await derive.request(`/${CID}.avif.webp`, {}, bucketWith({}));
		expect(missing.status).toBe(404);
		expect(missing.headers.get('Cache-Control')).toBe(MINUTES);

		const malformed = await derive.request(`/${CID}.avif.exe`, {}, holding('avif'));
		expect(malformed.status).toBe(400);
		expect(malformed.headers.get('Cache-Control')).toBe(MINUTES);
	});
});

describe('the lookup is a call, never a request', () => {
	// A self-subrequest counts against the subrequest budget and invites a loop, and the
	// semantics are identical without it. Nothing here may reach the network at all.
	it('never fetches this host to find its own source', async () => {
		const fetching = vi.spyOn(globalThis, 'fetch');
		await derive.request(`/${CID}.avif.zip`, {}, holding('avif'));
		await derive.request(`/${CID}.avif.avif`, {}, holding('avif'));
		expect(fetching).not.toHaveBeenCalled();
		fetching.mockRestore();
	});
});

describe('the address middleware lets it through', () => {
	it('reaches the route rather than being refused for carrying two extensions', async () => {
		const response = await app.request(`/derive/${CID}.avif.avif`, {}, holding('avif'));
		expect(response.status).toBe(301);
	});
});
