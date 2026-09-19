/**
 * Packaging one stored object into a zip, without ever holding it.
 *
 * Stored entries, never deflated: everything this bucket keeps is already-compressed media, so
 * compressing it again buys nothing and costs an isolate that has 128 MB for its heap and its
 * WebAssembly together. Streaming is the same argument -- buffering a 50 MB source and a 50 MB
 * archive at once is 100 MB of that budget for an archive that is the source plus 120 bytes.
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
 * 1980-01-01, which is where DOS timestamps begin and the conventional "no time recorded".
 *
 * A real clock would make the archive a different file every second, and the answer is served
 * `immutable` on the promise that it is not -- the bytes have to be a function of the input.
 */
const NO_TIME = 0;
const DOS_EPOCH = 0x0021;

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

function localHeader(name: Uint8Array): Uint8Array {
	const { bytes, put } = record(30 + name.length);
	put.u32(SIGNATURE.local);
	put.u16(VERSION);
	put.u16(SIZES_FOLLOW);
	put.u16(NO_COMPRESSION);
	put.u16(NO_TIME);
	put.u16(DOS_EPOCH);
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

function centralEntry(name: Uint8Array, crc: number, size: number): Uint8Array {
	const { bytes, put } = record(46 + name.length);
	put.u32(SIGNATURE.central);
	put.u16(VERSION);
	put.u16(VERSION);
	put.u16(SIZES_FOLLOW);
	put.u16(NO_COMPRESSION);
	put.u16(NO_TIME);
	put.u16(DOS_EPOCH);
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
 * One object, as an archive, produced as the bytes go past.
 *
 * `size` is the length the store reported rather than a count taken here, because the caller has
 * already had to know it: the refusal to package something too large happens before this is
 * called, and asking twice would be two answers to one question.
 */
export function zipOne(
	name: string,
	size: number,
	body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
	// The name is a content id and an extension, both of which are ASCII by the time they reach
	// here, so the flag declaring a UTF-8 name would describe nothing.
	const encoded = new TextEncoder().encode(name);
	let crc = 0;

	// A transform rather than a source, so the archive inherits the reader's backpressure: the
	// object is pulled from the bucket only as fast as the client takes it.
	const archive = new TransformStream<Uint8Array, Uint8Array>({
		start(controller) {
			controller.enqueue(localHeader(encoded));
		},
		transform(chunk, controller) {
			crc = crc32(crc, chunk);
			controller.enqueue(chunk);
		},
		flush(controller) {
			controller.enqueue(dataDescriptor(crc, size));
			controller.enqueue(centralEntry(encoded, crc, size));
			controller.enqueue(endOfCentralDirectory(encoded.length, size));
		},
	});

	return body.pipeThrough(archive);
}
