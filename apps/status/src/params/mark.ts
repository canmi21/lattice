import type { ParamMatcher } from '@sveltejs/kit';

/** This page's marks, as `data/record/marks.json` registers them under `status`. */
export const MARKS = [
	'favicon.ico',
	'favicon.svg',
	'favicon-96x96.png',
	'favicon-512x512.png',
	'apple-touch-icon.png',
] as const;

export const match = ((param: string): param is (typeof MARKS)[number] =>
	(MARKS as readonly string[]).includes(param)) satisfies ParamMatcher;
