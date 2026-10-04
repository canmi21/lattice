import { expect, it } from 'vitest';
import { agentNote, everyNote } from './agents';

it('says one thing ten ways, no two the same', () => {
	const notes = everyNote().map((lines) => lines.join(' '));
	expect(notes).toHaveLength(10);
	expect(new Set(notes).size).toBe(notes.length);
});

it('keeps every line within the width, and no line a lone word', () => {
	for (const note of everyNote()) {
		for (const line of note) {
			expect(`# ${line}`.length).toBeLessThanOrEqual(72);
			expect(line.split(' ').length, line).toBeGreaterThan(1);
		}
	}
});

it('puts the link first, then the note, then the code', () => {
	const lines = agentNote('robots', 'cdn');
	expect(lines[0]).toMatch(/^# https:\/\//);
	expect(lines.at(-1)).toMatch(/\.git$/);
});
