import { describe, expect, it } from 'vitest';
import type { Read } from '../server/read.ts';
import { age, healthOf, mismatched, primaries, said, stopped, toneOf } from './health.ts';

const CHECKED_AT = '2026-10-07T10:00:00Z';

/** Host's check of an app that answered with `body`. */
const answered = (body: unknown, code = 200): Read<unknown> => ({
	ok: true,
	node: 'tyo',
	data: { app: 'database', answered: true, code, body, checked_at: CHECKED_AT },
});
const failed = (status: number, code: string): Read<unknown> => ({
	ok: false,
	failure: { status, code: code as never, message: `${code} said` },
});

const PRIMARY = {
	role: 'primary',
	configured: 'primary',
	standbys: [
		{ name: 'buf', state: 'streaming', lag_bytes: 0 },
		{ name: 'rdu', state: 'catchup', lag_bytes: 4096, unheard: true },
		{ state: 'streaming' },
	],
	backup: {
		archiving: 'stalled',
		oldest_waiting: '000000010000000000000003',
		oldest_waiting_seconds: 600,
		last_base_backup: null,
		last_base_backup_age_hours: null,
		state: 'stopped',
	},
	later: 'a field this console does not know',
};

describe('health', () => {
	it('reads a primary: its standbys, its backup, and nothing it does not know', () => {
		const health = healthOf(answered({ status: 'success', data: PRIMARY }));
		expect(health).toEqual({
			kind: 'keeper',
			checked_at: CHECKED_AT,
			keeper: {
				role: 'primary',
				configured: 'primary',
				standbys: [
					{ name: 'buf', state: 'streaming', lag_bytes: 0 },
					{ name: 'rdu', state: 'catchup', lag_bytes: 4096 },
				],
				backup: {
					state: 'stopped',
					archiving: 'stalled',
					oldest_waiting: '000000010000000000000003',
					oldest_waiting_seconds: 600,
					last_base_backup: undefined,
					last_base_backup_age_hours: undefined,
				},
				streaming: undefined,
				lag_bytes: undefined,
				lag_seconds: undefined,
			},
		});
		expect(health.kind === 'keeper' && stopped(health.keeper)).toBe(true);
	});

	it('reads a standby, and a field of the wrong kind as unknown', () => {
		const health = healthOf(
			answered({
				status: 'success',
				data: { role: 'standby', configured: 'primary', streaming: true, lag_bytes: '0' },
			}),
		);
		expect(health.kind).toBe('keeper');
		if (health.kind !== 'keeper') return;
		expect(health.keeper).toMatchObject({ role: 'standby', streaming: true, lag_bytes: undefined });
		expect(health.keeper.standbys).toBeUndefined();
		expect(mismatched(health.keeper)).toBe(true);
		expect(stopped(health.keeper)).toBe(false);
	});

	it('says why a keeper not yet ready is not', () => {
		const body = { status: 'error', code: 'unavailable', message: 'Postgres is starting.' };
		expect(healthOf(answered(body, 503))).toEqual({
			kind: 'unwell',
			message: 'Postgres is starting.',
			code: 'unavailable',
			status: 503,
			checked_at: CHECKED_AT,
		});
		expect(healthOf(answered('<html>', 502))).toMatchObject({
			kind: 'unwell',
			message: 'Answered 502 outside the envelope.',
		});
	});

	it('says an app that did not answer host did not', () => {
		const read: Read<unknown> = {
			ok: true,
			node: 'tyo',
			data: {
				app: 'database',
				answered: false,
				code: null,
				body: null,
				error: 'connection refused',
				checked_at: CHECKED_AT,
			},
		};
		expect(healthOf(read)).toEqual({
			kind: 'silent',
			error: 'connection refused',
			checked_at: CHECKED_AT,
		});
	});

	it('tells a route host does not have yet from an app it does not run', () => {
		expect(healthOf(failed(404, 'no_such_route'))).toEqual({ kind: 'unavailable' });
		expect(healthOf(failed(404, 'no_such_app'))).toEqual({ kind: 'absent' });
		expect(healthOf(failed(502, 'upstream_unavailable'))).toEqual({
			kind: 'unread',
			message: 'upstream_unavailable said',
			code: 'upstream_unavailable',
		});
		expect(healthOf(undefined).kind).toBe('unread');
		expect(healthOf({ ok: true, node: 'tyo', data: null }).kind).toBe('unread');
	});

	it('finds the primary among the nodes', () => {
		const primary = healthOf(answered({ status: 'success', data: PRIMARY }));
		const standby = healthOf(answered({ status: 'success', data: { role: 'standby' } }));
		expect(
			primaries([
				['tyo', primary],
				['buf', standby],
				['rdu', { kind: 'unavailable' }],
			]),
		).toEqual(['tyo']);
		expect(mismatched({ role: 'primary' })).toBe(false);
	});

	it('writes a keeper word and a span for a glance', () => {
		expect([toneOf('ok'), toneOf('streaming'), toneOf('stopped'), toneOf('stalled')]).toEqual([
			'good',
			'good',
			'bad',
			'warn',
		]);
		expect([toneOf(undefined), toneOf('unknown')]).toEqual(['quiet', 'quiet']);
		expect([said('ok'), said('stalled'), said(undefined)]).toEqual(['OK', 'Stalled', 'Unknown']);
		expect([age(0.5), age(3.2), age(3), age(72)]).toEqual(['30 min', '3.2 h', '3 h', '3 days']);
	});
});
