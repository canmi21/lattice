import { describe, expect, it } from 'vitest';
import { FOUND, PRESERVED, redirectFor } from './redirect';

describe('redirectFor', () => {
	// A name with nothing attached resolves to one answer, and a user agent turning the follow-up
	// into a GET loses nothing, because a GET is what it already was.
	it('sends a plain lookup on temporarily', () => {
		expect(redirectFor('GET', '')).toBe(FOUND);
		expect(redirectFor('HEAD', '')).toBe(FOUND);
	});

	// A query is input. Downgrading the method would drop what was asked, so the request is
	// preserved rather than merely followed.
	it('preserves a request that carried a question', () => {
		expect(redirectFor('GET', '?tone=dark')).toBe(PRESERVED);
		expect(redirectFor('HEAD', '?tone=dark')).toBe(PRESERVED);
	});

	// A body is input too, and it is the case a 302 is specified to be allowed to discard.
	it('preserves anything that could be carrying a body', () => {
		expect(redirectFor('POST', '')).toBe(PRESERVED);
		expect(redirectFor('PUT', '')).toBe(PRESERVED);
		expect(redirectFor('POST', '?tone=dark')).toBe(PRESERVED);
	});
});
