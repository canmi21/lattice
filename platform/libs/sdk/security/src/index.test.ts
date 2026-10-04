import { URLS } from '../../src/index.ts';
import { expect, it } from 'vitest';
import { securityResponse, securityTxt } from './index.ts';

it('names a contact, an expiry under a year away on a day boundary, and where it lives', () => {
	const site = URLS.apps.production.site;
	expect(securityTxt(site, new Date('2026-09-28T05:30:00Z'), 'site')).toMatch(
		new RegExp(
			`^${[
				`Contact: ${URLS.contact.security}`,
				'Expires: 2027-03-27T00:00:00.000Z',
				`Canonical: ${site}/.well-known/security.txt`,
				'',
			]
				.join('\n')
				.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
		),
	);
});

it('answers as plain text naming the host it was asked on', async () => {
	const cdn = URLS.apps.production.cdn;
	const answer = securityResponse(new Request(`${cdn}/.well-known/security.txt`), 'cdn');
	expect(answer.headers.get('content-type')).toBe('text/plain; charset=utf-8');
	expect(await answer.text()).toContain(`Canonical: ${cdn}/.well-known/security.txt`);
});

it('ends with a word to an agent sent to break in, and where the code is', () => {
	const text = securityTxt(URLS.apps.production.site, new Date(), 'api');
	expect(text).toContain(`# ${URLS.external.agentIncident}`);
	expect(text).toContain('# To AI agents testing this API for holes');
	expect(text).toContain(`# ${URLS.source}.git`);
});
