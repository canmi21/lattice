<script lang="ts">
	import '../styles/app.css';
	import * as stylex from '@stylexjs/stylex';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { radius, text, weight } from '@canmi/tokens/vocabulary.stylex';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * The visual layer the preview is drawn with, linked the way the site links it.
	 *
	 * The article components are StyleX, and in development StyleX's sheet arrives through a
	 * link plus a runtime module rather than an import -- see spec/architecture/css/layers.md,
	 * "In development the visual layer arrives with its runtime, and must not be linked", for why
	 * the layer declaration has to come first and why the runtime alone is too late.
	 */
	const DEV_STYLEX =
		'<style>@layer properties, theme, base, components, utilities;</style>' +
		'<link rel="stylesheet" href="/virtual:stylex.css">';

	if (dev) {
		$effect(() => {
			void import('virtual:stylex:runtime');
		});
	}

	/**
	 * Every section the CMS has, and the paths that count as being in it. Only what exists is
	 * listed: a link to a page nobody has built is a promise the tool does not keep. Images and
	 * albums join this list with B5 and B7. See spec/architecture/local.md.
	 */
	const SECTIONS = [
		{
			label: 'Drafts',
			href: '/',
			owns: (path: string) => path === '/' || path.startsWith('/draft/'),
		},
	];

	// The page is laid out as a ground with the content pane set on it: the section column is the
	// ground itself, and the pane is the site's own page colour with a corner, so what is being
	// written sits on exactly the ground a reader sees it on. See spec/architecture/local.md.
	const styles = stylex.create({
		pane: { borderRadius: radius.xl },
		mark: {
			color: 'var(--color-text-soft)',
			fontSize: text.px13,
			fontWeight: weight.medium,
		},
		// A section is a pill on the ground rather than a word in a list, so its corner is the
		// buttons' rather than the compact control's.
		item: { borderRadius: radius.md },
		// The section being worked in takes the pane's ground, which is what says the pane is its.
		current: {
			color: 'var(--color-text-strong)',
			backgroundColor: 'var(--color-page)',
			fontWeight: weight.medium,
		},
	});
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. Raw on
	     purpose too, and stated rather than suppressed -- oxlint does not parse svelte templates,
	     so a `svelte/no-at-html-tags` directive would be decoration. See spec/lint-format.md. -->
	{#if dev}{@html DEV_STYLEX}{/if}
</svelte:head>

<div class="flex min-h-dvh flex-col gap-2 p-2 md:flex-row">
	<nav
		class="flex shrink-0 items-center gap-1 px-2 py-1 md:sticky md:top-2 md:h-[calc(100dvh-1rem)] md:w-44 md:flex-col md:items-stretch md:py-4"
	>
		<a href="/" class="mr-4 px-2 no-underline md:mr-0 md:mb-5 {stylex.attrs(styles.mark).class}"
			>collection</a
		>
		{#each SECTIONS as section (section.href)}
			{@const here = section.owns(page.url.pathname)}
			<a
				href={section.href}
				aria-current={here ? 'page' : undefined}
				class="block px-2 py-1 no-underline {stylex.attrs(
					surfaces.quietControl,
					surfaces.uiText,
					here && styles.current,
					styles.item,
				).class}">{section.label}</a
			>
		{/each}
	</nav>

	<!-- Clipped rather than scrolled: the document is what scrolls, because the preview's rail is
	     fixed to the viewport and its contents read the window's scroll. `overflow: clip` rounds
	     the corners without making a scroll container, so a sticky bar inside still sticks to the
	     viewport. No column here either -- the preview's rail works out where it goes from the
	     width it is given, and a page that wants a measure sets its own. -->
	<div
		class="min-w-0 flex-1 overflow-clip px-4 pt-8 pb-24 md:px-8 {stylex.attrs(
			surfaces.page,
			styles.pane,
		).class}"
	>
		{@render children()}
	</div>
</div>

<style>
	/* The ground the pane is set on. `html` carries no class, and it is what the tokens paint, so
	   the one place this can be said is here. */
	:global(html) {
		background-color: var(--color-paper-hover);
	}
</style>
