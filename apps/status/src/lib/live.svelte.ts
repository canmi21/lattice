/**
 * The board after hydration: the browser asks PostgREST itself for what changed and our server
 * is asked for nothing more. It stops while the tab is hidden and asks at once when it returns.
 * See spec/architecture/probe.md, "The page reads PostgREST with the anon key, from views alone".
 */
import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
import { historyCursor, key, mergeHistory } from './board.ts';
import type { HistoryRow } from './rows.ts';
import { type Client, fetchChecks, fetchHistory, fetchNow, statusClient } from './source.ts';

/** Latest rounds every five seconds; history and the declared checks move by the five minutes. */
const NOW_EVERY_MS = 5_000;
const HISTORY_EVERY_MS = 60_000;
const CLOCK_EVERY_MS = 1_000;

export interface Snapshot {
	clock: number;
	checks: StatusCheckRow[];
	now: StatusNowRow[];
	history: HistoryRow[];
	unreachable: boolean;
}

export class Live {
	checks = $state.raw<StatusCheckRow[]>([]);
	now = $state.raw<StatusNowRow[]>([]);
	history = $state.raw<HistoryRow[]>([]);
	/** The instant every judgement is made at; the server's until the browser takes over. */
	clock = $state(0);
	/** When the database last answered, and whether the last ask failed. */
	answeredAt = $state(0);
	unreachable = $state(false);

	nowByKey = $derived(new Map(this.now.map((row) => [key(row.checkId, row.place), row])));

	constructor(snapshot: Snapshot) {
		this.checks = snapshot.checks;
		this.now = snapshot.now;
		this.history = snapshot.history;
		this.clock = snapshot.clock;
		this.answeredAt = snapshot.unreachable ? 0 : snapshot.clock;
		this.unreachable = snapshot.unreachable;
	}

	historyOf(check: StatusCheckRow): HistoryRow[] {
		return this.history.filter((row) => row.checkId === check.id && row.place === check.place);
	}

	/** Start polling; the returned function stops it. */
	start(): () => void {
		const client = statusClient();
		const timers: ReturnType<typeof setInterval>[] = [];
		// An ask still out when its next turn comes is left to finish rather than doubled.
		const busy = new Set<string>();

		const guarded = (name: string, ask: () => Promise<void>) => async () => {
			if (busy.has(name)) return;
			busy.add(name);
			try {
				await ask();
				this.answeredAt = Date.now();
				this.unreachable = false;
			} catch {
				this.unreachable = true;
			} finally {
				busy.delete(name);
			}
		};
		const pollNow = guarded('now', async () => {
			this.now = await fetchNow(client);
		});
		const pollHistory = guarded('history', () => this.#refreshHistory(client));

		const run = () => {
			this.clock = Date.now();
			void pollNow();
			void pollHistory();
			timers.push(
				setInterval(() => (this.clock = Date.now()), CLOCK_EVERY_MS),
				setInterval(pollNow, NOW_EVERY_MS),
				setInterval(pollHistory, HISTORY_EVERY_MS),
			);
		};
		const pause = () => timers.splice(0).forEach(clearInterval);
		const onVisibility = () => (document.hidden ? pause() : run());

		document.addEventListener('visibilitychange', onVisibility);
		if (!document.hidden) run();
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			pause();
		};
	}

	async #refreshHistory(client: Client): Promise<void> {
		const clock = Date.now();
		// A server render cached at the edge, or a first screen with no answer, may be behind
		// the declared checks, so they are asked again with the history.
		const [checks, fresh] = await Promise.all([
			fetchChecks(client),
			fetchHistory(client, historyCursor(this.history, clock), 'gt'),
		]);
		this.checks = checks;
		this.history = mergeHistory(this.history, fresh, clock);
	}
}
