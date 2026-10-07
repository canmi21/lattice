/**
 * The moment the reader is pointing at, shared by every chart under one `sync.svelte`, so one
 * crosshair crosses them all. Keyed by time in seconds: each chart snaps it to its own nearest
 * point, and a chart outside any `sync.svelte` keeps one of its own.
 */
import { getContext, setContext } from 'svelte';

export class Hover {
	at: number | undefined = $state();
}

/** Exported for a test to hand a chart a moment already pointed at. */
export const HOVER = Symbol('chart hover');

export function shareHover(): Hover {
	return setContext(HOVER, new Hover());
}

export function hoverOf(): Hover {
	return getContext<Hover | undefined>(HOVER) ?? new Hover();
}
