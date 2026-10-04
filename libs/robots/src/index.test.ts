import { URLS } from '@canmi/urls';
import { describe, expect, it } from 'vitest';
import {
	ownRoot,
	peerEntries,
	robotsFor,
	robotsTxt,
	robotsTxtBase,
	rootEntry,
	sitemapXml,
} from './index';

describe('robotsTxt', () => {
	it('returns the shared base without site additions', () => {
		expect(robotsTxt()).toBe(`${robotsTxtBase.join('\n\n')}\n`);
	});

	it('appends site-specific rules and sitemap entries', () => {
		expect(
			robotsTxt({
				disallow: ['/@/', '/private/'],
				sitemap: `${URLS.apps.production.site}/sitemap.xml`,
			}),
		).toBe(`${robotsTxtBase.join('\n\n')}
Disallow: /@/
Disallow: /private/

Sitemap: ${URLS.apps.production.site}/sitemap.xml
`);
	});

	it('accepts several sitemaps', () => {
		expect(robotsTxt({ sitemap: ['/a.xml', '/b.xml'] })).toBe(`${robotsTxtBase.join('\n\n')}

Sitemap: /a.xml
Sitemap: /b.xml
`);
	});

	it('treats an empty sitemap as absent', () => {
		expect(robotsTxt({ sitemap: null })).toBe(`${robotsTxtBase.join('\n\n')}\n`);
	});
});

describe('robotsFor', () => {
	it('says how page content may be used, in both spellings, where a service serves pages', () => {
		for (const service of ['site', 'status'] as const) {
			const text = robotsFor(service);
			expect(text).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=yes');
			expect(text).toContain('Content-Usage: search=y, ai-use=y, train-ai=y');
		}
	});

	it('leaves a host that says no signals to rules alone', () => {
		expect(robotsTxt({ disallow: ['/'], agent: 'api' })).not.toContain('Content-');
	});

	it("keeps the site's namespace out and names its sitemap", () => {
		const text = robotsFor('site');
		expect(text).toContain('Disallow: /@/');
		expect(text).toContain(`Sitemap: ${URLS.apps.production.site}/sitemap.xml`);
	});
});

describe('the terms and the sitemaps', () => {
	it("opens a page host's file with Cloudflare's terms, and only a page host's", () => {
		expect(robotsFor('site')).toContain('# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS');
		expect(robotsTxt({ disallow: [''], agent: 'cdn' })).not.toContain('content signals');
	});

	it('names the status sitemap beside its signals', () => {
		expect(robotsFor('status')).toContain(`Sitemap: ${URLS.internal.status.canonical}/sitemap.xml`);
	});

	it('styles every sitemap from its own origin', () => {
		expect(sitemapXml([{ loc: 'x:a' }])).toContain(
			'<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
		);
	});
});

it("ends every host's file with its own word to an agent and where the code is", () => {
	const files = [
		...(['site', 'status'] as const).map(robotsFor),
		...(['cdn', 'aka', 'api'] as const).map((agent) => robotsTxt({ disallow: ['/'], agent })),
	];
	for (const text of files) expect(text).toContain(`# ${URLS.source}.git`);
	const notes = files.map((text) => text.split('Note to AI agents')[1]?.split('.git')[0]);
	expect(new Set(notes).size).toBe(files.length);
});

it("names every page host's sitemap, its own first", () => {
	const sitemaps = (text: string) =>
		text.split('\n').filter((line) => line.startsWith('Sitemap: '));
	expect(sitemaps(robotsFor('site'))).toEqual([
		`Sitemap: ${URLS.apps.production.site}/sitemap.xml`,
		`Sitemap: ${URLS.internal.status.canonical}/sitemap.xml`,
	]);
	expect(sitemaps(robotsFor('status'))).toEqual([
		`Sitemap: ${URLS.internal.status.canonical}/sitemap.xml`,
		`Sitemap: ${URLS.apps.production.site}/sitemap.xml`,
	]);
	expect(sitemaps(robotsTxt({ disallow: [''], agent: 'cdn' }))).toEqual([]);
});

it('lists every other page host by its root alone, as that host declares it', () => {
	expect(peerEntries('site')).toEqual([
		{ loc: `${URLS.internal.status.canonical}/`, changefreq: 'always', priority: '0.5' },
	]);
	expect(peerEntries('status')).toEqual([
		{ loc: `${URLS.apps.production.site}/`, changefreq: 'daily', priority: '1.0' },
	]);
	expect(rootEntry('site')).not.toHaveProperty('lastmod');
});

it("gives a host's own root the list's frequency and the host's own weight", () => {
	expect(ownRoot('status', '1.0')).toEqual({
		loc: `${URLS.internal.status.canonical}/`,
		changefreq: 'always',
		priority: '1.0',
	});
});
