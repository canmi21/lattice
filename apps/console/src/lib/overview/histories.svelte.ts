/**
 * The history the overview's timeline draws: the span the page was drawn with, as the server read
 * it, then asked again of the relays through `/history` when the reader picks another span, and
 * each minute, since a minute is what a relay adds. A span asked and not yet answered keeps the
 * last drawn. See spec/console/overview.md, "A line is any of three things, or the worst of them".
 */
import { onMount } from 'svelte';
import type { History } from '../wire.ts';
import { asked } from './history.ts';
import type { Span } from './timeline.ts';

/** How often the span drawn is asked again, in milliseconds. */
const EVERY = 60_000;

export class Histories {
	/** The history drawn, and the span it is of. */
	current = $state.raw<{ key: Span; history: History } | undefined>();

	constructor(
		first: () => { key: Span; history: History | Promise<History | undefined> | undefined },
	) {
		$effect(() => {
			const { key, history } = first();
			if (history instanceof Promise) void history.then((read) => read && this.#take(key, read));
			else if (history) this.#take(key, history);
		});
		onMount(() => {
			const timer = setInterval(() => {
				if (this.current && !document.hidden) void this.ask(this.current.key);
			}, EVERY);
			return () => clearInterval(timer);
		});
	}

	#take(key: Span, history: History) {
		this.current = { key, history };
	}

	/** `key`'s span asked of the relays; kept where it answers, the last left where it does not. */
	async ask(key: Span): Promise<void> {
		const { span, slot } = asked(key);
		try {
			const answer = await fetch(`/history?span=${span}&slot=${slot}`);
			if (!answer.ok) return;
			const body = (await answer.json()) as { data?: History };
			if (body.data) this.#take(key, body.data);
		} catch {
			// No relay answered; the span drawn stays until the next minute asks again.
		}
	}
}
