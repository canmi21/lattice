/**
 * No Postgres runs in this workspace's tests, so this holds the one thing that is checked
 * without one: every view's inferred row type carries the columns the page reads. See
 * spec/architecture/probe.md, "The page reads PostgREST".
 */
import { getTableColumns, ViewBaseConfig } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { StatusCheckRow, StatusDailyRow, StatusHistoryRow, StatusNowRow } from './schema.ts';
import { checks, statusChecks, statusDaily, statusHistory, statusNow } from './schema.ts';

function tableColumnNames(table: Parameters<typeof getTableColumns>[0]): string[] {
	return Object.values(getTableColumns(table)).map((column) => column.name);
}

// A view's selection sits behind the symbol drizzle reads it through at query time -- not a
// public type, so this reaches for it directly rather than widening `view`'s own parameter type.
// A plain column carries `name`; an aliased expression -- every computed field on
// status_history -- carries `fieldAlias` instead. Either is the SQL name the page reads.
function viewColumnNames(view: object): string[] {
	const config = (view as Record<typeof ViewBaseConfig, { selectedFields: object }>)[
		ViewBaseConfig
	];
	return Object.values(config.selectedFields).map((column) => {
		const field = column as { name?: string; fieldAlias?: string };
		return field.name ?? field.fieldAlias ?? '';
	});
}

const MIGRATIONS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'migrations');

function migrationsText(): string {
	return readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith('.sql'))
		.map((name) => readFileSync(join(MIGRATIONS, name), 'utf8'))
		.join('\n');
}

describe('the probe schema', () => {
	it('enables row-level security on every table, and grants anon nothing on them', () => {
		const sql = migrationsText();
		for (const table of ['checks', 'results', 'rollups']) {
			expect(sql).toMatch(new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
		}
		expect(sql).toMatch(/revoke all on table "checks", "results", "rollups" from anon/);
	});

	it('grants anon select on every view and nothing else', () => {
		const sql = migrationsText();
		const views = '"status_checks", "status_now", "status_history", "status_daily"';
		expect(sql).toContain(`revoke all on table ${views}\n\tfrom anon, authenticated;`);
		expect(sql).toContain(`grant select on ${views} to anon;`);
	});

	it('names every existing check before the name is required', () => {
		const sql = migrationsText();
		const added = sql.indexOf('ALTER TABLE "checks" ADD COLUMN "name" text;');
		const filled = sql.indexOf('update "checks" set "name" = "id" where "name" is null;');
		const required = sql.indexOf('ALTER TABLE "checks" ALTER COLUMN "name" SET NOT NULL;');
		expect(added).toBeGreaterThan(-1);
		expect(filled).toBeGreaterThan(added);
		expect(required).toBeGreaterThan(filled);
	});

	it('broadcasts each insert into results once, publicly, on status', () => {
		const sql = migrationsText();
		expect(sql).toMatch(
			/after insert on "results"\s+referencing new table as inserted\s+for each statement/,
		);
		expect(sql).toMatch(/event => 'results',\s+topic => 'status',\s+private => false/);
		// Looked up when it fires, so a Postgres without Supabase's Realtime still takes inserts.
		expect(sql).toMatch(
			/to_regprocedure\('realtime\.send\(jsonb, text, text, boolean\)'\) is null/,
		);
		for (const field of ['check_id', 'place', 'at', 'ok', 'duration_ms', 'detail']) {
			expect(sql).toContain(`'${field}', last.${field}`);
		}
	});

	it('exposes every public column of checks through status_checks', () => {
		const check = {} as StatusCheckRow;
		check.id = 'geo';
		check.name = 'Geolocation';
		check.kind = 'api';
		check.target = 'geo';
		check.place = 'home';
		check.intervalSeconds = 1;
		check.updatedAt = new Date();
		expect(viewColumnNames(statusChecks)).toEqual(tableColumnNames(checks));
		expect(viewColumnNames(statusChecks)).toContain('name');
	});

	it('leaves staleness as data on status_now', () => {
		const now = {} as StatusNowRow;
		now.checkId = 'geo';
		now.place = 'home';
		now.at = new Date();
		now.intervalSeconds = 1;
		now.name = 'Geolocation';
		expect(viewColumnNames(statusNow)).toContain('name');
		expect(viewColumnNames(statusNow)).toContain('interval_seconds');
		expect(viewColumnNames(statusNow)).toContain('at');
	});

	it('gives raw rounds and every rollup grain the same shape on status_history', () => {
		const row = {} as StatusHistoryRow;
		row.grain = 'raw';
		row.bucketStart = new Date();
		row.passed = 1;
		row.failed = 0;
		row.medianMs = 12;
		row.worstMs = 12;
		expect(viewColumnNames(statusHistory)).toEqual([
			'check_id',
			'place',
			'grain',
			'bucket_start',
			'passed',
			'failed',
			'median_ms',
			'worst_ms',
		]);
	});

	it('sums each check per UTC day from the hourly rollups on status_daily', () => {
		const row = {} as StatusDailyRow;
		row.checkId = 'health.geo';
		row.place = 'home';
		row.day = '2026-09-29';
		row.passed = 17_280;
		row.failed = 0;
		expect(viewColumnNames(statusDaily)).toEqual(['check_id', 'place', 'day', 'passed', 'failed']);
		const sql = migrationsText();
		expect(sql).toMatch(/CREATE VIEW "public"."status_daily"/);
		expect(sql).toContain(`where "rollups"."grain" = '1h'`);
		expect(sql).toContain(`("rollups"."bucket_start" at time zone 'UTC')::date as day`);
	});
});
