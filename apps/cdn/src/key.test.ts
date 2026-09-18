import { describe, expect, it } from 'vitest';
import { canonicalSpelling, parseName, validatorFor } from './key';

describe('validatorFor', () => {
	it('distinguishes the formats one id serves', () => {
		// A tag shared across formats would let a cache answer a WebP request with the AVIF
		// bytes it already holds, which is a corrupt image rather than a slow one.
		const cid = '44b6081deaf0242ca3bf83d62a3b6c95';
		expect(validatorFor(cid, 'avif')).not.toBe(validatorFor(cid, 'webp'));
	});

	it('is quoted, as an entity tag has to be', () => {
		expect(validatorFor('44b6081deaf0242ca3bf83d62a3b6c95', 'avif')).toBe(
			'"44b6081deaf0242ca3bf83d62a3b6c95.avif"',
		);
	});
});

describe('parseName', () => {
	it('splits a content id from its extension', () => {
		expect(parseName('44b6081deaf0242ca3bf83d62a3b6c95.avif')).toEqual({
			cid: '44b6081deaf0242ca3bf83d62a3b6c95',
			extension: 'avif',
		});
	});

	it('lowercases both halves', () => {
		expect(parseName('44B6081DEAF0242CA3BF83D62A3B6C95.AVIF')).toEqual({
			cid: '44b6081deaf0242ca3bf83d62a3b6c95',
			extension: 'avif',
		});
	});

	it('rejects anything that is not a 128-bit hex id', () => {
		// The id length is what makes a key unguessable-by-typo rather than merely unusual, so
		// a short or non-hex name is refused before it reaches the bucket.
		expect(parseName('short.avif')).toBeNull();
		expect(parseName('44b6081deaf0242ca3bf83d62a3b6c9.avif')).toBeNull();
		expect(parseName('zzb6081deaf0242ca3bf83d62a3b6c95.avif')).toBeNull();
	});

	it('rejects a name with no extension', () => {
		expect(parseName('44b6081deaf0242ca3bf83d62a3b6c95')).toBeNull();
		expect(parseName('.avif')).toBeNull();
	});

	it('rejects a doubled extension rather than reading past it', () => {
		// Splitting on the last dot leaves `{cid}.avif` as the id, which is not one. Accepting
		// it would mean two names resolving to the same object, and a content address that is
		// not unique stops being an address.
		expect(parseName('44b6081deaf0242ca3bf83d62a3b6c95.avif.webp')).toBeNull();
	});
});

describe('canonicalSpelling', () => {
	/**
	 * One format with two spellings is two validators, two edge cache entries and two transcodes
	 * over identical bytes. The route redirects rather than serving the short form, so this is
	 * what decides that there is anything to redirect.
	 */
	it('names jpeg as the spelling jpg should have used', () => {
		expect(canonicalSpelling('jpg')).toBe('jpeg');
	});

	it('leaves every spelling that is already canonical alone', () => {
		for (const extension of ['jpeg', 'webp', 'png', 'avif']) {
			expect(canonicalSpelling(extension)).toBeNull();
		}
	});
});
