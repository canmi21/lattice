/**
 * Packaging one stored object into a zip.
 *
 * Stored entries, never deflated: everything this bucket keeps is already-compressed media, so
 * compressing it again buys nothing and costs an isolate that has 128 MB for its heap and its
 * WebAssembly together. Streaming is the same argument -- buffering a 50 MB source and a 50 MB
 * archive at once is 100 MB of that budget for an archive that is the source plus 120 bytes.
 *
 * So `zipOne` holds nothing and answers a plain request; `zipWhole` is for the one question a
 * stream cannot answer -- a range -- and holds one buffer rather than two. See ./derive.ts.
 *
 * The format is the small, old half of APPNOTE.TXT: one local header, the bytes, a data
 * descriptor, a one-entry central directory. No zip64, which the source cap makes unreachable.
 */

const SIGNATURE = {
	local: 0x04034b50,
	descriptor: 0x08074b50,
	central: 0x02014b50,
	end: 0x06054b50,
} as const;

/** Bit 3: the sizes and the checksum follow the data, because a stream cannot go back. */
const SIZES_FOLLOW = 0x0008;

/** Stored, not deflated. */
const NO_COMPRESSION = 0;

/** What an unzipper needs to read this; 2.0 is the floor for anything past the 1989 format. */
const VERSION = 20;

/**
 * 1980-01-01, where DOS timestamps begin, and the conventional "no time recorded".
 *
 * Only the fallback now. The entry carries the object's upload time instead -- see `Entry` --
 * and this is what is left when the store kept no date, which is development alone.
 */
const NO_TIME = 0;
const DOS_EPOCH = 0x0021;

/** The last year a DOS date can express: seven bits from 1980. */
const LAST_YEAR = 2107;

/** A DOS timestamp: two little-endian fields, seconds at two-second resolution. */
type Stamp = { time: number; date: number };

/**
 * The object's upload time as DOS spells it, in UTC.
 *
 * DOS records no zone, so a reader's unzip prints whatever is written here as local time. UTC is
 * the only frame this worker has, and naming it in the archive is not possible either way.
 */
function stampFor(uploaded: Date | null): Stamp {
	if (!uploaded) return { time: NO_TIME, date: DOS_EPOCH };
	const year = uploaded.getUTCFullYear();
	if (year < 1980 || year > LAST_YEAR) return { time: NO_TIME, date: DOS_EPOCH };
	// Seconds are halved, which is all the resolution the field has.
	const seconds = uploaded.getUTCSeconds() >> 1;
	const time = (uploaded.getUTCHours() << 11) | (uploaded.getUTCMinutes() << 5) | seconds;
	const date = ((year - 1980) << 9) | ((uploaded.getUTCMonth() + 1) << 5) | uploaded.getUTCDate();
	return { time, date };
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let value = n;
		for (let bit = 0; bit < 8; bit += 1) {
			value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[n] = value >>> 0;
	}
	return table;
})();

/** Carry a running CRC-32 across chunks, so the checksum costs one pass and no buffer. */
function crc32(running: number, chunk: Uint8Array): number {
	let value = ~running;
	for (const byte of chunk) {
		// Masked to a byte, so the table always answers; the checker cannot see that.
		value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
	}
	return ~value >>> 0;
}

/** A little-endian record, written field by field in the order the format declares them. */
function record(length: number): { bytes: Uint8Array; put: Put } {
	const bytes = new Uint8Array(length);
	const view = new DataView(bytes.buffer);
	let at = 0;
	const put: Put = {
		u16(value) {
			view.setUint16(at, value, true);
			at += 2;
		},
		u32(value) {
			view.setUint32(at, value, true);
			at += 4;
		},
		raw(value) {
			bytes.set(value, at);
			at += value.length;
		},
	};
	return { bytes, put };
}

type Put = {
	u16: (value: number) => void;
	u32: (value: number) => void;
	raw: (value: Uint8Array) => void;
};

function localHeader(name: Uint8Array, stamp: Stamp): Uint8Array {
	const { bytes, put } = record(30 + name.length);
	put.u32(SIGNATURE.local);
	put.u16(VERSION);
	put.u16(SIZES_FOLLOW);
	put.u16(NO_COMPRESSION);
	put.u16(stamp.time);
	put.u16(stamp.date);
	// Zero here and real in the descriptor below, which is what bit 3 means.
	put.u32(0);
	put.u32(0);
	put.u32(0);
	put.u16(name.length);
	put.u16(0);
	put.raw(name);
	return bytes;
}

function dataDescriptor(crc: number, size: number): Uint8Array {
	const { bytes, put } = record(16);
	put.u32(SIGNATURE.descriptor);
	put.u32(crc);
	// Stored, so the compressed and uncompressed sizes are the same number twice.
	put.u32(size);
	put.u32(size);
	return bytes;
}

