import { describe, expect, it } from 'vitest';
import { ACCOUNTS, SOCIAL, socialLinks } from './index';

describe('socialLinks', () => {
	it('keeps the order it is given', () => {
		const names = socialLinks(SOCIAL, { sitemap: '/sitemap.xml', rss: '/atom.xml' }).map(
			(link) => link.name,
		);
		expect(names).toEqual([...SOCIAL]);
		expect(socialLinks(ACCOUNTS).map((link) => link.name)).toEqual([
			'github',
			'twitter',
			'fediverse',
			'bluesky',
			'telegram',
		]);
	});

	it('lets the app replace any address', () => {
		const [github] = socialLinks(['github'], { github: 'https://example.com' });
		expect(github?.href).toBe('https://example.com');
	});

	// A row missing its feed is silent, so the omission fails where it is made.
	it('refuses an entry only the app can address when it was not given one', () => {
		expect(() => socialLinks(['rss'])).toThrow(/rss/);
	});
});
