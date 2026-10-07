import { describe, expect, it } from 'vitest';
import type { Read } from '../server/read.ts';
import { rolloutLabel, rolloutOf, rolloutsOf } from './rollout.ts';

const ok = <T>(data: T): Read<T> => ({ ok: true, node: 'tyo', data });

describe('rollout', () => {
	it('names each mode in a word, and one it does not know as host wrote it', () => {
		expect(rolloutLabel('replace')).toBe('Restart');
		expect(rolloutLabel('beside')).toBe('Zero downtime');
		expect(rolloutLabel('manual')).toBe('By hand');
		expect(rolloutLabel('canary')).toBe('canary');
	});

	it('reads it at the top level or in the manifest, and none as replace', () => {
		expect(rolloutOf({ rollout: 'beside' })).toBe('beside');
		expect(rolloutOf({ manifest: { rollout: 'manual' } })).toBe('manual');
		expect(rolloutOf({})).toBe('replace');
		expect(rolloutOf({ rollout: '' })).toBe('replace');
		expect(rolloutOf({ rollout: 3 })).toBe('replace');
	});

	it('collects what the nodes that answered show, with the nodes showing each', () => {
		expect(
			rolloutsOf({
				tyo: ok({ rollout: 'manual' }),
				buf: ok({}),
				rdu: ok({ rollout: 'manual' }),
				gvx: { ok: false, failure: { status: 502, code: 'upstream_unavailable', message: '' } },
			}),
		).toEqual([
			{ rollout: 'manual', nodes: ['tyo', 'rdu'] },
			{ rollout: 'replace', nodes: ['buf'] },
		]);
		expect(rolloutsOf(undefined)).toEqual([]);
	});
});
