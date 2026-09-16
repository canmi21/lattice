/**
 * The site identity the published documents carry.
 *
 * `$lib/site` reads it through `virtual:site`, which is a Vite module and so out of reach of a
 * program run by bare node. Same file, same parser, one spelling of the shape.
 */
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

export type SiteFacts = {
	name: string;
	tagline: string;
	author: { name: string; email: string };
	feed: { id: string; followDescription: string };
};

export async function readSiteFacts(file: string): Promise<SiteFacts> {
	const { name, tagline, author, feed } = parseYaml(
		await readFile(file, 'utf8'),
	) as Partial<SiteFacts>;
	if (!name || !tagline) throw new Error(`${file}: name and tagline are required to publish`);
	if (!author?.name || !author.email) {
		throw new Error(`${file}: author.name and author.email are required to publish`);
	}
	if (!feed?.id || !feed.followDescription) {
		throw new Error(`${file}: feed.id and feed.followDescription are required to publish`);
	}
	return {
		name,
		tagline,
		author: { name: author.name, email: author.email },
		feed: { id: feed.id, followDescription: feed.followDescription },
	};
}
