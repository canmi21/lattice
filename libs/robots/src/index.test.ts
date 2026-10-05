import { noteProblems } from '@canmi/me/robots';
import { SOURCE } from '@canmi/me/urls';
import { URLS } from '@monoflake/sdk';
import { expect, it } from 'vitest';
import { everyNote, ownRoot, peerEntries, robotsFor, securityFor } from './index.ts';

const SITE = URLS.apps.production.site;
const STATUS = URLS.internal.status.canonical;

it('says how page content may be used on both hosts, in both spellings', () => {
	for (const host of ['site', 'status'] as const) {
		const text = robotsFor(host);
		expect(text).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=yes');
		expect(text).toContain('Content-Usage: search=y, ai-use=y, train-ai=y');
	}
});

it("keeps the site's namespace out", () => {
	expect(robotsFor('site')).toContain('Disallow: /@/');
});

const sitemaps = (text: string) => text.split('\n').filter((line) => line.startsWith('Sitemap: '));

it("names every page host's sitemap, its own first", () => {
	expect(sitemaps(robotsFor('site'))).toEqual([
		`Sitemap: ${SITE}/sitemap.xml`,
		`Sitemap: ${STATUS}/sitemap.xml`,
	]);
	expect(sitemaps(robotsFor('status'))).toEqual([
		`Sitemap: ${STATUS}/sitemap.xml`,
		`Sitemap: ${SITE}/sitemap.xml`,
	]);
});

it('lists every other page host by its root alone, and weighs its own on its own scale', () => {
	expect(peerEntries('site')).toEqual([
		{ loc: `${STATUS}/`, changefreq: 'always', priority: '0.5' },
	]);
	expect(ownRoot('status', '1.0')).toEqual({
		loc: `${STATUS}/`,
		changefreq: 'always',
		priority: '1.0',
	});
});

it('says one thing four ways, no two the same, each to the layout', () => {
	const notes = everyNote();
	expect(new Set(notes.map((lines) => lines.join(' '))).size).toBe(4);
	for (const lines of notes) expect(noteProblems(lines)).toEqual([]);
});

it('sends an agent to this repository, from both files', async () => {
	expect(robotsFor('status')).toContain(`# ${SOURCE}.git`);
	const answer = securityFor(new Request(`${SITE}/.well-known/security.txt`), 'site');
	expect(await answer.text()).toContain(`# ${SOURCE}.git`);
});
