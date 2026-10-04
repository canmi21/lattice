import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { author } from '@canmi/me/identity';
import { URLS } from '@monoflake/sdk';
import { describe, expect, it } from 'vitest';

// The config itself, read from disk rather than through `virtual:site`: the claim below is
// about what the file says, and the virtual module is the thing that would hide a change to it.
const CONFIG = fileURLToPath(new URL('../../site.config.yaml', import.meta.url));
const config = readFileSync(CONFIG, 'utf8');

function scalar(key: string): string | undefined {
	return new RegExp(`^${key}:\\s*(\\S.*?)\\s*$`, 'm').exec(config)?.[1];
}

describe('site config', () => {
	/**
	 * `domain` is a label drawn on the OpenGraph card, not an address anything resolves, which is why
	 * it may sit outside @monoflake/sdk at all. That exemption only holds while the two agree -- a
	 * card advertising a host the site no longer answers on is worse than no card -- and nothing
	 * structural can enforce it, because one is read by Rust and the other by the bundler. So it is
	 * enforced here.
	 */
	it('draws the same host on a card that @monoflake/sdk resolves', () => {
		const domain = scalar('domain');
		expect(domain).toBeDefined();
		expect(domain).toBe(new URL(URLS.apps.production.site).hostname);
	});

	/**
	 * A card drawn by `local og` and a page rendered by SvelteKit have no other way to agree than
	 * both reading @canmi/me/identity -- the name, role, GitHub handle and avatar id had drifted into
	 * the markup as literals once already. Checked against the source text rather than a render,
	 * because a render agrees with a hardcoded value as happily as with a read one.
	 */
	it('leaves the author out of the page that introduces them', () => {
		const home = readFileSync(
			fileURLToPath(new URL('../routes/+page.svelte', import.meta.url)),
			'utf8',
		);
		for (const key of ['name', 'fullName', 'role', 'github', 'githubId'] as const) {
			const value = String(author[key]);
			expect(value, `@canmi/me/identity is missing ${key}`).toBeTruthy();
			expect(home, `+page.svelte hardcodes author.${key}`).not.toContain(value);
		}
	});
});
