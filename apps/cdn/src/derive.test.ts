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

/** When the object in `holding` below was uploaded, which is what the archive has to carry. */
const UPLOADED = new Date(Date.UTC(2026, 2, 14, 15, 9, 26));

/** A bucket holding exactly the entries named, with a size that need not match the body. */
function bucketWith(held: Record<string, { body?: string; size?: number; uploaded?: Date }>) {
	return {
		STORE: {
			head: async (key: string) => {
				const entry = held[key];
				if (!entry) return null;
				return { size: entry.size ?? (entry.body ?? '').length, uploaded: entry.uploaded };
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
	return bucketWith({ [storageKey(CID, extension)]: { body: BYTES, uploaded: UPLOADED } });
}

/** The whole archive for `holding`, read once so a range can be checked against it. */
async function wholeArchive() {
	const response = await derive.request(`/${CID}.avif.zip`, {}, holding('avif'));
	return new Uint8Array(await response.arrayBuffer());
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

/**
 * One format is one extension, and the correction sits on the target because that is the only
 * side a reader writes. `.jpg` is JPEG spelled for an eight-character filename limit that
 * outlived the system imposing it; carried as a second format it would fragment the cache and
 * the validators over identical bytes.
 */
describe('the short spelling of JPEG', () => {
	// Asked of the mounted worker rather than of the route, because the lifetime is the half
	// that matters here and the rule that stamps it lives above the group.
	it('answers a `jpg` target with the canonical spelling of the same address', async () => {
		const response = await app.request(`/derive/${CID}.avif.jpg`, {}, holding('avif'));
		expect(response.status).toBe(301);
		expect(response.headers.get('Location')).toBe(`/derive/${CID}.avif.jpeg`);
		// A function of the address rather than a fact about now: these two spellings will
		// always be one, so the hop is paid once and a browser never asks again.
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	/**
	 * The one that would rot silently, which is why it is written down.
	 *
	 * A source is looked up rather than corrected. `apps/cms/src/extension.rs` names every JPEG
	 * this repository writes `jpeg`, so `{cid}.jpg` is a key the bucket cannot hold and the
	 * ordinary miss is the whole answer. Normalising here too would serve the jpeg's bytes under
	 * a name that was never stored, and nothing would report it.
	 */
	it('leaves a `jpg` source alone, so it is the plain 404 a missing object is', async () => {
		const response = await app.request(`/derive/${CID}.jpg.webp`, {}, holding('jpeg'));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ status: 'error', message: 'not_found' });
		// Five minutes, because a 404 on a hashed address is a fact about the bucket rather than
		// about the address -- the same life every other miss on this host takes.
		expect(response.headers.get('Cache-Control')).toBe(MINUTES);
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

describe('the archive says when the bytes arrived', () => {
	/** The DOS fields the format writes, from whichever of the two records is passed in. */
	function stamp(archive: Uint8Array, at: number) {
		const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
		return { time: view.getUint16(at + 10, true), date: view.getUint16(at + 12, true) };
	}

	// 2026-03-14 15:09:26 UTC, as DOS spells it: the hour, the minute and half the seconds in
	// one field, and the years since 1980, the month and the day in the other.
	const TIME = (15 << 11) | (9 << 5) | (26 >> 1);
	const DATE = ((2026 - 1980) << 9) | (3 << 5) | 14;

	it('carries the upload time of the object rather than the 1980 epoch', async () => {
		const archive = await wholeArchive();
		expect(stamp(archive, 0)).toEqual({ time: TIME, date: DATE });
	});

	it('writes the same stamp into the central directory, which is what unzip -l reads', async () => {
		const archive = await wholeArchive();
		const central = 30 + `${CID}.avif`.length + BYTES.length + 16;
		// Two fields further along than the local header, so the offsets are not the same.
		expect(stamp(archive, central + 2)).toEqual({ time: TIME, date: DATE });
	});

	it('falls back to the epoch where the store kept no date', async () => {
		const bucket = bucketWith({ [storageKey(CID, 'avif')]: { body: BYTES } });
		const response = await derive.request(`/${CID}.avif.zip`, {}, bucket);
		const archive = new Uint8Array(await response.arrayBuffer());
		expect(stamp(archive, 0)).toEqual({ time: 0, date: 0x0021 });
	});
});

/**
 * A range is answered out of the finished artifact, never out of a partial derivation.
 *
 * Zipping or transcoding a slice would hand back bytes that belong to no archive and no image,
 * and a client asking for the middle of a file cannot tell that from the bytes it wanted. So the
 * whole thing is produced and then cut, which is why the ranged path buffers and the plain one
 * still streams.
 */
describe('a range over a derived artifact', () => {
	it('tells a client it may ask, on a whole answer of either kind', async () => {
		const packaged = await derive.request(`/${CID}.avif.zip`, {}, holding('avif'));
		expect(packaged.status).toBe(200);
		expect(packaged.headers.get('Accept-Ranges')).toBe('bytes');

		const image = await derive.request(`/${CID}.avif.webp`, {}, holding('avif'));
		expect(image.status).toBe(200);
		expect(image.headers.get('Accept-Ranges')).toBe('bytes');
	});

	it('serves the bytes of the archive a client asked for, as 206', async () => {
		const archive = await wholeArchive();
		const response = await derive.request(
			`/${CID}.avif.zip`,
			{ headers: { Range: 'bytes=10-41' } },
			holding('avif'),
		);
		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe(`bytes 10-41/${archive.length}`);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(archive.subarray(10, 42));
	});

	it('serves the tail, where a reader looks for the directory', async () => {
		const archive = await wholeArchive();
		const response = await derive.request(
			`/${CID}.avif.zip`,
			{ headers: { Range: 'bytes=-22' } },
			holding('avif'),
		);
		expect(response.status).toBe(206);
		const from = archive.length - 22;
		expect(response.headers.get('Content-Range')).toBe(
			`bytes ${from}-${archive.length - 1}/${archive.length}`,
		);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(archive.subarray(from));
	});

	it('serves the bytes of a transcode a client asked for, as 206', async () => {
		const whole = new TextEncoder().encode('re-encoded');
		const response = await derive.request(
			`/${CID}.avif.webp`,
			{ headers: { Range: 'bytes=3-6' } },
			holding('avif'),
		);
		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Type')).toBe('image/webp');
		expect(response.headers.get('Content-Range')).toBe(`bytes 3-6/${whole.length}`);
		expect(await response.text()).toBe('enco');
	});

	// Not 404. The artifact was produced and the question was wrong, and the size is what lets
	// the client ask again -- a 404 would send it looking for something it had already found.
	it('answers 416 for a range past the end, and says how long the archive is', async () => {
		const archive = await wholeArchive();
		const response = await derive.request(
			`/${CID}.avif.zip`,
			{ headers: { Range: 'bytes=99999-' } },
			holding('avif'),
		);
		expect(response.status).toBe(416);
		expect(response.headers.get('Content-Range')).toBe(`bytes */${archive.length}`);
	});

	it('answers 416 for a range past the end of a transcode too', async () => {
		const response = await derive.request(
			`/${CID}.avif.webp`,
			{ headers: { Range: 'bytes=99999-' } },
			holding('avif'),
		);
		expect(response.status).toBe(416);
		expect(response.headers.get('Content-Range')).toBe('bytes */10');
	});

	// The cap is halved for a range because that path holds the archive and then a copy of the
	// slice, where the streaming one holds neither. A source between the two is served whole
	// and refused a range, and the refusal says which of the two caps it hit -- otherwise a
	// client is told an object it could have had whole is too large to package.
	it('refuses to seek into an archive it would have streamed, and says so', async () => {
		const bucket = bucketWith({ [storageKey(CID, 'mp4')]: { size: 40 * 1024 * 1024 } });
		const whole = await derive.request(`/${CID}.mp4.zip`, {}, bucket);
		expect(whole.status).toBe(200);

		const sought = await derive.request(
			`/${CID}.mp4.zip`,
			{ headers: { Range: 'bytes=0-15' } },
			bucket,
		);
		expect(sought.status).toBe(413);
		expect(await sought.json()).toEqual({ status: 'error', message: 'too_large_to_seek' });
	});

	// Past the streaming cap, where the plain request would have been refused too: the range is
	// not what the answer turns on, so it is the other message.
	it('keeps the other message for a source no request could package', async () => {
		const bucket = bucketWith({ [storageKey(CID, 'mp4')]: { size: 60 * 1024 * 1024 } });
		const sought = await derive.request(
			`/${CID}.mp4.zip`,
			{ headers: { Range: 'bytes=0-15' } },
			bucket,
		);
		expect(sought.status).toBe(413);
		expect(await sought.json()).toEqual({ status: 'error', message: 'too_large_to_package' });
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
 * What the one rule says about an address carrying a hash and two extensions.
 *
 * A `3xx` from here is a fact about the address -- the two extensions were the same -- and can
 * no more change than the bytes can, so it earns the year a redirect elsewhere does not. The
 * literal strings are the point: a change to @canmi/cache's values has to be seen rather than
 * pass.
 */
describe('what a derived answer may be kept for', () => {
	it('keeps a 2xx for a year', async () => {
		const response = await app.request(`/derive/${CID}.avif.zip`, {}, holding('avif'));
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	it('keeps a 3xx for a year too, which is where this parts company', async () => {
		const response = await app.request(`/derive/${CID}.avif.avif`, {}, holding('avif'));
		expect(response.status).toBe(301);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	// A 206 is a 2xx, and the bytes behind it are as settled as the whole answer they came from.
	it('keeps a 206 for a year, which is the half a status check is easy to lose', async () => {
		const response = await app.request(
			`/derive/${CID}.avif.zip`,
			{ headers: { Range: 'bytes=0-15' } },
			holding('avif'),
		);
		expect(response.status).toBe(206);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	it('holds a refusal for five minutes', async () => {
		const missing = await app.request(`/derive/${CID}.avif.webp`, {}, bucketWith({}));
		expect(missing.status).toBe(404);
		expect(missing.headers.get('Cache-Control')).toBe(MINUTES);

		const malformed = await app.request(`/derive/${CID}.avif.exe`, {}, holding('avif'));
		expect(malformed.status).toBe(400);
		expect(malformed.headers.get('Cache-Control')).toBe(MINUTES);

		const unsatisfiable = await app.request(
			`/derive/${CID}.avif.zip`,
			{ headers: { Range: 'bytes=99999-' } },
			holding('avif'),
		);
		expect(unsatisfiable.status).toBe(416);
		expect(unsatisfiable.headers.get('Cache-Control')).toBe(MINUTES);
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

describe('the group as the worker mounts it', () => {
	it('reaches the route rather than falling into the catch-all', async () => {
		const response = await app.request(`/derive/${CID}.avif.avif`, {}, holding('avif'));
		expect(response.status).toBe(301);
	});
});
