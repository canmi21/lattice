import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { videoGroundScript } from './ground';

const STILL = 'data:image/webp;base64,UklGRqQAAABXRUJQ';
const CLIP = 'cd09df7945f22065fd0995f8f8207e55.mp4';

/** Enough of a document for a script that appends one `<style>` to `<head>`. */
function run(record: string | null) {
	const styles: { textContent: string }[] = [];
	const context = {
		sessionStorage: { getItem: (key: string) => (key === 'state' ? record : null) },
		document: {
			createElement: () => ({ textContent: '' }),
			head: { appendChild: (node: { textContent: string }) => void styles.push(node) },
		},
		JSON,
	};
	runInNewContext(videoGroundScript, context);
	return styles.map((s) => s.textContent).join('');
}

const record = (map: unknown) => JSON.stringify({ version: 2, 'video.at': map });

describe('the ground chosen before anything paints', () => {
	it('names the clip and carries its still', () => {
		expect(run(record({ [CLIP]: { at: 12, still: STILL } }))).toBe(
			`video[data-clip="${CLIP}"]{--clip-ground:url("${STILL}");--clip-hold:0}`,
		);
	});

	it('writes nothing at all when there is nothing to say', () => {
		expect(run(null)).toBe('');
		expect(run(record({}))).toBe('');
		// A position with no still is the ordinary case where the canvas was refused.
		expect(run(record({ [CLIP]: { at: 12 } }))).toBe('');
	});

	it('survives a record that is not one', () => {
		for (const junk of ['{oops', 'null', '[]', '"text"', record('nonsense'), record(null)]) {
			expect(run(junk)).toBe('');
		}
	});

	it('refuses a clip name that could close the selector', () => {
		// The record is same-origin and the reader's own, which is not the same as trusted: a name
		// that reaches the stylesheet unchecked is a name that can write rules of its own.
		const attack = `x"]{}body{display:none}video[data-clip="y`;
		expect(run(record({ [attack]: { at: 1, still: STILL } }))).toBe('');
	});

	it('refuses a still that is not a base64 image', () => {
		for (const bad of [
			'javascript:alert(1)',
			'https://example.com/x.png',
			`data:image/webp;base64,AA")}body{display:none}video{--x:url("`,
			'data:image/webp;base64,',
		]) {
			expect(run(record({ [CLIP]: { at: 1, still: bad } }))).toBe('');
		}
	});

	it('emits one rule per clip the tab remembers', () => {
		const other = 'aaaa1111bbbb2222cccc3333dddd4444.mp4';
		const out = run(record({ [CLIP]: { at: 1, still: STILL }, [other]: { at: 2, still: STILL } }));
		expect(out.match(/video\[data-clip=/g)).toHaveLength(2);
	});
});
