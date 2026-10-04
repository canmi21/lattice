/**
 * PostgREST, asked with the anon key: by the server for the first screen, then by the browser only
 * when a broadcast cannot say it. The same client in both, and only the views. Realtime, with
 * the same key, for the broadcasts. See spec/architecture/probe.md, "The page reads PostgREST with
 * the anon key, from views alone, once; after that it is told".
 */
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';
import type { StatusCheckRow, StatusDailyRow, StatusNowRow } from '@monoflake/probe';
import { PostgrestClient } from '@supabase/postgrest-js';
import { RealtimeClient } from '@supabase/realtime-js';
import { SEGMENT_GRAIN, TAIL_GRAIN } from './board.ts';
import {
	CHECK_COLUMNS,
	DAILY_COLUMNS,
	type DayRow,
	HISTORY_COLUMNS,
	type HistoryRow,
	NOW_COLUMNS,
	readCheck,
	readDaily,
	readHistory,
	readNow,
	type Wire,
} from './rows.ts';

/** Supabase's default `max-rows`: a longer answer is cut there silently, so ask in pages. */
const PAGE_ROWS = 1000;
const TIMEOUT_MS = 8000;

export type Client = PostgrestClient;

/** The public channel and event the database broadcasts each batch on. */
export const CHANNEL = 'status';
export const EVENT = 'results';

function project(): { url: string; key: string } {
	const url = PUBLIC_SUPABASE_URL;
	const key = PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must both be set');
	}
	return { url: url.replace(/\/$/, ''), key };
}

/** The project's address for a page to reach early, or nothing where it is not configured. */
export function projectUrl(): string | undefined {
	return PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || undefined;
}

export function statusClient(fetch?: typeof globalThis.fetch): Client {
	const { url, key } = project();
	return new PostgrestClient(`${url}/rest/v1`, {
		headers: { apikey: key },
		fetch,
		timeout: TIMEOUT_MS,
	});
}

/** The key as `apikey` alone: a public channel is joined with no user's token. */
export function statusRealtime(): RealtimeClient {
	const { url, key } = project();

	return new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, {
		params: { apikey: key },
	});
}

interface Answer {
	data: unknown[] | null;
	error: { message: string } | null;
}

async function everyPage<Row>(ask: (from: number, to: number) => PromiseLike<Answer>) {
	const rows: Row[] = [];
	for (let from = 0; ; from += PAGE_ROWS) {
		// oxlint-disable-next-line no-await-in-loop -- each page is asked only if the last was full
		const { data, error } = await ask(from, from + PAGE_ROWS - 1);
		if (error) throw new Error(error.message);
		const page = (data ?? []) as Row[];
		rows.push(...page);
		if (page.length < PAGE_ROWS) return rows;
	}
}

export async function fetchChecks(client: Client): Promise<StatusCheckRow[]> {
	const rows = await everyPage<Wire<StatusCheckRow>>((from, to) =>
		client.from('status_checks').select(CHECK_COLUMNS).order('id').range(from, to),
	);
	return rows.map(readCheck);
}

export async function fetchNow(client: Client): Promise<StatusNowRow[]> {
	const rows = await everyPage<Wire<StatusNowRow>>((from, to) =>
		client.from('status_now').select(NOW_COLUMNS).order('check_id').order('place').range(from, to),
	);
	return rows.map(readNow);
}

/**
 * Both grains the bar reads, each from its own instant: `gte` for the first screen's floor, `gt`
 * for the cursor a closed half-hour is asked from. Values are quoted because an ISO time carries
 * PostgREST's separators.
 */
export async function fetchHistory(
	client: Client,
	since: { segment: Date; tail: Date },
	operator: 'gte' | 'gt',
): Promise<HistoryRow[]> {
	const arm = (grain: string, at: Date) =>
		`and(grain.eq.${grain},bucket_start.${operator}."${at.toISOString()}")`;
	const filter = `${arm(SEGMENT_GRAIN, since.segment)},${arm(TAIL_GRAIN, since.tail)}`;
	const rows = await everyPage<Wire<HistoryRow>>((from, to) =>
		client
			.from('status_history')
			.select(HISTORY_COLUMNS)
			.or(filter)
			.order('bucket_start')
			.order('check_id')
			.order('place')
			.order('grain')
			.range(from, to),
	);
	return rows.map(readHistory);
}

/** One rollup grain from `since` on, for a range finer than a day. */
export async function fetchGrain(
	client: Client,
	grain: string,
	since: Date,
): Promise<HistoryRow[]> {
	const rows = await everyPage<Wire<HistoryRow>>((from, to) =>
		client
			.from('status_history')
			.select(HISTORY_COLUMNS)
			.eq('grain', grain)
			.gte('bucket_start', since.toISOString())
			.order('bucket_start')
			.order('check_id')
			.order('place')
			.range(from, to),
	);
	return rows.map(readHistory);
}

/** Every past day the daily view holds; today is the live history's. */
export async function fetchDaily(client: Client, today: string): Promise<DayRow[]> {
	const rows = await everyPage<Wire<StatusDailyRow>>((from, to) =>
		client
			.from('status_daily')
			.select(DAILY_COLUMNS)
			.lt('day', today)
			.order('day')
			.order('check_id')
			.order('place')
			.range(from, to),
	);
	return rows.map(readDaily);
}
