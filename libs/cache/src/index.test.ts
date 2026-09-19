import { describe, expect, it } from 'vitest';
import { NAMED, PUBLICATION_DELAY, PUBLISHED, UNCHANGING, WHILE_UNREACHABLE } from './index';

/**
 * The bytes, written out rather than recomposed.
 *
 * Every expectation here is a literal. This file exists to catch a header changing, and one
 * that built its expectation the way the source does would agree with whatever the source
 * became -- which is the shape of a test that has stopped holding anything.
 */
describe('lifetimes', () => {
	it('holds an answer about the corpus for the one publication delay', () => {
		expect(PUBLICATION_DELAY).toBe(300);
		expect(PUBLISHED).toBe('public, max-age=300');
	});

	it('holds a key whose bytes cannot change for a year', () => {
		expect(UNCHANGING).toBe('public, max-age=31536000, immutable');
	});

	it('holds a name whose target may move for an hour, and never marks one immutable', () => {
		expect(NAMED).toBe('public, max-age=3600');
	});

	// Composed by the caller rather than exported composed, because offering a stale answer is a
	// decision about what produced it. This is the spelling both callers that make it produce.
	it('composes the stale window onto a published answer', () => {
		expect(`${PUBLISHED}, stale-if-error=${WHILE_UNREACHABLE}`).toBe(
			'public, max-age=300, stale-if-error=10800',
		);
	});
});
