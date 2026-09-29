-- Not expressible in Drizzle: no GRANT/REVOKE API in drizzle-orm/pg-core (checked 0.45.2). A
-- fresh Supabase project's default privileges hand "anon" and "authenticated" full CRUD on every
-- new table in "public", so the tables are revoked from explicitly rather than left to that
-- default. See spec/architecture/probe.md, "Grants/RLS".
revoke all on table "checks", "results", "rollups" from anon, authenticated;

grant select on "status_checks", "status_now", "status_history" to anon;
