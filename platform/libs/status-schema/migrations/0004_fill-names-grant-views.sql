-- Between the two generated halves of `checks.name`: 0003 adds it nullable and 0005 makes it
-- required, so a row the probe wrote before names existed is given its id here. The probe
-- upserts every declared check's own name when it next starts.
update "checks" set "name" = "id" where "name" is null;
--> statement-breakpoint
-- A fresh Supabase project's default privileges give anon and authenticated everything on a new
-- view too, and `status_checks` is simple enough to be written through, as its owner, past RLS.
-- So every view is revoked and then granted select alone. See 0001 for why this is by hand.
revoke all on table "status_checks", "status_now", "status_history", "status_daily"
	from anon, authenticated;
--> statement-breakpoint
grant select on "status_checks", "status_now", "status_history", "status_daily" to anon;
