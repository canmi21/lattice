import { pageUrls, URLS } from '@monoflake/sdk';
import { describe, expect, it } from 'vitest';
import { hints, scriptPolicy } from './index';

const origin = (url: string) => new URL(url).origin;
const PROJECT = 'https://project.example';

// Checked by the compiler and never run.
const refused = () => [
	// @ts-expect-error -- not an entry of `fonts`
	hints({ fonts: ['icons'] }, { dev: false }),
	// @ts-expect-error -- a supplied entry has no address of its own to list
	hints({ data: ['status'] }, { dev: false }),
	// @ts-expect-error -- our own hosts have their addresses; a level is all they take
	hints({ ours: { cdn: PROJECT } }, { dev: false }),
	// @ts-expect-error -- not a group
	hints({ images: ['cdn'] }, { dev: false }),
];

describe('hints', () => {
	it('writes each level as its rel, in the catalog order rather than the declaration order', () => {
		const links = hints(
			{
				analytics: ['openpanel', 'umami'],
				jsdelivr: { files: 'connect' },
				fonts: ['files', 'stylesheets'],
			},
			{ dev: false },
		);
		expect(links).toEqual([
			{ rel: 'preconnect', href: URLS.external.googleFonts.css },
			{ rel: 'preconnect', href: URLS.external.googleFonts.static, crossorigin: 'anonymous' },
			{ rel: 'preconnect', href: origin(URLS.external.github.cdn), crossorigin: 'anonymous' },
			{ rel: 'dns-prefetch', href: origin(URLS.external.umami) },
			{ rel: 'dns-prefetch', href: URLS.external.openpanel },
		]);
	});

	it('names only what is declared, never the rest of a group', () => {
		expect(hints({ fonts: ['stylesheets'] }, { dev: false })).toHaveLength(1);
		expect(hints({ fonts: [] }, { dev: false })).toEqual([]);
	});

	it('keeps crossorigin off a lookup, where it has no connection to match', () => {
		expect(hints({ jsdelivr: ['files'] }, { dev: false })).toEqual([
			{ rel: 'dns-prefetch', href: origin(URLS.external.github.cdn) },
		]);
	});

	it('asks the mode for our own hosts, and leaves a development proxy path as a path', () => {
		for (const dev of [false, true]) {
			const { cdn, alias } = pageUrls(dev);
			expect(hints({ ours: ['cdn', 'alias'] }, { dev }).map((l) => l.href)).toEqual([cdn, alias]);
		}
		expect(pageUrls(true).cdn.startsWith('/')).toBe(true);
	});

	it('takes a supplied address at the entry level, or at one the app moves it to', () => {
		expect(hints({ data: { status: `${PROJECT}/` } }, { dev: false })).toEqual([
			{ rel: 'preconnect', href: PROJECT, crossorigin: 'anonymous' },
		]);
		const moved = hints({ data: { status: { href: PROJECT, level: 'resolve' } } }, { dev: false });
		expect(moved).toEqual([{ rel: 'dns-prefetch', href: PROJECT }]);
	});

	it('refuses, in the type, what the catalog does not hold', () => {
		expect(refused).toBeTypeOf('function');
	});
});

describe('scriptPolicy', () => {
	it('loads the analytics loader deferred and at low priority', () => {
		expect(scriptPolicy('analytics', 'umami')).toEqual({ defer: true, fetchpriority: 'low' });
		// @ts-expect-error -- nothing loads a script from the reporting host
		expect(() => scriptPolicy('analytics', 'openpanel')).toThrow();
	});
});
