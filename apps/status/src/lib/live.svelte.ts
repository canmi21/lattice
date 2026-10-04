/**
 * The board after hydration: told each batch the probe writes, over one socket, and asking
 * PostgREST only for what a broadcast cannot say -- the history when a half-hour closes, the latest
 * rounds after the socket was down, the declared checks when one it has not seen is heard of. See
 * spec/architecture/probe.md, "The page reads PostgREST with the anon key, from views alone, once;
 * after that it is told".
 */
import type { StatusCheckRow, StatusNowRow } from '@monoflake/probe';
import { dayName, historyCursor, key, mergeHistory, windowAt } from './board.ts';
import { foldHistory, foldNow } from './fold.ts';
import { RAW_GRAIN, type Range, rangeFloor, rawFloor, SPAN } from './ranges.ts';
import { type DayRow, type HistoryRow, readBroadcast } from './rows.ts';
import {
	CHANNEL,
	type Client,
	EVENT,
	fetchChecks,
	fetchDaily,
	fetchGrain,
	fetchHistory,
	fetchNow,
	statusClient,
	statusRealtime,
} from './source.ts';

/** Staleness and "how long ago" are judged against this, ticking once a second. */
const CLOCK_EVERY_MS = 1_000;
/** How long a hidden tab keeps listening before it lets go, so a glance away costs nothing. */
const HIDDEN_GRACE_MS = 30_000;

export interface Snapshot {
	clock: number;
	checks: StatusCheckRow[];
	now: StatusNowRow[];
	history: HistoryRow[];
	daily: DayRow[];
	range: Range;
	rangeRows: HistoryRow[];
	unreachable: boolean;
}

export class Live {
	checks = $state.raw<StatusCheckRow[]>([]);
	now = $state.raw<StatusNowRow[]>([]);
	history = $state.raw<HistoryRow[]>([]);
	/** Past days, from the daily view; today is the history's. */
	daily = $state.raw<DayRow[]>([]);
	/** What a bar spans, and the rollups read for it when finer than a day. */
	range = $state<Range>('days');
	rangeRows = $state.raw<HistoryRow[]>([]);
	#client: Client | undefined;
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
		this.daily = snapshot.daily;
		this.range = snapshot.range;
		this.rangeRows = snapshot.rangeRows;
		this.clock = snapshot.clock;
		this.answeredAt = snapshot.unreachable ? 0 : snapshot.clock;
		this.unreachable = snapshot.unreachable;
	}

	dailyOf(check: StatusCheckRow): DayRow[] {
		return this.daily.filter((row) => row.checkId === check.id && row.place === check.place);
	}

	/** A check's rows for a finer range: the range's rollups and the live minutes. */
	rangeOf(check: StatusCheckRow): HistoryRow[] {
		const mine = (row: HistoryRow) => row.checkId === check.id && row.place === check.place;
		return [...this.rangeRows.filter(mine), ...this.history.filter(mine)];
	}

	/** Show bars of `range`, reading its rollups when finer than a day. */
	async setRange(range: Range): Promise<void> {
		this.range = range;
		this.rangeRows = [];
		await this.#readRange();
	}

	async #readRange(): Promise<void> {
		const { grain } = SPAN[this.range];
		if (!grain || !this.#client) return;
		const range = this.range;
		const clock = Date.now();
		const [rolled, raw] = await Promise.all([
			fetchGrain(this.#client, grain, new Date(rangeFloor(range, clock))),
			fetchGrain(this.#client, RAW_GRAIN, new Date(rawFloor(range, clock))),
		]);
		if (this.range === range) this.rangeRows = [...rolled, ...raw];
	}

	historyOf(check: StatusCheckRow): HistoryRow[] {
		return this.history.filter((row) => row.checkId === check.id && row.place === check.place);
	}

	/**
	 * Listen while the tab is shown: hidden past the grace it lets go of the socket and the clock,
	 * and shown again it asks for what it missed before listening. The returned function stops it.
	 */
	start(): () => void {
		let stop = document.hidden ? undefined : this.#listen(false);
		let grace: ReturnType<typeof setTimeout> | undefined;
		const onVisibility = () => {
			clearTimeout(grace);
			if (document.hidden) {
				grace = setTimeout(() => {
					stop?.();
					stop = undefined;
				}, HIDDEN_GRACE_MS);
			} else {
				stop ??= this.#listen(true);
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			clearTimeout(grace);
			stop?.();
		};
	}

	/** One stretch of listening; `resumed` catches up on what was written while nobody listened. */
	#listen(resumed: boolean): () => void {
		const client = statusClient();
		this.#client = client;
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
		// A finer range re-reads its rollups each time one of its grain closes.
		let rolled = 0;
		const tick = () => {
			this.clock = Date.now();
			const grain = SPAN[this.range].grain;
			const size = grain === '5m' ? 300_000 : 60_000;
			const closed = Math.floor(this.clock / size);
			if (grain && closed !== rolled) {
				rolled = closed;
				void this.#readRange();
			}
			const open = windowAt(this.clock).open;
			if (open === segment) return;
			segment = open;
			void readHistory();
		};
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | undefined;
		// Resumed, the clock waits for the latest rounds, or every check would read silent first.
		const caughtUp = resumed ? Promise.all([readNow(), readHistory()]) : Promise.resolve();
		void caughtUp.then(() => {
			if (stopped) return;
			tick();
			timer = setInterval(tick, CLOCK_EVERY_MS);
		});

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
				if (stopped) return;
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
			stopped = true;
			clearInterval(timer);
			void realtime.removeChannel(channel).then(() => realtime.disconnect());
		};
	}

	async #refreshHistory(client: Client): Promise<void> {
		const clock = Date.now();
		// A server render cached at the edge may be behind the declared checks, so they are asked
		// again with the history.
		const today = dayName(clock);
		const newDay = !this.daily.some(
			(row) => row.day === Date.parse(`${today}T00:00:00Z`) - 86_400_000,
		);
		const [checks, fresh, daily] = await Promise.all([
			fetchChecks(client),
			fetchHistory(client, historyCursor(this.history, clock), 'gt'),
			newDay ? fetchDaily(client, today) : Promise.resolve(this.daily),
		]);
		this.checks = checks;
		this.history = mergeHistory(this.history, fresh, clock);
		this.daily = daily;
	}
}
