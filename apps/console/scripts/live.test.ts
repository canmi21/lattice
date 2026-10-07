import { describe, expect, it } from 'vitest';
import { admitted } from './live.ts';

describe('admitted', () => {
	it('lets in a page this server served', () => {
		expect(admitted('http://localhost:5317', 5317)).toBe(true);
	});

	it('turns away another site open in the same browser', () => {
		expect(admitted('https://evil.test', 5317)).toBe(false);
		expect(admitted('http://localhost.evil.test:5317', 5317)).toBe(false);
	});

	it('turns away this machine on another port or scheme', () => {
		expect(admitted('http://localhost:5173', 5317)).toBe(false);
		expect(admitted('https://localhost:5317', 5317)).toBe(false);
	});

	it('turns away a client that names no page', () => {
		expect(admitted(undefined, 5317)).toBe(false);
		expect(admitted('null', 5317)).toBe(false);
	});

	it('turns away everything while the port is unknown', () => {
		expect(admitted('http://localhost:5317', undefined)).toBe(false);
	});
});
