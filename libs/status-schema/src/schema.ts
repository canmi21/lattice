/**
 * The probe's schema, declared once and applied by the Rust probe through sqlx.
 *
 * See spec/architecture/probe.md, "The schema: declared once, in Drizzle, applied by the probe".
 * Tables are the probe's alone; the three views at the bottom are the only surface `anon` reads,
 * and RLS with no policies is what keeps a table unreadable to everyone but its owner.
 */
import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	integer,
	pgTable,
	pgView,
	primaryKey,
	QueryBuilder,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

/** A declared check: what is asked, of what, how often, and from where. */
export const checks = pgTable(
	'checks',
	{
		id: text('id').primaryKey(),
		kind: text('kind').notNull(),
		target: text('target').notNull(),
		place: text('place').notNull(),
		intervalSeconds: integer('interval_seconds').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [check('checks_kind', sql`${table.kind} in ('dns', 'api', 'page', 'health')`)],
).enableRLS();

/**
 * One row per round, kept for the last ten minutes before it is thinned into `rollups`.
 * `detail` is a short public reason ("status 502"), never anything private.
 */
export const results = pgTable(
	'results',
	{
		checkId: text('check_id')
			.notNull()
			.references(() => checks.id),
		place: text('place').notNull(),
		at: timestamp('at', { withTimezone: true }).notNull(),
		ok: boolean('ok').notNull(),
		durationMs: integer('duration_ms').notNull(),
		detail: text('detail'),
	},
	(table) => [primaryKey({ columns: [table.checkId, table.place, table.at] })],
).enableRLS();

/**
 * One table for every grain rather than five: thinning and the 300 MB budget rule both become one
 * `DELETE ... WHERE grain = $1 AND bucket_start < $2`, and the probe measures one table's size
 * instead of five. See spec/architecture/probe.md, "Where the results go".
 */
export const rollups = pgTable(
	'rollups',
	{
		checkId: text('check_id')
			.notNull()
			.references(() => checks.id),
		place: text('place').notNull(),
		grain: text('grain').notNull(),
		bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
		passed: integer('passed').notNull(),
		failed: integer('failed').notNull(),
		medianMs: integer('median_ms').notNull(),
		worstMs: integer('worst_ms').notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.checkId, table.place, table.grain, table.bucketStart] }),
		check('rollups_grain', sql`${table.grain} in ('1m', '5m', '10m', '30m', '1h')`),
	],
).enableRLS();

// A view is built with its own query-builder rather than a live `db`, since drizzle-kit generate
// runs against schema.ts alone. See spec/architecture/probe.md, "The page reads PostgREST".
const qb = new QueryBuilder();

/** Public columns of a declared check -- everything on it is public today. */
export const statusChecks = pgView('status_checks').as(() => qb.select().from(checks));

/**
 * Each check's latest round per place. Staleness is left as data -- `at` and `intervalSeconds` --
 * so the page judges it rather than the database.
 */
export const statusNow = pgView('status_now').as(() =>
	qb
		.selectDistinctOn([results.checkId, results.place], {
			checkId: results.checkId,
			place: results.place,
			kind: checks.kind,
			target: checks.target,
			intervalSeconds: checks.intervalSeconds,
			at: results.at,
			ok: results.ok,
			durationMs: results.durationMs,
			detail: results.detail,
		})
		.from(results)
		.innerJoin(checks, sql`${checks.id} = ${results.checkId}`)
		.orderBy(results.checkId, results.place, sql`${results.at} desc`),
);

/**
 * Raw rounds and every rollup grain, in one shape. `results` becomes grain `'raw'`, its own
 * bucket collapsed to the round it is -- one pass, one median, one worst.
 *
 * Columns are declared explicitly rather than inferred from a query builder: the union's two
 * arms are typed too differently for `unionAll` to unify (a `QueryBuilder`-mode select against
 * a `PgSetOperatorInterface`, in drizzle-orm 0.45.2), so the query is one hand-written `SQL`.
 */
export const statusHistory = pgView('status_history', {
	checkId: text('check_id').notNull(),
	place: text('place').notNull(),
	grain: text('grain').notNull(),
	bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
	passed: integer('passed').notNull(),
	failed: integer('failed').notNull(),
	medianMs: integer('median_ms').notNull(),
	worstMs: integer('worst_ms').notNull(),
}).as(sql`
	select ${results.checkId}, ${results.place}, 'raw' as grain, ${results.at} as bucket_start,
		case when ${results.ok} then 1 else 0 end as passed,
		case when ${results.ok} then 0 else 1 end as failed,
		${results.durationMs} as median_ms, ${results.durationMs} as worst_ms
	from ${results}
	union all
	select ${rollups.checkId}, ${rollups.place}, ${rollups.grain}, ${rollups.bucketStart},
		${rollups.passed}, ${rollups.failed}, ${rollups.medianMs}, ${rollups.worstMs}
	from ${rollups}
`);

export type StatusCheckRow = typeof statusChecks.$inferSelect;
export type StatusNowRow = typeof statusNow.$inferSelect;
export type StatusHistoryRow = typeof statusHistory.$inferSelect;
