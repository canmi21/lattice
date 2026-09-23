import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARTIFACT_VERSION, type PublishedPage } from '@canmi/artifacts';
import { buildPages } from '@canmi/compile/articles';
import { homepageContent } from './content';

const ROOT = new URL('../../../../../', import.meta.url);

describe('standalone page locale views', () => {
	it('keeps the bio in English while localising the writing heading', async () => {
		const { pages } = await buildPages({
			contents: fileURLToPath(new URL('contents', ROOT)),
			messages: fileURLToPath(new URL('apps/site/messages', ROOT)),
			segments: fileURLToPath(new URL('data/build/segments.json', ROOT)),
		});
		const homepage = pages.find((page) => page.path === 'homepage');
		expect(homepage).toBeDefined();
		if (!homepage) throw new Error('missing homepage');

		// What publish.ts writes for the Japanese view: a page carries no locale of its own, so
		// this is the same object every other locale names.
		const published: PublishedPage = {
			version: ARTIFACT_VERSION,
			slug: homepage.path,
			...homepage.views.ja,
		};

		const japanese = homepageContent(published, 'ja');
		expect(JSON.stringify(japanese.bio)).toContain('I build things.');
		expect(JSON.stringify(japanese.bio)).not.toContain('私はものを作ります。');
		expect(japanese.writing).toBe('記事');
	});
});
