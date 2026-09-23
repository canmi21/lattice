import type { PageBlock, PublishedPage } from '@canmi/artifacts';
import type { LocaleCode } from '../locale/index';
import * as m from '@canmi/messages';

export type HomepageContent = {
	title: string;
	description: string;
	bio: PageBlock[];
	writing: string;
};

/**
 * The homepage's own copy, read off whichever view was fetched.
 *
 * The bio is identity copy and stays in its English source form in every view; it used to be
 * read from `mw` explicitly, which is no longer needed because the build compiles a page once
 * and files it under every locale. See buildPages in @canmi/compile/articles. A homepage
 * the root does not name costs a bare article list rather than an error.
 */
export function homepageContent(
	page: PublishedPage | undefined,
	code: LocaleCode,
): HomepageContent {
	return {
		title: page?.meta.title ?? 'Canmi',
		description: page?.meta.description ?? '',
		bio: page?.blocks ?? [],
		writing: m['nav.writing']({}, { locale: code }),
	};
}
