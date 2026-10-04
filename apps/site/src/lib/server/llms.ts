/**
 * What `llms.txt` and `llms-full.txt` are built from, fetched once from the answers the pages use.
 * See spec/architecture/markdown.md, "The index".
 */
import { author } from '@canmi/me/identity';
import { profiles, telegramGroup } from '@canmi/social/structured';
import type { LlmsInput } from '#lib/documents/llms.js';
import { publishedHome, publishedMetadata, publishedSitemap } from '#lib/published/index.js';
import { site } from '#lib/site.js';

export async function llmsInput(fetch: typeof globalThis.fetch, now: Date): Promise<LlmsInput> {
	const [{ articles }, sitemap] = await Promise.all([
		publishedHome(fetch, 'mw'),
		publishedSitemap(fetch).catch(() => undefined),
	]);
	const tags = await Promise.all(
		articles.map((article) =>
			publishedMetadata(fetch, article.slug, 'mw').then(
				(found) => [article.slug, found?.locale.language_tag] as const,
				() => [article.slug, undefined] as const,
			),
		),
	);
	const languages = Object.fromEntries(
		tags.flatMap(([slug, tag]) => (tag ? [[slug, tag] as const] : [])),
	);
	return {
		articles,
		languages,
		site: { name: site.name, tagline: site.tagline },
		author: { name: author.name },
		profiles: profiles(),
		group: telegramGroup(),
		generated: sitemap?.generated,
		now,
	};
}
