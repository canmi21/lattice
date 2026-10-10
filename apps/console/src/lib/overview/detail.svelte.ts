/**
 * What the timeline's hover reads beside its colors -- the span's minutes and its runs' steps --
 * which the first paint does not carry: asked once the page is idle, at once where the pointer
 * comes to the card first, again for each span picked after, and the minutes each minute, since a
 * minute is what a relay adds. A span asked and not yet answered keeps the last. See
 * spec/architecture/console.md, "A component asks for its facet".
 */
import { onMount } from 'svelte';
import { ask } from '../facets.ts';
import type { View } from '../scope/scope.ts';
import type { History } from '../wire.ts';
import { type Trace, unpacked } from './moving.ts';
import type { Span } from './timeline.ts';

/** How often the span's minutes are asked again, in milliseconds. */
const EVERY = 60_000;

export class Detail {
	/** The span read, and what of it. */
	current = $state.raw<{ key: Span; history?: History; steps: Trace[] } | undefined>();
	/** Whether anything has wanted it yet; until then nothing is asked. */
	#wanted = $state(false);
	#asking: Span | undefined;

	constructor(readonly of: () => { back: Span; view: View }) {
		$effect(() => {
			const { back } = this.of();
			if (this.#wanted && this.current?.key !== back) void this.#read(back, 'auto');
		});
		onMount(() => {
			// Read ahead of the pointer, behind whatever else the page is still doing; Safari has no
			// idle callback, and a timeout after load stands in.
			const ahead = () => this.want('low');
			let cancel: () => void;
			if ('requestIdleCallback' in window) {
				const idle = requestIdleCallback(ahead, { timeout: 2000 });
				cancel = () => cancelIdleCallback(idle);
			} else {
				const timer = setTimeout(ahead, 200);
				cancel = () => clearTimeout(timer);
			}
			const timer = setInterval(() => {
				if (this.current && !document.hidden) void this.#minutes(this.current.key);
			}, EVERY);
			return () => {
				cancel();
				clearInterval(timer);
			};
		});
	}

	/** Asks for the span drawn now, unless held or on its way; `high` where it is wanted now. */
	want(priority: RequestPriority): void {
		this.#wanted = true;
		const { back } = this.of();
		if (this.current?.key !== back) void this.#read(back, priority);
	}

	async #read(key: Span, priority: RequestPriority): Promise<void> {
		if (this.#asking === key) return;
		this.#asking = key;
		const { view } = this.of();
		const [history, steps] = await Promise.all([
			ask('history', { span: key }, { priority }),
			ask('steps', { span: key, view }, { priority }),
		]);
		if (this.#asking === key) this.#asking = undefined;
		// Kept only while it is still the span drawn, and only whole.
		if (steps && this.of().back === key) this.current = { key, history, steps: unpacked(steps) };
	}

	async #minutes(key: Span): Promise<void> {
		const history = await ask('history', { span: key }, { priority: 'low' });
		if (history && this.current?.key === key) this.current = { ...this.current, history };
	}
}
