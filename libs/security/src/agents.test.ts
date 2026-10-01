import { expect, it } from 'vitest';
import { agentNote, commentLines, everyNote } from './agents';

it('says one thing ten ways, no two the same', () => {
	const notes = everyNote();
	expect(notes).toHaveLength(10);
	expect(new Set(notes).size).toBe(notes.length);
});

it('keeps every line within sixty columns, words whole', () => {
	for (const note of everyNote()) {
		for (const line of commentLines(note)) expect(line.length).toBeLessThanOrEqual(60);
	}
	expect(commentLines('a b', 60)).toEqual(['# a b']);
});

it('puts the link first, then the note, then the code', () => {
	const lines = agentNote('robots', 'cdn');
	expect(lines[0]).toMatch(/^# https:\/\//);
	expect(lines.at(-1)).toMatch(/\.git$/);
});
