import { URLS } from '@canmi/urls';
import { describe, expect, it } from 'vitest';
import { robotsFor, robotsTxt, robotsTxtBase } from './index';

describe('robotsTxt', () => {
	it('returns the shared base without site additions', () => {
		expect(robotsTxt()).toBe(`${robotsTxtBase.join('\n')}\n`);
	});

	it('appends site-specific rules and sitemap entries', () => {
		expect(
			robotsTxt({
				disallow: ['/@/', '/private/'],
				sitemap: `${URLS.apps.production.site}/sitemap.xml`,
			}),
		).toBe(`${robotsTxtBase.join('\n')}
Disallow: /@/
Disallow: /private/

Sitemap: ${URLS.apps.production.site}/sitemap.xml
`);
	});

	it('accepts several sitemaps', () => {
		expect(robotsTxt({ sitemap: ['/a.xml', '/b.xml'] })).toBe(`${robotsTxtBase.join('\n')}

Sitemap: /a.xml
Sitemap: /b.xml
`);
	});

	it('treats an empty sitemap as absent', () => {
		expect(robotsTxt({ sitemap: null })).toBe(`${robotsTxtBase.join('\n')}\n`);
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

	it('leaves bytes and APIs to rules alone', () => {
		for (const service of ['cdn', 'aka', 'api'] as const) {
			expect(robotsFor(service)).not.toContain('Content-');
		}
	});

	it("keeps the site's namespace out and names its sitemap", () => {
		const text = robotsFor('site');
		expect(text).toContain('Disallow: /@/');
		expect(text).toContain(`Sitemap: ${URLS.apps.production.site}/sitemap.xml`);
	});

	it("lets into the API only the scope a site's page asks", () => {
		expect(robotsFor('api')).toBe(`${robotsTxtBase.join('\n')}
Allow: /site/
Disallow: /
`);
	});
});
