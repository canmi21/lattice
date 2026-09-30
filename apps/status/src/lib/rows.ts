/**
 * The three views as PostgREST sends them, turned into the rows libs/status-schema infers.
 *
 * PostgREST answers with the SQL names and timestamps as text, so each row is read once here and
 * the page never sees the wire. The views are the contract; see spec/architecture/probe.md, "The
 * schema: declared once, in Drizzle, applied by the probe".
 */
import type { StatusCheckRow, StatusHistoryRow, StatusNowRow } from '@canmi/status-schema';

type Snake<S extends string> = S extends `${infer Head}${infer Rest}`
	? `${Head extends Lowercase<Head> ? Head : `_${Lowercase<Head>}`}${Snake<Rest>}`
	: S;

/** A row as it arrives: every key in its SQL spelling, every timestamp still a string. */
export type Wire<Row> = {
	[Key in keyof Row & string as Snake<Key>]: Row[Key] extends Date ? string : Row[Key];
};

/** What the page reads of history: the uptime bar needs the counts, not the timings. */
export type HistoryRow = Pick<
	StatusHistoryRow,
	'checkId' | 'place' | 'grain' | 'bucketStart' | 'passed' | 'failed'
>;

export const CHECK_COLUMNS = 'id,kind,target,place,interval_seconds,updated_at';
export const NOW_COLUMNS = 'check_id,place,kind,target,interval_seconds,at,ok,duration_ms,detail';
export const HISTORY_COLUMNS = 'check_id,place,grain,bucket_start,passed,failed';

export function readCheck(row: Wire<StatusCheckRow>): StatusCheckRow {
	return {
		id: row.id,
		kind: row.kind,
		target: row.target,
		place: row.place,
		intervalSeconds: row.interval_seconds,
		updatedAt: new Date(row.updated_at),
	};
}

export function readNow(row: Wire<StatusNowRow>): StatusNowRow {
	return {
		checkId: row.check_id,
		place: row.place,
		kind: row.kind,
		target: row.target,
		intervalSeconds: row.interval_seconds,
		at: new Date(row.at),
		ok: row.ok,
		durationMs: row.duration_ms,
		detail: row.detail,
	};
}

export function readHistory(row: Wire<HistoryRow>): HistoryRow {
	return {
		checkId: row.check_id,
		place: row.place,
		grain: row.grain,
		bucketStart: new Date(row.bucket_start),
		passed: row.passed,
		failed: row.failed,
	};
}

/**
 * One check's entry in a broadcast: its latest round in the probe's batch, as `status_now` has it,
 * and how many of its rounds in that batch passed and failed. See
 * libs/status-schema/migrations/0002_broadcast-status.sql.
 */
export type Heard = Pick<
	StatusNowRow,
	'checkId' | 'place' | 'at' | 'ok' | 'durationMs' | 'detail'
> & { passed: number; failed: number };

export function readHeard(row: Wire<Heard>): Heard {
	return {
		checkId: row.check_id,
		place: row.place,
		at: new Date(row.at),
		ok: row.ok,
		durationMs: row.duration_ms,
		detail: row.detail,
		passed: row.passed,
		failed: row.failed,
	};
}

/** A broadcast's payload, `{ results: [...] }`; anything else is heard as nothing. */
export function readBroadcast(payload: unknown): Heard[] {
	const results = (payload as { results?: unknown } | null)?.results;
	return Array.isArray(results) ? results.map((row: Wire<Heard>) => readHeard(row)) : [];
}
