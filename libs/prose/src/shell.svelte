<script lang="ts">
	/**
	 * The page an article is read on: the rail, the bar opposite it, the column, and the body.
	 *
	 * Extracted from the site's `article.svelte`, because the CMS previews a draft on this page
	 * and a second skeleton would be a second answer to how an article is laid out.
	 *
	 * What stays the site's is every snippet below -- they reach for its own data. What moved is
	 * the arrangement; the prose typography is `prose-root.svelte`'s, which the editor draws too.
	 * See spec/architecture/workspace.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import type { LocaleCode } from '@canmi/locales';
	import type { Theme } from '@canmi/theme';
	import type { TocEntry } from '@canmi/artifacts/types';
	import type { Snippet } from 'svelte';
	import ActionBar from './action-bar.svelte';
	import Toc from './toc.svelte';
	import ProseRoot from './prose-root.svelte';
	import type { RailWidths } from './rail-widths.ts';

	let {
		toc,
		rail,
		locale,
		theme,
		home,
		header,
		tail,
		children,
	}: {
		toc: TocEntry[];
		rail?: RailWidths;
		locale: LocaleCode;
		theme: Theme;
		/** The return control at the foot of the rail. The rail script measures it by class. */
		home?: Snippet;
		header?: Snippet;
		/** Notes, an invitation, anything the article is followed by rather than made of. */
		tail?: Snippet;
		children: Snippet;
	} = $props();
</script>

<main class="min-h-screen {stylex.attrs(surfaces.page).class}">
	<!-- One rail, one box. It is fit-content, so the browser sizes it to the entries without
	     anything having to measure them -- see spec/styling/rail.md. A drag started on a heading
	     here should not come away with the navigation, so the apparatus does not select. -->
	<div class="article-rail select-none">
		<Toc {toc} {rail} />
		{@render home?.()}
	</div>
	<!-- The mirror of that rail, down the region on the other side. What a reader does with an
	     article rather than what it is; see the component for why it declares no width. -->
	<ActionBar {locale} {theme} />
	<!-- The top is computed from the column's own side gutter and lives in `.article-column`; see
	     spec/styling/rail.md. The bottom keeps its 6rem at every width, because the space under the
	     footer competes with nothing. -->
	<div class="article-column px-6 pb-24">
		<article>
			<header>{@render header?.()}</header>
			<ProseRoot class="mt-8">
				{@render children()}
			</ProseRoot>
		</article>
		{@render tail?.()}
	</div>
</main>
