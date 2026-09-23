/**
 * Every call this client makes, in one module, against the prefix `local` owns.
 *
 * Paths are relative: the dev server forwards `/collection`, so the browser is always talking to
 * its own origin and there is no address here to go stale when this stops being a dev server.
 * See spec/architecture/local.md, "The HTTP shell is two runtimes and one address".
 *
 * The reads take a `fetch`, because they run in load functions as well: on the server that is
 * SvelteKit's, which `hooks.server.ts` points at `local`, and its answer is carried to the browser
 * so hydration does not ask again.
 */
import type { ParsedResource } from '@canmi/artifacts';
import type { Block, TocEntry } from '@canmi/artifacts/types';
import type { DraftMeta } from '@canmi/collection/article';

export type Draft = {
	resource: string;
	body: string;
	meta: DraftMeta;
	created: string;
	updated: string;
	/** Whether it has a revision. Only the list says; a draft read alone does not. */
	published?: boolean;
};

/** What taking back a draft answers with. See libs/collection/src/discard.ts. */
export type Discarded =
	| { discarded: true }
	| { discarded: false; refused: 'absent' | 'published' | 'referenced'; detail: string };

export type Revision = { seq: number; at: string; atLocked: boolean; note: string | null };

/** What `publish` answers with, which is either a revision or a reason there is not one. */
export type Publication =
	| { published: true; seq: number; cid: string; at: string }
	| { published: false; refused: string; detail: string; missing?: string[] };

type Fetch = typeof fetch;

async function call<T>(path: string, init?: RequestInit, fetcher: Fetch = fetch): Promise<T> {
	const response = await fetcher(`/collection${path}`, {
		...init,
		headers: init?.body ? { 'content-type': 'application/json' } : undefined,
	});
	// A refusal carries a body worth showing, so 409 is read rather than thrown. Anything else
	// that is not ok has no answer to display and is an error the page reports as one.
	if (!response.ok && response.status !== 409) {
		throw new Error(`${init?.method ?? 'GET'} ${path} answered ${response.status}`);
	}
	return (await response.json()) as T;
}

export const listDrafts = (fetcher?: Fetch) => call<Draft[]>('/drafts', undefined, fetcher);
export const readDraft = (rid: string, fetcher?: Fetch) =>
	call<Draft>(`/drafts/${rid}`, undefined, fetcher);
export const createDraft = () => call<{ resource: string }>('/drafts', { method: 'POST' });

export const saveDraft = (rid: string, body: string, meta: DraftMeta) =>
	call<Draft>(`/drafts/${rid}`, { method: 'PUT', body: JSON.stringify({ body, meta }) });

export const discardDraft = (rid: string) =>
	call<Discarded>(`/drafts/${rid}`, { method: 'DELETE' });

export const publishDraft = (rid: string) =>
	call<Publication>(`/drafts/${rid}/publish`, { method: 'POST', body: '{}' });

export const listRevisions = (rid: string, fetcher?: Fetch) =>
	call<Revision[]>(`/articles/${rid}/revisions`, undefined, fetcher);

/** The draft compiled the way the site compiles a published one. See architecture/local.md. */
export type Preview = {
	blocks: Block[];
	toc: TocEntry[];
	resources: Record<string, ParsedResource>;
};

export const previewDraft = (rid: string, fetcher?: Fetch) =>
	call<Preview>(`/drafts/${rid}/preview`, { method: 'POST', body: '{}' }, fetcher);

/** What a load that reads the article list declares, so a write can ask for it again. */
export const DRAFTS = 'collection:drafts';

/**
 * An article's address as the two things a writer chooses: the category, which is everything
 * before the last slash, and the slug after it. A path with no slash -- the homepage -- is a slug
 * with no category. The sidebar groups by the first and the details drawer edits both.
 */
export function splitPath(path: string | undefined): { category: string; slug: string } {
	if (!path) return { category: '', slug: '' };
	const cut = path.lastIndexOf('/');
	return cut < 0
		? { category: '', slug: path }
		: { category: path.slice(0, cut), slug: path.slice(cut + 1) };
}
