-- The read counter is keyed by an article's identity, not by where it currently lives.
--
-- A slug is unique across the corpus whatever directory holds it, so `mirror/less-than-an-hour`
-- and `less-than-an-hour` name the same article. Keying by the path meant the count was attached
-- to the address: recategorising an article opened a fresh row at zero and orphaned everything it
-- had earned, silently, with nothing reporting it. Six rows carried between 340 and 9,795 reads
-- when this was written.
--
-- `instr` finds the first separator and `rtrim`-by-reverse is unavailable here, so the last
-- segment is taken by trimming every character up to and including the final `/`. Paths in this
-- corpus are one directory deep; the `REPLACE` form below is correct for any depth because it
-- works from the right.
--
-- `OR IGNORE`-style safety is not available for UPDATE, so the collision case is excluded
-- instead: if a bare slug row somehow already exists, the prefixed one is left alone rather than
-- overwriting it, and the two are reconciled by hand. That cannot happen with the build check in
-- place, and this migration predates trusting it.
UPDATE `article_reads`
SET `slug` = REPLACE(`slug`, RTRIM(`slug`, REPLACE(`slug`, '/', '')), '')
WHERE `slug` LIKE '%/%'
	AND REPLACE(`slug`, RTRIM(`slug`, REPLACE(`slug`, '/', '')), '') NOT IN (
		SELECT `slug` FROM `article_reads`
	);
