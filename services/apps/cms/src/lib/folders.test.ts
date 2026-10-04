/**
 * The article tree's folders, kept across a reload. See folders.ts.
 */
import { describe, expect, it } from 'vitest';
import { recallFolders, rememberFolders } from './folders.ts';

function store(): Storage {
	const held = new Map<string, string>();
	return {
		getItem: (key) => held.get(key) ?? null,
		setItem: (key, value) => void held.set(key, value),
	} as Storage;
}

describe('folders', () => {
	it('opens everything when nothing was kept', () => {
		expect(recallFolders(store())).toEqual({ open: true, closed: [] });
	});

	it('gives back what was left', () => {
		const storage = store();
		rememberFolders(storage, { open: false, closed: ['b', 'a'] }, ['a', 'b', 'c']);
		expect(recallFolders(storage)).toEqual({ open: false, closed: ['a', 'b'] });
	});

	it('drops a category the tree no longer has', () => {
		const storage = store();
		rememberFolders(storage, { open: true, closed: ['gone', 'kept'] }, ['kept']);
		expect(recallFolders(storage).closed).toEqual(['kept']);
	});

	it('keeps the rest of the record', () => {
		const storage = store();
		storage.setItem('state', JSON.stringify({ version: 1, 'cms.sidebar.folded': true }));
		rememberFolders(storage, { open: true, closed: ['a'] }, ['a']);
		expect(JSON.parse(storage.getItem('state')!)['cms.sidebar.folded']).toBe(true);
	});
});
