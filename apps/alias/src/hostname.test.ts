import { describe, expect, it } from 'vitest';
import { isValidHostname } from './hostname';
import { tonesFor } from './resolve';

describe('isValidHostname', () => {
	it('accepts an ordinary hostname', () => {
		expect(isValidHostname('example.com')).toBe(true);
		expect(isValidHostname('blog.example.co.uk')).toBe(true);
	});

	it('rejects things that are not public sites', () => {
		// A worker resolving `localhost` would reach itself, and a bare address is not a site.
		expect(isValidHostname('localhost')).toBe(false);
		expect(isValidHostname('127.0.0.1')).toBe(false);
		expect(isValidHostname('nodots')).toBe(false);
	});

	it('keeps a hostname that merely starts with a digit', () => {
		expect(isValidHostname('1.example.com')).toBe(true);
	});

	it('rejects malformed labels', () => {
		expect(isValidHostname('-lead.example.com')).toBe(false);
		expect(isValidHostname('trail-.example.com')).toBe(false);
		expect(isValidHostname('a..example.com')).toBe(false);
		expect(isValidHostname('bad_underscore.com')).toBe(false);
	});
});

/**
 * Naming a tone means that tone or nothing.
 *
 * No silent substitution: a caller that asked for dark and received light has no way to know it
 * happened, and would draw a light icon on a dark surface believing it had the right one. A 404
 * hands the choice back. With no tone named, either will do.
 */
describe('which tone a request settles for', () => {
	it('takes a named tone or nothing', () => {
		expect(tonesFor('dark')).toEqual(['dark']);
		expect(tonesFor('light')).toEqual(['light']);
	});

	it('takes either when none is named', () => {
		expect(tonesFor(undefined)).toEqual(['light', 'dark']);
	});

	it('treats a tone it does not know as none at all', () => {
		expect(tonesFor('sepia')).toEqual(['light', 'dark']);
	});
});
