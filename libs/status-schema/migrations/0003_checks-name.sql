DROP VIEW "public"."status_checks";--> statement-breakpoint
DROP VIEW "public"."status_now";--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "name" text;--> statement-breakpoint
CREATE VIEW "public"."status_daily" AS (
	select "rollups"."check_id", "rollups"."place",
		("rollups"."bucket_start" at time zone 'UTC')::date as day,
		sum("rollups"."passed")::integer as passed, sum("rollups"."failed")::integer as failed
	from "rollups"
	where "rollups"."grain" = '1h'
		and "rollups"."bucket_start" >= ((now() at time zone 'UTC')::date - 89) at time zone 'UTC'
	group by 1, 2, 3
);--> statement-breakpoint
CREATE VIEW "public"."status_checks" AS (select "id", "name", "kind", "target", "place", "interval_seconds", "updated_at" from "checks");--> statement-breakpoint
CREATE VIEW "public"."status_now" AS (select distinct on ("results"."check_id", "results"."place") "results"."check_id", "results"."place", "checks"."name", "checks"."kind", "checks"."target", "checks"."interval_seconds", "results"."at", "results"."ok", "results"."duration_ms", "results"."detail" from "results" inner join "checks" on "checks"."id" = "results"."check_id" order by "results"."check_id", "results"."place", "results"."at" desc);