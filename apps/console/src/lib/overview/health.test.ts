import { describe, expect, it } from 'vitest';
import type { Entry } from '../wire.ts';
import { healthOf, worstOf } from './health.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const app = (name: string, running: boolean, held = false) => ({
	name,
	image: 'x',
	deployed_at: '',
	running,
	held,
});
const node = (apps: ReturnType<typeof app>[], state: Entry['state'] = 'live'): Entry => ({
	version: 1,
	heard_at: '2026-10-09T12:00:00Z',
	state,
	snapshot: { taken_at: '', events: [], apps },
});

describe('health', () => {
	it('is well where every app runs, and says what is held', () => {
		expect(healthOf(node([app('relay', true)]), NOW)).toEqual({ health: 'well', said: 'Every app running' });
		expect(healthOf(node([app('relay', false, true)]), NOW).health).toBe('well');
	});

	it('is down where an app should run and does not, naming it', () => {
		const told = healthOf(node([app('relay', false), app('geo', true)]), NOW);
		expect(told.health).toBe('down');
		expect(told.said).toMatch(/^1 app down: /);
	});

	it('takes the relay word over the apps, and gone over everything', () => {
		expect(healthOf(node([app('relay', false)], 'upgrading'), NOW)).toEqual({ health: 'leaving', said: 'Upgrading' });
		expect(healthOf(undefined, NOW).health).toBe('gone');
	});

	it('gives a place the worst of its nodes, each named', () => {
		const told = worstOf([
			{ code: 'tyo', told: { health: 'well', said: 'Every app running' } },
			{ code: 'nrt', told: { health: 'down', said: '1 app down: Relay' } },
		]);
		expect(told.health).toBe('down');
		expect(told.said).toContain('Narita: 1 app down: Relay');
	});
});
