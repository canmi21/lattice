/**
 * Where this app files an object and what the platform's store serves it as have to agree: the two
 * are written in two languages and two repositories, and these read the Rust here against
 * `@monoflake/sdk/store` as published. They lived beside the store until the repositories split;
 * the store cannot read this app, and this app can read the store.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { contentTypeFor, storageKey } from '@monoflake/sdk/store';

/** A source file of this app, read for what it declares rather than for what it does. */
function cms(path: string): string {
	return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url).href), 'utf8');
}

/**
 * The favicon round trip, which crosses the language boundary twice and was held by nothing.
 *
 * `apps/local/src/favicon/fetch.rs` names a content type from a URL when the server
 * declares none, `apps/local/src/extension.rs` turns that into the extension the file is
 * stored under, and `contentTypeFor` turns that back into what a browser is served. A leg that does
 * not close is an icon that downloads instead of drawing. Both Rust ends are read rather than
 * restated.
 */
describe('the loop an icon travels', () => {
	const ID = '44b6081deaf0242ca3bf83d62a3b6c95';

	const EXTENSION_RS = cms('src/extension.rs');
	const FETCH_RS = cms('src/favicon/fetch.rs');

	// `JPEG` is a constant on the Rust side rather than a literal, because both naming paths there
	// have to share one spelling. An arm naming it resolves to whatever that constant holds.
	const JPEG = /const JPEG: &str = "([a-z]+)";/.exec(EXTENSION_RS)?.[1];

	/** Every extension an icon is stored under, in the order `ICON_EXTENSIONS` tries them. */
	const stored = /pub const ICON_EXTENSIONS: \[&str; \d+\] = \[([^\]]*)\]/
		.exec(EXTENSION_RS)?.[1]
		?.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => (entry === 'JPEG' ? JPEG : entry.replaceAll('"', '')));

	/** `for_icon`'s chain: the substrings each arm looks for, and what it stores the file as. */
	const chain = [...EXTENSION_RS.matchAll(/if ([^{]+)\{\s*Some\((?:"([a-z]+)"|JPEG)\)/g)].map(
		(arm) => ({
			needles: [...arm[1]!.matchAll(/contains\("([a-z]+)"\)/g)].map((found) => found[1]!),
			extension: arm[2] ?? JPEG,
		}),
	);

	/** What `for_icon` answers, by the rules read out of it rather than by a copy of them. */
	function forIcon(contentType: string): string | undefined {
		const lower = contentType.toLowerCase();
		return chain.find((arm) => arm.needles.some((needle) => lower.includes(needle)))?.extension;
	}

	/** `infer_content_type`'s arms: the URL extensions it recognizes, and the type each names. */
	const inferred = [...FETCH_RS.matchAll(/\(\) if ([^=]+)=> "([a-z0-9/+.-]+)"/g)].map((arm) => ({
		extensions: [...arm[1]!.matchAll(/ends_with\("\.([a-z0-9]+)"\)/g)].map((found) => found[1]!),
		contentType: arm[2]!,
	}));

	it('serves every extension apps/local stores an icon under', () => {
		expect(JPEG, 'the JPEG constant moved in apps/local').toBeDefined();
		expect(stored, 'ICON_EXTENSIONS moved or changed shape in apps/local').toBeDefined();
		expect(chain.length, 'for_icon moved or changed shape in apps/local').toBeGreaterThan(0);

		for (const extension of stored!) {
			const contentType = contentTypeFor(`44/b6/${ID}.${extension}`);
			// The fallback is the failure: a browser hands the user a download instead of an icon.
			expect(contentType, `an icon is stored as .${extension} and served as nothing`).not.toBe(
				'application/octet-stream',
			);
			// And it has to be the type that names this same extension again, or the two legs
			// disagree about which file the bytes are: stored as one thing, served as another.
			expect(forIcon(contentType), `.${extension} is served as ${contentType}`).toBe(extension);
		}
	});

	it('stores every type the fetcher invents when a server declares none', () => {
		expect(
			inferred.length,
			'infer_content_type moved or changed shape in apps/local',
		).toBeGreaterThan(0);

		for (const arm of inferred.filter((found) => found.contentType.startsWith('image/'))) {
			// An extension the fetcher reads off a URL, turned into a type, has to be a type the
			// store side accepts -- otherwise the icon is fetched and then dropped for its name.
			expect(stored, `${arm.contentType} is inferred from a URL but never stored`).toContain(
				forIcon(arm.contentType),
			);
			expect(arm.extensions.length).toBeGreaterThan(0);
		}
	});
});

/**
 * The two declarations of the layout, held together.
 *
 * apps/local writes what the workers read, so the two have to agree about where an object
 * lands. They did not once: clips were given a path on the writing side and no key on the reading
 * side, and four rung URLs answered 404 while the files sat on disk. This is the test that fails
 * instead. Read off the Rust source rather than restated, so a change there has to come here.
 */
it('files an object exactly where apps/local writes it', () => {
	const source = readFileSync(
		fileURLToPath(new URL('./image/store.rs', import.meta.url).href),
		'utf8',
	);
	const body = /fn object_path\([^)]*\) -> PathBuf \{([\s\S]*?)\n\}/.exec(source);
	expect(body, 'object_path moved or changed shape in apps/local').not.toBeNull();

	// Two fanout segments off the id, then `{cid}.{ext}`, and no prefix between the root and the
	// first segment. A type directory reappearing on either side is what this catches.
	expect(body![1]).toContain('let (first, second) = fanout(cid);');
	expect(body![1]).toContain('public_root.join(first).join(second)');
	expect(body![1]).toContain('format!("{cid}.{extension}")');
	expect(storageKey('44b6081deaf0242ca3bf83d62a3b6c95', 'avif')).toBe(
		`44/b6/44b6081deaf0242ca3bf83d62a3b6c95.avif`,
	);

	// A record is not an object and must not acquire the fan-out: it is named, and it lives in
	// the metadata tree that this side reaches through `recordKey`. Keyed by the rid, which is
	// what both sides spell the parameter, because the record is rewritten in place.
	const record = /fn meta_path\([^)]*\) -> PathBuf \{([\s\S]*?)\n\}/.exec(source);
	expect(record, 'meta_path moved or changed shape in apps/local').not.toBeNull();
	expect(record![1]).toContain('.join("meta").join(format!("{resource}.json"))');
});
