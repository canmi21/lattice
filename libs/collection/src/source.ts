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
	type: text('type').notNull(),
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
 * What a `document.post` carries beyond being a resource.
 *
 * `sourceFile` is the binding between a rid and the markdown somebody is still editing by hand,
 * and it is also how a draft is found while that lasts: a value means the draft is that file, and
 * null means it is a row in `draft`. `modifiedLocked` is the one field allowed to lie, and only
 * about `modified` -- the honest record of every publication is in `revision`.
 */
export const documents = sqliteTable('document', {
	resource: text('resource')
		.primaryKey()
		.references(() => resources.id),
	sourceFile: text('source_file'),
	published: text('published'),
	modified: text('modified').notNull(),
	modifiedLocked: integer('modified_locked', { mode: 'boolean' }).notNull().default(false),
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
 * The one mutable text in this database, and the reason nothing else has to be.
 *
 * A draft changes on every keystroke and has no history anybody wants, so making it a content
 * would allocate an immutable object per save and leave the sweep to clean up after typing. It
 * becomes a content at publication and not before.
 */
export const drafts = sqliteTable(
	'draft',
	{
		resource: text('resource')
			.notNull()
			.references(() => resources.id),
		slot: text('slot').notNull(),
		body: text('body').notNull(),
		updated: text('updated').notNull(),
	},
	(table) => [primaryKey({ columns: [table.resource, table.slot] })],
);

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
