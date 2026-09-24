/**
 * The editor as the page builds it, for tests: a window of its own, and a way to make one.
 */
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/core';
import type { MilkdownPlugin } from '@milkdown/ctx';
import { JSDOM } from 'jsdom';
import { extensions, presets } from './markdown.ts';

/**
 * A window for the editor alone. The file is not run under jsdom as a whole, because jsdom's own
 * `URL` replaces the one the site's compiler reads its configuration by.
 */
const { window } = new JSDOM();
const GLOBALS = [
	'document',
	'navigator',
	'MutationObserver',
	'getComputedStyle',
	'DOMParser',
] as const;
// Milkdown's plugin timers signal through the global event target with node's own `Event`, which
// jsdom's window refuses, so the global one is node's.
const events = new EventTarget();
Object.assign(globalThis, {
	window,
	addEventListener: events.addEventListener.bind(events),
	removeEventListener: events.removeEventListener.bind(events),
	dispatchEvent: events.dispatchEvent.bind(events),
	...Object.fromEntries(
		GLOBALS.filter((name) => !(name in globalThis)).map((name) => [name, window[name]]),
	),
});

/** An editor holding `markdown`, with this repository's syntax and any plugins given. */
export function makeEditor(markdown: string, plugins: MilkdownPlugin[] = []): Promise<Editor> {
	return Editor.make()
		.config((ctx) => {
			const root = document.createElement('div');
			document.body.append(root);
			ctx.set(rootCtx, root);
			ctx.set(defaultValueCtx, markdown);
		})
		.use(presets)
		.use(extensions)
		.use(plugins)
		.create();
}
