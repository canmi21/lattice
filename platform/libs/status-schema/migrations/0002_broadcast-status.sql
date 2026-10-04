-- Not expressible in Drizzle: no trigger or function API in drizzle-orm/pg-core (checked 0.45.2).
-- Each insert into "results" -- the probe writes one statement per batch -- is broadcast once on
-- the public Realtime channel "status", event "results", carrying each check's latest round in the
-- batch and the batch's passed and failed counts for it. See spec/architecture/probe.md, "The page
-- reads PostgREST with the anon key, from views alone, once; after that it is told".
--
-- `realtime.send` is looked up when the trigger fires, not when this runs: a plain Postgres, as the
-- probe's own tests use, has no "realtime" schema, and there the insert goes on with nothing sent.
-- plpgsql resolves a statement only when it first reaches it, so the call below is never planned
-- where the function is missing. `realtime.send` itself catches its own failures and raises a
-- warning, so a broadcast that cannot be sent never fails the probe's write.
create function "status_broadcast"() returns trigger
language plpgsql
set search_path = ''
as $$
declare
	latest jsonb;
begin
	if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
		return null;
	end if;
	select jsonb_agg(jsonb_build_object(
		'check_id', last.check_id,
		'place', last.place,
		'at', last.at,
		'ok', last.ok,
		'duration_ms', last.duration_ms,
		'detail', last.detail,
		'passed', last.passed,
		'failed', last.failed
	) order by last.check_id, last.place)
	into latest
	from (
		select distinct on (inserted.check_id, inserted.place)
			inserted.check_id, inserted.place, inserted.at, inserted.ok, inserted.duration_ms,
			inserted.detail,
			count(*) filter (where inserted.ok)
				over (partition by inserted.check_id, inserted.place) as passed,
			count(*) filter (where not inserted.ok)
				over (partition by inserted.check_id, inserted.place) as failed
		from inserted
		order by inserted.check_id, inserted.place, inserted.at desc
	) as last;
	-- `on conflict do nothing` can insert nothing, and nothing is not news.
	if latest is null then
		return null;
	end if;
	perform realtime.send(
		payload => jsonb_build_object('results', latest),
		event => 'results',
		topic => 'status',
		private => false
	);
	return null;
end;
$$;
--> statement-breakpoint
create trigger "results_broadcast"
after insert on "results"
referencing new table as inserted
for each statement
execute function "status_broadcast"();
