/**
 * Every call this client makes, in one module, against the prefix `local` owns.
 *
 * Paths are relative: the dev server forwards `/collection`, so the browser is always talking to
 * its own origin and there is no address here to go stale when this stops being a dev server.
 * See spec/architecture/local.md, "The HTTP shell is two runtimes and one address".
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
};

export type Revision = { seq: number; at: string; atLocked: boolean; note: string | null };

/** What `publish` answers with, which is either a revision or a reason there is not one. */
export type Publication =
	| { published: true; seq: number; cid: string; at: string }
	| { published: false; refused: string; detail: string; missing?: string[] };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`/collection${path}`, {
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

export const listDrafts = () => call<Draft[]>('/drafts');
export const readDraft = (rid: string) => call<Draft>(`/drafts/${rid}`);
export const createDraft = () => call<{ resource: string }>('/drafts', { method: 'POST' });

export const saveDraft = (rid: string, body: string, meta: DraftMeta) =>
	call<Draft>(`/drafts/${rid}`, { method: 'PUT', body: JSON.stringify({ body, meta }) });

export const publishDraft = (rid: string) =>
	call<Publication>(`/drafts/${rid}/publish`, { method: 'POST', body: '{}' });

export const listRevisions = (rid: string) => call<Revision[]>(`/articles/${rid}/revisions`);

/** The draft compiled the way the site compiles a published one. See architecture/local.md. */
export type Preview = {
	blocks: Block[];
	toc: TocEntry[];
	resources: Record<string, ParsedResource>;
};

export const previewDraft = (rid: string) =>
	call<Preview>(`/drafts/${rid}/preview`, { method: 'POST', body: '{}' });