function centralEntry(name: Uint8Array, crc: number, size: number, stamp: Stamp): Uint8Array {
	const { bytes, put } = record(46 + name.length);
	put.u32(SIGNATURE.central);
	put.u16(VERSION);
	put.u16(VERSION);
	put.u16(SIZES_FOLLOW);
	put.u16(NO_COMPRESSION);
	put.u16(stamp.time);
	put.u16(stamp.date);
	put.u32(crc);
	put.u32(size);
	put.u32(size);
	put.u16(name.length);
	// No extra field, no comment, disk zero, no attributes, and the one entry starts at zero.
	put.u16(0);
	put.u16(0);
	put.u16(0);
	put.u16(0);
	put.u32(0);
	put.u32(0);
	put.raw(name);
	return bytes;
}

function endOfCentralDirectory(nameLength: number, size: number): Uint8Array {
	const { bytes, put } = record(22);
	put.u32(SIGNATURE.end);
	put.u16(0);
	put.u16(0);
	put.u16(1);
	put.u16(1);
	put.u32(46 + nameLength);
	// Where the central directory begins: the local header, the bytes, and the descriptor.
	put.u32(30 + nameLength + size + 16);
	put.u16(0);
	return bytes;
}

/**
 * The one entry an archive from here holds.
 *
 * `size` is the length the store reported rather than a count taken here: the refusal to package
 * something too large happens before either function below is called, and asking twice would be
 * two answers to one question. `uploaded` comes from the same head, and null is a store that
 * kept no date -- development alone, where the epoch above is the honest answer.
 */
export type Entry = { name: string; size: number; uploaded: Date | null };

/** The name as the format carries it: ASCII by the time it arrives, so no UTF-8 flag is set. */
function encode(entry: Entry): Uint8Array {
	return new TextEncoder().encode(entry.name);
}

/** How long the archive around one entry is: the four records, and the bytes between them. */
function archiveLength(nameLength: number, size: number): number {
	return 30 + nameLength + size + 16 + 46 + nameLength + 22;
}

/**
 * One object, as an archive, produced as the bytes go past.
 *
 * Nothing is held: the source is pulled from the bucket only as fast as the client takes it, so
 * the 50 MB cap the caller enforces costs the isolate nothing beyond the chunk in flight.
 */
export function zipOne(entry: Entry, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	const name = encode(entry);
	const stamp = stampFor(entry.uploaded);
	let crc = 0;

	// A transform rather than a source, so the archive inherits the reader's backpressure: the
	// object is pulled from the bucket only as fast as the client takes it.
	const archive = new TransformStream<Uint8Array, Uint8Array>({
		start(controller) {
			controller.enqueue(localHeader(name, stamp));
		},
		transform(chunk, controller) {
			crc = crc32(crc, chunk);
			controller.enqueue(chunk);
		},
		flush(controller) {
			controller.enqueue(dataDescriptor(crc, entry.size));
			controller.enqueue(centralEntry(name, crc, entry.size, stamp));
			controller.enqueue(endOfCentralDirectory(name.length, entry.size));
		},
	});

	return body.pipeThrough(archive);
}

/**
 * The same archive, whole, for a caller that has to answer a range out of it.
 *
 * One buffer and not two: the source is copied straight into the place it occupies in the
 * archive, so this holds the object plus 120 bytes rather than the object and the archive both.
 * There is no streaming version of this question -- the CRC is written after the data and covers
 * all of it, so even a range naming the first byte has to read the last one.
 */
export async function zipWhole(
	entry: Entry,
	body: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
	const name = encode(entry);
	const stamp = stampFor(entry.uploaded);
	const archive = new Uint8Array(archiveLength(name.length, entry.size));

	const header = localHeader(name, stamp);
	archive.set(header, 0);
	let at = header.length;
	let crc = 0;
	const reader = body.getReader();
	// Sequential because a stream is: the next chunk does not exist until this one is taken, and
	// the alternative is buffering the whole body to hand it over, which is what this avoids.
	for (;;) {
		// eslint-disable-next-line no-await-in-loop
		const { done, value } = await reader.read();
		if (done) break;
		crc = crc32(crc, value);
		archive.set(value, at);
		at += value.length;
	}

	// Placed from the declared size rather than from what was read, so the trailer agrees with
	// the length already written into the descriptor even if the store handed back fewer bytes.
	const trailer = header.length + entry.size;
	archive.set(dataDescriptor(crc, entry.size), trailer);
	archive.set(centralEntry(name, crc, entry.size, stamp), trailer + 16);
	archive.set(endOfCentralDirectory(name.length, entry.size), trailer + 16 + 46 + name.length);
	return archive;
}
