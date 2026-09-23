/**
 * The authored database: what a person wrote, and what was bought for it.
 *
 * One of the two halves the boundary in spec/todo/milestones.md draws -- the other is the reader
 * state in the cloud, and the two never share a database, so that restoring one can never
 * overwrite the other. Nothing here is recomputable, which is why the file it lives in is the
 * thing a backup is for.
 *
 * Two layers of metadata, split by one question: would this still be true of different bytes of
 * the same thing? Yes puts it on the resource, no puts it on the content.
 */
import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * A thing, named by an id we granted rather than by its bytes.
 *
 * `layers` is the type chain's own shape kept as written -- one key per segment of `type`, each
 * carrying its version -- because that is what lets a reader stop at the deepest segment it
 * knows. A field is a column here only when something queries or orders by it, and then it is
 * not also in the JSON: one fact, one place.
 */
export const resources = sqliteTable('resource', {
	id: text('id').primaryKey(),
	// Null while an id is reserved and its thing is not yet one: a draft has an identity from the
	// first keystroke and a type only once somebody has decided what they are writing. A missing
	// leaf is better than a wrong one, which resource.md already says about the deeper segments.
	type: text('type'),
	created: text('created').notNull(),
	updated: text('updated').notNull(),
	canonical: text('canonical'),
	layers: text('layers', { mode: 'json' }).notNull(),
});

/**
 * A run of bytes. Rows are added and never updated, because a cid is what its bytes hash to.
 *
 * What lives here is what a different original invalidates anyway -- dimensions, a thumbhash, a
 * colour space, camera data -- and all of it can be derived again from the bytes.
 */
export const contents = sqliteTable('content', {
	cid: text('cid').primaryKey(),
	mime: text('mime').notNull(),
	bytes: integer('bytes').notNull(),
	created: text('created').notNull(),
	layers: text('layers', { mode: 'json' }).notNull(),
});

/**
 * Which contents a resource holds, and as what.
 *
 * A resource holds several at once rather than replacing one with the next: an icon is a light
 * file and a dark one, a photograph keeps the scan it arrived as beside the better scan. `slot`
 * says which role, `seq` orders the ones sharing a role.
 */
export const resourceContents = sqliteTable(
	'resource_content',
	{
		resource: text('resource')
			.notNull()
			.references(() => resources.id),
		cid: text('cid')
			.notNull()
			.references(() => contents.cid),
		slot: text('slot').notNull(),
		seq: integer('seq').notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.resource, table.slot, table.seq] }),
		index('resource_content_by_cid').on(table.cid),
	],
);

/**
 * A variant and the original it was made from.
 *
 * Rows rather than a list inside `content.layers`, because the sweep has to see them: a cid held
 * alive only by a JSON array is reachable to nothing that does not parse JSON, and implicit
 * knowledge is what the reference table exists to remove.
 */
export const contentDerivations = sqliteTable(
	'content_derived',
	{
		source: text('source')
			.notNull()
			.references(() => contents.cid),
		cid: text('cid')
			.notNull()
			.references(() => contents.cid),
		format: text('format').notNull(),
		width: integer('width'),
		quality: real('quality'),
	},
	(table) => [primaryKey({ columns: [table.source, table.cid] })],
);

/**
 * Every per-locale string somebody wrote or paid a model for, whatever owns it.
 *
 * One table because the provenance is already identical in the two records this replaces: a
 * picture's description and a tag's display label both carry the provider, the model, the moment,
 * the seconds and the tokens. What it buys is that "what has this corpus cost, and what is
 * waiting for review" is a query rather than a walk over two files.
 */
export const texts = sqliteTable(
	'text',
	{
		ownerKind: text('owner_kind').notNull(),
		ownerId: text('owner_id').notNull(),
		field: text('field').notNull(),
		locale: text('locale').notNull(),
		body: text('body').notNull(),
		provider: text('provider'),
		model: text('model'),
		at: text('at'),
		seconds: real('seconds'),
		tokens: integer('tokens'),
		review: integer('review', { mode: 'boolean' }).notNull().default(false),
	},
	(table) => [primaryKey({ columns: [table.ownerKind, table.ownerId, table.field, table.locale] })],
);

/** What a tag is, as opposed to what it is called -- the labels are rows in `text`. */
export const tags = sqliteTable('tag', {
	name: text('name').primaryKey(),
	kind: text('kind').notNull(),
	meaning: text('meaning'),
	source: text('source'),
	// The label when it is the same in every language -- a product name, mostly. A tag whose label
	// was translated has a row per locale in `text` instead, and never both.
	display: text('display'),
});

