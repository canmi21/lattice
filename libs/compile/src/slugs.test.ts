import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { refuseBadSlugs, reservedNames, slugOf } from './slugs';

const ROUTES = fileURLToPath(new URL('../../../apps/site/src/routes', import.meta.url));

it('takes the identity off the end of a source path', () => {
	expect(slugOf('mirror/friends-come-in-phases.md')).toBe('friends-come-in-phases');
	expect(slugOf('deep/er/still-here.md')).toBe('still-here');
});

it('accepts the corpus as it stands', async () => {
	const reserved = await reservedNames(ROUTES);
	expect(() =>
		refuseBadSlugs(
			['mirror/friends-come-in-phases.md', 'architecture/compile-time-rendering.md'],
			reserved,
		),
	).not.toThrow();
});

/**
 * The hyphen is not decoration. A single word is reserved for the site's own router, so `/{name}`
 * can be answered without asking the corpus whether it meant an article -- which is what lets a
 * name with no hyphen be a 404 immediately.
 */
it('refuses a name a reader could not tell from a page', () => {
	expect(() => refuseBadSlugs(['mirror/notes.md'], new Set())).toThrow(/at least two/);
	expect(() => refuseBadSlugs(['mirror/notes.v2.md'], new Set())).toThrow(/hyphens/);
	expect(() => refuseBadSlugs(['mirror/Notes-Here.md'], new Set())).toThrow(/lowercase/);
});

// Two articles sharing a name resolve to whichever the lookup reaches first, silently. That is
// the failure this whole rule exists to make impossible.
it('refuses two articles with one identity, and says which two', () => {
	expect(() =>
		refuseBadSlugs(['mirror/less-is-more.md', 'milestone/less-is-more.md'], new Set()),
	).toThrow(/already the identity of mirror\/less-is-more\.md/);
});

// The site's router is asked first and always wins, so an article behind one of its names is an
// article nobody can reach.
it('refuses a name the router already answers for', async () => {
	const reserved = await reservedNames(ROUTES);
	expect(reserved.has('licenses')).toBe(true);
	// Parameterised segments are not names; `[...path]` is what articles are served by.
	expect([...reserved].some((name) => name.startsWith('['))).toBe(false);
	expect(() => refuseBadSlugs(['mirror/the-licenses.md'], new Set(['the-licenses']))).toThrow(
		/route this site already serves/,
	);
});

// One run, every reason: these are found together and fixing them one build at a time is a round
// trip each.
it('names every problem at once', () => {
	const thrown = (() => {
		try {
			refuseBadSlugs(['a/notes.md', 'b/one-two.md', 'c/one-two.md'], new Set());
		} catch (error) {
			return String(error);
		}
		return '';
	})();
	expect(thrown).toContain('a/notes.md');
	expect(thrown).toContain('c/one-two.md');
});
