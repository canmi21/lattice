/**
 * The board after hydration: told each batch the probe writes, over one socket, and asking
 * PostgREST only for what a broadcast cannot say -- the history when a half-hour closes, the latest
 * rounds after the socket was down, the declared checks when one it has not seen is heard of. See
 * spec/architecture/probe.md, "The page reads PostgREST with the anon key, from views alone, once;
 * after that it is told".
 */
import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
import { historyCursor, key, mergeHistory, windowAt } from './board.ts';
import { foldHistory, foldNow } from './fold.ts';
import { type HistoryRow, readBroadcast } from './rows.ts';
import {
	CHANNEL,
	type Client,
	EVENT,
	fetchChecks,
	fetchHistory,
	fetchNow,
	statusClient,
	statusRealtime,
} from './source.ts';

/** Staleness and "how long ago" are judged against this, ticking once a second. */
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
	/**
	 * When the database last answered or was last heard from, and whether the socket is down or
	 * the last ask failed.
	 */
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

	/** Start listening; the returned function stops it. */
	start(): () => void {
		const client = statusClient();
		const realtime = statusRealtime();
		// An ask still out when it is wanted again is left to finish rather than doubled.
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
		const readNow = guarded('now', async () => {
			this.now = await fetchNow(client);
		});
		const readHistory = guarded('history', () => this.#refreshHistory(client));
		const readChecks = guarded('checks', async () => {
			this.checks = await fetchChecks(client);
		});

		let segment = windowAt(Date.now()).open;
		const tick = () => {
			this.clock = Date.now();
			const open = windowAt(this.clock).open;
			if (open === segment) return;
			segment = open;
			void readHistory();
		};
		tick();
		const timer = setInterval(tick, CLOCK_EVERY_MS);

		let dropped = false;
		const channel = realtime
			.channel(CHANNEL)
			.on('broadcast', { event: EVENT }, (message) => {
				const heard = readBroadcast(message.payload);
				if (heard.length === 0) return;
				const folded = foldNow(this.now, heard, this.checks);
				this.now = folded.now;
				this.history = foldHistory(this.history, heard, Date.now());
				this.answeredAt = Date.now();
				this.unreachable = false;
				if (folded.unknown) void readChecks();
			})
			.subscribe((status) => {
				if (status !== 'SUBSCRIBED') {
					dropped = true;
					this.unreachable = true;
					return;
				}
				this.unreachable = false;
				// What was written while the socket was down was broadcast to nobody.
				if (dropped) void readNow();
				dropped = false;
			});

		return () => {
			clearInterval(timer);
			void realtime.removeChannel(channel).then(() => realtime.disconnect());
		};
	}

	async #refreshHistory(client: Client): Promise<void> {
		const clock = Date.now();
		// A server render cached at the edge may be behind the declared checks, so they are asked
		// again with the history.
		const [checks, fresh] = await Promise.all([
			fetchChecks(client),
			fetchHistory(client, historyCursor(this.history, clock), 'gt'),
		]);
		this.checks = checks;
		this.history = mergeHistory(this.history, fresh, clock);
	}
}
