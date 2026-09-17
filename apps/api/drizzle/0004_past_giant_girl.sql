-- Fold the rows the previous migration could not, now that the code keys by slug.
--
-- 0003 stripped the directory off every read counter, but it skipped a slug that already had a
-- row rather than merging into it. That is only safe if nothing can open one afterwards, and the
-- deploy order guarantees the opposite: migrations are applied before the Worker, so the old
-- path-keyed code kept running against rekeyed rows, missed its lookup, and opened a fresh row at
-- the address. Six of them, over fifty-four minutes.
--
-- This adds each stranded count onto the slug that owns it and then drops the row, so the total is
-- carried rather than chosen. Idempotent: once no slug contains a slash, both statements are
-- no-ops. See spec/engagement.md, "Schema before code is right until the migration changes a key".
UPDATE `article_reads`
SET `count` = `count` + COALESCE(
	(
		SELECT SUM(`stale`.`count`)
		FROM `article_reads` AS `stale`
		WHERE `stale`.`slug` LIKE '%/%'
		  AND REPLACE(`stale`.`slug`, RTRIM(`stale`.`slug`, REPLACE(`stale`.`slug`, '/', '')), '')
		      = `article_reads`.`slug`
	),
	0
)
WHERE `slug` NOT LIKE '%/%';
--> statement-breakpoint
DELETE FROM `article_reads` WHERE `slug` LIKE '%/%';
