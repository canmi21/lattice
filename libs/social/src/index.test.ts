import { describe, expect, it } from 'vitest';
import { author } from 'canmi/identity';
import { ACCOUNTS, SOCIAL, socialLinks } from './index';
import { aliasesOf, person, PERSON_ID, SITE_ID } from './structured';

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

describe('the author as an entity', () => {
	it('goes by the full name and every handle, once each, and not by the name itself', () => {
		const names = aliasesOf({
			...author,
			name: 'Canmi',
			fullName: 'Canmi Wu',
			github: 'canmi21',
			twitter: 'canmi21',
			fediverse: 'canmi',
			telegram: 'canmi21',
			telegramGroup: 'canmimua',
		});
		expect(names).toEqual(['Canmi Wu', 'canmi21', 'canmi', 'canmimua']);
	});

	it('is one identifier on every graph, and not the site', () => {
		expect(person()['@id']).toBe(PERSON_ID);
		expect(PERSON_ID).not.toBe(SITE_ID);
	});
});