export const resourceTags = sqliteTable(
	'resource_tag',
	{
		resource: text('resource')
			.notNull()
			.references(() => resources.id),
		tag: text('tag')
			.notNull()
			.references(() => tags.name),
	},
	(table) => [primaryKey({ columns: [table.resource, table.tag] })],
);

/**
 * What a `document.article` carries beyond being a resource, which is now only where its text is.
 *
 * Both dates it used to hold are gone, because both are derived: what a reader is shown as the
 * publication is the first revision's moment and what they would be shown as the update is the
 * latest one's. Storing either would be the same fact in two places, and the copy is the one that
 * goes stale. `sourceFile` is the transitional binding to markdown somebody still edits by hand.
 */
export const documents = sqliteTable('document', {
	resource: text('resource')
		.primaryKey()
		.references(() => resources.id),
	sourceFile: text('source_file'),
});

/**
 * What a `media.*` resource carries beyond being a resource, and a person wrote all of it.
 *
 * The twin of `documents`: a column exists here because something orders or filters by it, and
 * the rest of what is known about a picture stays in the layers. `excerpt` is the window a person
 * chose out of a clip, which nothing can derive from the bytes.
 */
export const media = sqliteTable('media', {
	resource: text('resource')
		.primaryKey()
		.references(() => resources.id),
	category: text('category'),
	sourceUrl: text('source_url'),
	sourceLabel: text('source_label'),
	// A pair, `{ from, to }` in seconds: the window somebody chose out of a clip, which nothing
	// derives from the bytes. JSON rather than two columns because nothing orders by either half.
	excerpt: text('excerpt', { mode: 'json' }),
});

/**
 * Where a resource is addressed, and where it used to be.
 *
 * The current row is the one with no `until`, and a partial unique index is what holds that to
 * one per resource. A redirect is therefore a fact in this table rather than something somebody
 * remembered to write down when they moved an article.
 */
export const paths = sqliteTable(
	'path',
	{
		resource: text('resource')
			.notNull()
			.references(() => resources.id),
		path: text('path').notNull(),
		since: text('since').notNull(),
		until: text('until'),
	},
	(table) => [
		primaryKey({ columns: [table.resource, table.since] }),
		uniqueIndex('path_current')
			.on(table.resource)
			.where(sql`until is null`),
		index('path_by_path').on(table.path),
	],
);

/**
 * A draft: one mutable row per identity, and the only mutable text there is.
 *
 * Writing starts by reserving an id and typing. Everything an article must have is optional here
 * -- `meta` is a bag whose fields are all absent until somebody decides them -- so a new file is
 * a cursor rather than a form. The row outlives publication and is the working copy from then on,
 * because what makes an article published is a revision existing and not this row being gone.
 */
export const drafts = sqliteTable('draft', {
	resource: text('resource')
		.primaryKey()
		.references(() => resources.id),
	body: text('body').notNull().default(''),
	meta: text('meta', { mode: 'json' }).notNull().default({}),
	created: text('created').notNull(),
	updated: text('updated').notNull(),
});

/**
 * One row per publication, numbered from one. Editing a draft is not a revision.
 *
 * Stored as reverse deltas: the newest row carries `cid`, the object the site actually serves,
 * and every older row carries the patch that walks one step back from the row after it. So the
 * version being read costs nothing to assemble, and history costs a patch rather than a copy.
 * `composed` is the cid the reconstruction must hash to -- a checksum the content addressing
 * hands over free, and one that outlives the object itself being swept.
 */
export const revisions = sqliteTable(
	'revision',
	{
		resource: text('resource')
			.notNull()
			.references(() => resources.id),
		seq: integer('seq').notNull(),
		at: text('at').notNull(),
		cid: text('cid'),
		backDiff: text('back_diff'),
		composed: text('composed').notNull(),
		// The one date a person may set, because the first revision is what a reader is shown as the
		// publication and an article imported from elsewhere was published before it arrived here.
		// The lock is one-way and taken by hand: after it, this moment is settled.
		atLocked: integer('at_locked', { mode: 'boolean' }).notNull().default(false),
		// Per row rather than per database: changing how a patch is written is then a decision for
		// the next revision instead of a migration over every one already stored. The format is a
		// storage decision alone -- what a reader is shown is computed from two reconstructed texts
		// in their browser, at whatever granularity that display wants.
		format: text('format').notNull().default('dmp-1'),
		note: text('note'),
	},
	(table) => [
		primaryKey({ columns: [table.resource, table.seq] }),
		check('revision_head_or_patch', sql`(${table.cid} is null) <> (${table.backDiff} is null)`),
	],
);
