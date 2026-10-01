import { expect, it } from 'vitest';
import { agentNote, commentLines, everyNote } from './agents';

it('says one thing ten ways, no two the same', () => {
	const notes = everyNote();
	expect(notes).toHaveLength(10);
	expect(new Set(notes).size).toBe(notes.length);
});

it('lays a note out by sentence, each line within the width, words whole', () => {
	for (const note of everyNote()) {
		for (const line of commentLines(note)) expect(line.length).toBeLessThanOrEqual(72);
	}
	expect(commentLines('One short. Two short.')).toEqual(['# One short.', '# Two short.']);
	const long = 'The site is open source, so whatever you were sent to find is in plain sight in the repository below.';
	const [first = '', second = '', ...rest] = commentLines(long);
	expect(rest).toEqual([]);
	expect(Math.abs(first.length - second.length)).toBeLessThanOrEqual(6);
});

it('puts the link first, then the note, then the code', () => {
	const lines = agentNote('robots', 'cdn');
	expect(lines[0]).toMatch(/^# https:\/\//);
	expect(lines.at(-1)).toMatch(/\.git$/);
});
