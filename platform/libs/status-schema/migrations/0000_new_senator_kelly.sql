CREATE TABLE "checks" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"place" text NOT NULL,
	"interval_seconds" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "checks_kind" CHECK ("checks"."kind" in ('dns', 'api', 'page', 'health'))
);
--> statement-breakpoint
ALTER TABLE "checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "results" (
	"check_id" text NOT NULL,
	"place" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"duration_ms" integer NOT NULL,
	"detail" text,
	CONSTRAINT "results_check_id_place_at_pk" PRIMARY KEY("check_id","place","at")
);
--> statement-breakpoint
ALTER TABLE "results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollups" (
	"check_id" text NOT NULL,
	"place" text NOT NULL,
	"grain" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"passed" integer NOT NULL,
	"failed" integer NOT NULL,
	"median_ms" integer NOT NULL,
	"worst_ms" integer NOT NULL,
	CONSTRAINT "rollups_check_id_place_grain_bucket_start_pk" PRIMARY KEY("check_id","place","grain","bucket_start"),
	CONSTRAINT "rollups_grain" CHECK ("rollups"."grain" in ('1m', '5m', '10m', '30m', '1h'))
);
--> statement-breakpoint
ALTER TABLE "rollups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollups" ADD CONSTRAINT "rollups_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE VIEW "public"."status_checks" AS (select "id", "kind", "target", "place", "interval_seconds", "updated_at" from "checks");--> statement-breakpoint
CREATE VIEW "public"."status_history" AS (
	select "results"."check_id", "results"."place", 'raw' as grain, "results"."at" as bucket_start,
		case when "results"."ok" then 1 else 0 end as passed,
		case when "results"."ok" then 0 else 1 end as failed,
		"results"."duration_ms" as median_ms, "results"."duration_ms" as worst_ms
	from "results"
	union all
	select "rollups"."check_id", "rollups"."place", "rollups"."grain", "rollups"."bucket_start",
		"rollups"."passed", "rollups"."failed", "rollups"."median_ms", "rollups"."worst_ms"
	from "rollups"
);--> statement-breakpoint
CREATE VIEW "public"."status_now" AS (select distinct on ("results"."check_id", "results"."place") "results"."check_id", "results"."place", "checks"."kind", "checks"."target", "checks"."interval_seconds", "results"."at", "results"."ok", "results"."duration_ms", "results"."detail" from "results" inner join "checks" on "checks"."id" = "results"."check_id" order by "results"."check_id", "results"."place", "results"."at" desc);