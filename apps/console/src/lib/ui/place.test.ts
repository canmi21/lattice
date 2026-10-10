import { describe, expect, it } from 'vitest';
import { holdScript, keepPlace, placeOf, placeScript } from './place.ts';

/** A `sessionStorage` as much as the record needs. */
function storage() {
	const held = new Map<string, string>();
	return {
		getItem: (key: string) => held.get(key) ?? null,
		setItem: (key: string, value: string) => void held.set(key, value),
	};
}

/** Both scripts run at `path`: where the main area was left, and whether it was held. */
function ran(store: ReturnType<typeof storage>, path: string) {
	const main = { scrollTop: undefined as number | undefined };
	const marks = new Set<string>();
	const root = {
		setAttribute: (name: string) => void marks.add(name),
		removeAttribute: (name: string) => void marks.delete(name),
	};
	const document = {
		documentElement: root,
		getElementById: (id: string) => (id === 'content' ? main : null),
	};
	const run = (script: string) =>
		new Function('sessionStorage', 'location', 'document', script)(
			store,
			{ pathname: path },
			document,
		);
	run(holdScript);
	const held = marks.has('data-placing');
	run(placeScript);
	return { top: main.scrollTop, held, shown: !marks.has('data-placing') };
}

describe('the place script', () => {
	it('reads the offset `placeOf` reads, for the path it is on', () => {
		const store = storage();
		keepPlace(store, '/deployments', { top: 700, height: 1994 });
		expect(placeOf(store, '/deployments')?.top).toBe(700);
		expect(ran(store, '/deployments')).toEqual({ top: 700, held: true, shown: true });
		expect(ran(store, '/')).toEqual({ top: undefined, held: false, shown: true });
	});

	it('leaves the page alone, and shown, where nothing it can read is kept', () => {
		expect(ran(storage(), '/')).toEqual({ top: undefined, held: false, shown: true });
		const broken = storage();
		broken.setItem('state', '{not json');
		expect(ran(broken, '/')).toEqual({ top: undefined, held: false, shown: true });
	});
});
