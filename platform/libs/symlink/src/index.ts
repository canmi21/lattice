/**
 * A fixed name, followed for a browser: the page asks the alias layer what the name means and
 * hands the browser that object, one hop instead of two. The mapping stays the alias layer's; a
 * page knows a name and nothing behind it. See spec/architecture/delivery.md, "A page follows the
 * name for the browser".
 */
import { PUBLICATION_DELAY, PUBLISHED, RESOLVED } from '@monoflake/cache';

/** An answer about this moment rather than about the corpus, so nothing may keep it. */
const NEVER = 'no-store';

function answer(status: number, cacheControl: string, location?: string): Response {
	const headers = new Headers({ 'Cache-Control': cacheControl });
	if (location) headers.set('Location', location);
	return new Response(null, { status, headers });
}

/**
 * Ask `name` -- a `/symlink/...` address on the alias layer -- and answer with where it points:
 * a `302` there while it resolves, a `404` while the corpus names nothing, a `502` otherwise.
 * Each is stamped as the alias layer stamps its own.
 */
export async function followSymlink(
	name: string,
	fetcher: typeof fetch = fetch,
): Promise<Response> {
	let asked: Response;
	try {
		asked = await fetcher(name, { redirect: 'manual' });
	} catch {
		return answer(502, NEVER);
	}
	const target = asked.headers.get('Location');
	if (asked.status >= 300 && asked.status < 400 && target) {
		return answer(302, RESOLVED, new URL(target, name).href);
	}
	if (asked.status === 404) return answer(404, PUBLISHED);
	return answer(502, NEVER);
}

/** Where a scope's file is named, `symlink` being where the alias layer answers fixed names. */
export function symlinkOf(symlink: string, scope: string, file: string): string {
	return `${symlink}/${scope}/${file}`;
}

/** What each name last resolved to, held as long as the alias layer says its answer may be. */
const resolved = new Map<string, { target: string; until: number }>();

/**
 * The address `name` stands for right now, or `undefined` while it resolves to nothing. For a page
 * that writes the object into its markup rather than redirecting to it; a failure is not kept.
 */
export async function resolveSymlink(
	name: string,
	fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
	const held = resolved.get(name);
	if (held && held.until > Date.now()) return held.target;
	const answered = await followSymlink(name, fetcher);
	const target = answered.headers.get('Location');
	if (answered.status !== 302 || !target) return undefined;
	resolved.set(name, { target, until: Date.now() + PUBLICATION_DELAY * 1000 });
	return target;
}

/** Each of `files` in `scope`, resolved together: what a head names its marks by. */
export async function marksOf<File extends string>(
	symlink: string,
	scope: string,
	files: readonly File[],
	fetcher: typeof fetch = fetch,
): Promise<Partial<Record<File, string>>> {
	const targets = await Promise.all(
		files.map((file) => resolveSymlink(symlinkOf(symlink, scope, file), fetcher)),
	);
	return Object.fromEntries(
		files.flatMap((file, index) => (targets[index] ? [[file, targets[index]]] : [])),
	) as Partial<Record<File, string>>;
}

/**
 * The bytes `name` stands for, answered from the asking origin rather than redirected to: for a
 * file a browser uses only from the document's own origin, such as a sitemap's XSL stylesheet. A
 * miss and a failure are answered as `followSymlink` answers them; the bytes are kept as the alias
 * layer keeps its redirect.
 */
export async function serveSymlink(
	name: string,
	contentType: string,
	fetcher: typeof fetch = fetch,
): Promise<Response> {
	const followed = await followSymlink(name, fetcher);
	const target = followed.headers.get('Location');
	if (followed.status !== 302 || !target) return followed;
	let object: Response;
	try {
		object = await fetcher(target);
	} catch {
		return answer(502, NEVER);
	}
	if (!object.ok) return answer(502, NEVER);
	return new Response(object.body, {
		status: 200,
		headers: { 'Content-Type': contentType, 'Cache-Control': RESOLVED },
	});
}
