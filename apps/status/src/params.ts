import { defineParams } from '@sveltejs/kit/params';

/** This page's marks, as `data/record/symlinks.json` registers them under `status`. */
export const MARKS = [
	'favicon.ico',
	'favicon.svg',
	'favicon-96x96.png',
	'favicon-512x512.png',
	'apple-touch-icon.png',
] as const;

const matchMark = (param: string): param is (typeof MARKS)[number] =>
	(MARKS as readonly string[]).includes(param);

export const params = defineParams({
	mark: (param) => (matchMark(param) ? param : undefined),
});
