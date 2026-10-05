import { defineParams } from '@sveltejs/kit/params';

/** The marks, as `data/record/symlinks.json` registers them: the status page's, for now. */
export const MARKS = [
	'favicon.ico',
	'favicon.svg',
	'favicon-96x96.png',
	'favicon-512x512.png',
	'apple-touch-icon.png',
] as const;

/** The scope the marks are registered under. */
export const MARK_SCOPE = 'status';

const matchMark = (param: string): param is (typeof MARKS)[number] =>
	(MARKS as readonly string[]).includes(param);

export const params = defineParams({
	mark: (param) => (matchMark(param) ? param : undefined),
});
