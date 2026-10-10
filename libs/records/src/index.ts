/**
 * The two records the site, the CMS and the article renderer keep in the browser, declared as
 * data; `@canmi/kit/behavior/state` executes them. See spec/engagement.md for what each holds,
 * and the lib's spec/kit/state.md for the mechanism.
 */
import { record } from '@canmi/kit/behavior/state';

/** What is true of the person. Pair it with `localStorage`. */
export const reader = record('state', []);

/** What is true of this sitting. Pair it with `sessionStorage`. */
export const tab = record('state', [
	{
		/**
		 * 1 to 2: `video.at` went from a position to a position and a picture of it.
		 *
		 * The old shape would have expired on its own -- it only ever lives for one tab -- so this
		 * is not a step anybody needed. It is the step that proves the mechanism works before
		 * there is a record worth losing, which is the only time that can be checked cheaply.
		 */
		'video.at': (map) => {
			if (typeof map !== 'object' || map === null || Array.isArray(map)) return undefined;
			const carried: Record<string, unknown> = {};
			for (const [clip, at] of Object.entries(map)) {
				if (typeof at === 'number' && Number.isFinite(at) && at > 0) carried[clip] = { at };
			}
			return carried;
		},
	},
]);
