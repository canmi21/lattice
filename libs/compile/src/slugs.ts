/**
 * What an article may be called, checked before anything is compiled.
 *
 * A slug is an article's identity: unique across the corpus whatever directory it sits in, so the
 * directory is where it lives rather than part of what it is. That is what lets a reader reach an
 * article by name alone, and what lets it be recategorised without the address dying. See
 * spec/architecture/artifacts.md, "A slug is the identity and the path is the address".
 *
 * Every rule here is refused at build time and none is reported later, because a corpus that
 * breaks one of them produces artifacts that are wrong rather than absent -- two articles sharing
 * a name resolve to whichever the lookup reaches first, silently.
 */
import { readdir } from 'node:fs/promises';

/** Letters and hyphens. No dots, because a dot is how this site tells a document from a page. */
const SHAPE = /^[a-z]+(?:-[a-z]+)+$/;

/**
 * Every literal name the site's own router answers for.
 *
 * Read from the route directory rather than listed here, so a route added tomorrow is compared
 * against the corpus tomorrow. Parameterised segments are skipped: `[...path]` is what articles
 * are served by and matches everything, which is precisely why the literals are what can shadow
 * one. Only the top level matters -- a slug is one segment, reached at `/{slug}`.
 */
export async function reservedNames(routes: string): Promise<Set<string>> {
	const entries = await readdir(routes, { withFileTypes: true });
	return new Set(
		entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
			.map((entry) => entry.name),
	);
}

/** The identity in a source path: its last segment, with the extension taken off. */
export function slugOf(file: string): string {
	return file.split('/').pop()?.replace(/\.md$/, '') ?? file;
}

/**
 * Refuse a corpus that cannot be addressed by name, naming every reason at once.
 *
 * All of them rather than the first: a build that fails once per run per problem costs a round
 * trip for each, and these are found together.
 */
export function refuseBadSlugs(files: readonly string[], reserved: ReadonlySet<string>): void {
	const problems: string[] = [];
	const seen = new Map<string, string>();

	for (const file of files) {
		const slug = slugOf(file);
		if (!SHAPE.test(slug)) {
			// The hyphen is not decoration. A single word is reserved for the site's own router, so
			// that `/{name}` can be answered without asking the corpus whether it meant an article.
			problems.push(
				`${file}: "${slug}" must be lowercase words joined by hyphens, and at least two`,
			);
		}
		if (reserved.has(slug)) {
			problems.push(`${file}: "${slug}" is a route this site already serves, which would win`);
		}
		const first = seen.get(slug);
		if (first) {
			problems.push(`${file}: "${slug}" is already the identity of ${first}`);
		} else {
			seen.set(slug, file);
		}
	}

	if (problems.length > 0) {
		throw new Error(`the corpus cannot be addressed by name:\n  ${problems.join('\n  ')}`);
	}
}
