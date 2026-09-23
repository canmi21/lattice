/**
 * The collection half of `local`, which answers whatever the Rust half forwards.
 *
 * It listens on a unix socket and has no address: the path arrives in the environment, the parent
 * process made it, and the parent kills this one on the way out. Nothing off this machine can
 * reach it, which is why there is no credential here -- see spec/architecture/local.md, and
 * spec/todo/milestones.md for what changes when this surface goes online.
 *
 * Handlers are the only thing here. The schema and its queries are `@canmi/collection`, because
 * the same declarations run over D1 later and a second copy would be the thing that drifts.
 */
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { drafts as draftRows, resources } from '@canmi/collection/source';
import { openSource, SOURCE_FILE } from '@canmi/collection/open';
import { allocate } from '@canmi/collection/allocate';
import { dates, publish, textAt } from '@canmi/collection/revise';
import { fileStore, OBJECTS_DIR } from '@canmi/collection/store';
import { revisions } from '@canmi/collection/source';
import { asc, eq } from 'drizzle-orm';
import { join } from 'node:path';

const socket = process.env.COLLECTION_SOCKET;
const repository = process.env.COLLECTION_REPOSITORY;
if (!socket || !repository) throw new Error('COLLECTION_SOCKET and COLLECTION_REPOSITORY are the way in');

const database = openSource(join(repository, SOURCE_FILE));
// Bytes live beside the database and not in it, so this half holds both halves of a content.
const store = fileStore(join(repository, OBJECTS_DIR));

type Answer = { status: number; body: unknown };

const now = () => new Date().toISOString();

/** Every route this half owns, matched on the method and the path the Rust half forwarded. */
async function answer(method: string, path: string, body: string): Promise<Answer> {
	const rid = /^\/collection\/drafts\/([0-9a-z]{5})$/.exec(path)?.[1];
	const article = /^\/collection\/articles\/([0-9a-z]{5})(\/revisions(?:\/(\d+))?)?$/.exec(path);

	if (method === 'GET' && path === '/collection/drafts') {
		return { status: 200, body: await database.select().from(draftRows) };
	}

	// Creating a draft is reserving an identity: a row in `resource` with no type, because nobody
	// has said what this will be, and an empty draft against it. See spec/todo/milestones.md.
	if (method === 'POST' && path === '/collection/drafts') {
		const id = await allocate(database);
		const at = now();
		await database.insert(resources).values({ id, created: at, updated: at, layers: {} });
		await database.insert(draftRows).values({ resource: id, body: '', meta: {}, created: at, updated: at });
		return { status: 201, body: { resource: id } };
	}

	if (rid && method === 'GET') {
		const [held] = await database.select().from(draftRows).where(eq(draftRows.resource, rid));
		return held ? { status: 200, body: held } : { status: 404, body: { error: 'no such draft' } };
	}

	// Saving is an update and never an insert: a draft has no versions, so there is one row and it
	// is this one. What the editor holds between saves is the browser's business.
	if (rid && method === 'PUT') {
		const sent = JSON.parse(body || '{}') as { body?: string; meta?: unknown };
		const changed = await database
			.update(draftRows)
			.set({ body: sent.body ?? '', meta: sent.meta ?? {}, updated: now() })
			.where(eq(draftRows.resource, rid))
			.returning();
		return changed.length > 0
			? { status: 200, body: changed[0] }
			: { status: 404, body: { error: 'no such draft' } };
	}

	// Publishing is what makes a draft an article, so it is a verb on the draft rather than a
	// write to some article that does not exist yet. A refusal is a 409: the request was
	// well-formed and the collection declined it, which is what the editor has to show.
	if (method === 'POST' && /^\/collection\/drafts\/[0-9a-z]{5}\/publish$/.test(path)) {
		const id = path.slice('/collection/drafts/'.length, -'/publish'.length);
		const sent = JSON.parse(body || '{}') as { at?: string; note?: string };
		const done = await publish(database, store, id, sent);
		return { status: done.published ? 201 : 409, body: done };
	}

	// What a reader would be shown as the publication and the update, which are the ends of the
	// chain and are stored nowhere else.
	if (article && method === 'GET' && !article[2]) {
		const held = await dates(database, article[1]!);
		return held ? { status: 200, body: held } : { status: 404, body: { error: 'nothing published' } };
	}

	if (article && method === 'GET' && article[2] && !article[3]) {
		const held = await database
			.select({ seq: revisions.seq, at: revisions.at, atLocked: revisions.atLocked, note: revisions.note })
			.from(revisions)
			.where(eq(revisions.resource, article[1]!))
			.orderBy(asc(revisions.seq));
		return { status: 200, body: held };
	}

	if (article && method === 'GET' && article[3]) {
		const text = await textAt(database, store, article[1]!, Number(article[3]));
		return { status: 200, body: { seq: Number(article[3]), text } };
	}

	return { status: 404, body: { error: `nothing answers ${method} ${path}` } };
}

const server = createServer((request, response) => {
	const chunks: Buffer[] = [];
	request.on('data', (chunk: Buffer) => chunks.push(chunk));
	request.on('end', () => {
		answer(request.method ?? 'GET', request.url ?? '/', Buffer.concat(chunks).toString('utf8'))
			.then(({ status, body }) => {
				response.writeHead(status, { 'content-type': 'application/json' });
				response.end(JSON.stringify(body));
			})
			.catch((failure: unknown) => {
				// Said rather than swallowed: the parent forwards this body, so a person sees it.
				response.writeHead(500, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: String(failure) }));
			});
	});
});

rmSync(socket, { force: true });
server.listen(socket, () => console.log(`collection listening on ${socket}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		server.close();
		rmSync(socket, { force: true });
		process.exit(0);
	});
}
