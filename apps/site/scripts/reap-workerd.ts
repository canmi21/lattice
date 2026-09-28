/**
 * Kill the workerd a previous build or an interrupted test run left behind.
 *
 * `@sveltejs/adapter-cloudflare` calls `getPlatformProxy()` during the build and never disposes
 * it, so a build leaks one -- measured, not guessed: a build alone leaves one behind and the
 * whole test suite leaves none. An interrupted vitest leaks one too, because `d1.harness.ts`
 * disposes its Miniflare in `afterAll` and a SIGKILL never reaches it.
 *
 * Reclaimed rather than prevented, because a leaked process is only identifiable once its parent
 * is gone. So this runs at the start of the next build and of the next test run.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PORTS } from '@canmi/urls';

/** Only this checkout's workerd. Another clone's, or another project's, is not ours to reap. */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * Every port a dev server answers on, counting the inspector wrangler takes as port + 1.
 *
 * Taking + 1 for all four is right rather than lucky: the site's neighbor is the API's own
 * port, so the set is exactly the four pinned ports and the three inspectors. See libs/urls.
 */
const PINNED = Object.values(DEVELOPMENT_PORTS).flatMap((port) => [port, port + 1]);

type Listed = { pid: number; ppid: number; command: string };

function listed(): Listed[] {
	const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,comm='], { encoding: 'utf8' });
	return rows.split('\n').flatMap((row) => {
		const [, pid, ppid, command] = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(row) ?? [];
		return command ? [{ pid: Number(pid), ppid: Number(ppid), command }] : [];
	});
}

/**
 * Whatever answers on a pinned port, so a dev server is never what this takes.
 *
 * The second guard: `wrangler dev` has workerd bind the pinned port itself, so a wrangler that
 * died leaves something a browser still reaches. An empty set is also what a machine without
 * `lsof` returns, leaving the parent test alone -- which is the guard this is built on.
 */
function serving(): Set<number> {
	try {
		const rows = execFileSync('lsof', ['-nP', `-iTCP:${PINNED.join(',')}`, '-sTCP:LISTEN'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		return new Set(
			rows
				.split('\n')
				.slice(1)
				.map((row) => Number(row.split(/\s+/)[1]))
				.filter((pid) => Number.isInteger(pid) && pid > 0),
		);
	} catch {
		// lsof exits non-zero when nothing matches, which is the ordinary case, and when it is
		// not installed, which is not. Neither is worth failing a test run over.
		return new Set();
	}
}

/** Terminate this checkout's parentless workerd processes, and answer with what was taken. */
export function reap(): number[] {
	const spared = serving();
	const orphans = listed().filter(
		(row) =>
			row.ppid === 1 &&
			row.command.startsWith(ROOT) &&
			row.command.endsWith('/workerd') &&
			!spared.has(row.pid),
	);

	const taken: number[] = [];
	for (const { pid } of orphans) {
		try {
			process.kill(pid, 'SIGTERM');
			taken.push(pid);
		} catch {
			// Gone between the listing and the signal, which is the outcome this wanted anyway.
		}
	}
	return taken;
}

export default function setup(): void {
	const taken = reap();
	if (taken.length > 0) {
		console.log(`reaped ${taken.length} workerd left by an earlier run: ${taken.join(' ')}`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const taken = reap();
	console.log(taken.length > 0 ? `reaped ${taken.length}: ${taken.join(' ')}` : 'nothing to reap');
}
