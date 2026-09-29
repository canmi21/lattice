/**
 * PostgREST, asked with the anon key: by the server for the first screen, then by the browser for
 * what changed. The same client in both, and only the three views. See spec/architecture/probe.md,
 * "The page reads PostgREST with the anon key, from views alone".
 */
import { env } from '$env/dynamic/public';
import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
import { PostgrestClient } from '@supabase/postgrest-js';
import { SEGMENT_GRAIN, TAIL_GRAIN } from './board.ts';
import {
	CHECK_COLUMNS,
	HISTORY_COLUMNS,
	type HistoryRow,
	NOW_COLUMNS,
	readCheck,
	readHistory,
	readNow,
	type Wire,
} from './rows.ts';

/** Supabase's default `max-rows`: a longer answer is cut there silently, so ask in pages. */
const PAGE_ROWS = 1000;
const TIMEOUT_MS = 8000;

export type Client = PostgrestClient;

export function statusClient(fetch?: typeof globalThis.fetch): Client {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must both be set');
	}
	return new PostgrestClient(`${url.replace(/\/$/, '')}/rest/v1`, {
		headers: { apikey: key },
		fetch,
		timeout: TIMEOUT_MS,
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
 * for a poll's cursor. Values are quoted because an ISO time carries PostgREST's separators.
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
