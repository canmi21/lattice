/** The states a node's pages show, each as a word and the one tone it is shown in. */
import type { Liveness } from '../node.ts';
import type { Tone } from '../style.ts';

export const LIVENESS: Record<Liveness, { word: string; tone: Tone }> = {
	live: { word: 'Live', tone: 'good' },
	late: { word: 'Late', tone: 'warn' },
	gone: { word: 'Gone', tone: 'bad' },
};

/** An event's outcome as host names it; one host adds later reads as itself, quietly. */
export function outcome(word: string): { word: string; tone: Tone } {
	const known: Record<string, Tone> = {
		running: 'busy',
		succeeded: 'good',
		failed: 'bad',
		skipped: 'quiet',
	};
	return { word: capital(word), tone: known[word] ?? 'quiet' };
}

/** `rollback_with_data` as `Rollback with data`. */
export function capital(word: string): string {
	const spaced = word.replaceAll('_', ' ');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
