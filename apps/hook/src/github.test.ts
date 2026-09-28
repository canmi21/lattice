import { describe, expect, it } from 'vitest';
import { REPOSITORY, WORKFLOW, runToDeploy, signed } from './github';

// GitHub's own example from "Validating webhook deliveries", so the check agrees with how GitHub
// signs rather than with how this file assumes it does.
const SECRET = "It's a Secret to Everybody";
const BODY = 'Hello, World!';
const SIGNATURE = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';

describe('signed', () => {
	it("accepts GitHub's documented example", async () => {
		expect(await signed(BODY, SIGNATURE, SECRET)).toBe(true);
	});

	it('refuses a changed body, another secret, and anything not a signature', async () => {
		expect(await signed(`${BODY} `, SIGNATURE, SECRET)).toBe(false);
		expect(await signed(BODY, SIGNATURE, 'another')).toBe(false);
		expect(await signed(BODY, null, SECRET)).toBe(false);
		expect(await signed(BODY, 'sha256=zz', SECRET)).toBe(false);
		// An unset secret must not turn into a key every signature of the empty string matches.
		expect(await signed(BODY, SIGNATURE, '')).toBe(false);
	});
});

describe('runToDeploy', () => {
	const run = {
		action: 'completed',
		repository: { full_name: REPOSITORY },
		workflow_run: {
			id: 42,
			path: WORKFLOW,
			head_branch: 'main',
			event: 'push',
			status: 'completed',
			conclusion: 'success',
		},
	};
	const without = (change: Partial<typeof run.workflow_run>) => ({
		...run,
		workflow_run: { ...run.workflow_run, ...change },
	});

	it('names a successful run of the deploy workflow on main', () => {
		expect(REPOSITORY).toBe('canmi21/lattice');
		expect(runToDeploy(run)).toBe(42);
		expect(runToDeploy(without({ event: 'schedule' }))).toBe(42);
	});

	it('names nothing for any run that is not that', () => {
		expect(runToDeploy({ ...run, action: 'requested' })).toBeUndefined();
		expect(runToDeploy(without({ conclusion: 'failure' }))).toBeUndefined();
		expect(runToDeploy(without({ path: '.github/workflows/other.yml' }))).toBeUndefined();
		expect(runToDeploy(without({ head_branch: 'feature' }))).toBeUndefined();
		expect(runToDeploy(without({ event: 'pull_request' }))).toBeUndefined();
		expect(runToDeploy({ ...run, repository: { full_name: 'someone/else' } })).toBeUndefined();
	});
});
