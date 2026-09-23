<script lang="ts">
	import '../styles/app.css';
	import * as stylex from '@stylexjs/stylex';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, text, tracking, weight } from '@canmi/tokens/vocabulary.stylex';
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

	// The nav's one edge follows it: along the bottom while it is a row over the page, down the
	// side once it is a column beside it. `48rem` is the breakpoint the markup's `md:` names.
	const styles = stylex.create({
		nav: {
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			borderTopWidth: 0,
			borderLeftWidth: 0,
			borderBottomWidth: { default: border.hairlinePx, '@media (min-width: 48rem)': 0 },
			borderRightWidth: { default: 0, '@media (min-width: 48rem)': border.hairlinePx },
		},
		mark: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
			letterSpacing: tracking.caps,
			fontWeight: weight.medium,
		},
		current: {
			color: 'var(--color-text-strong)',
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

<div
	class="min-h-screen md:grid md:grid-cols-[11rem_minmax(0,1fr)] {stylex.attrs(surfaces.page)
		.class}"
>
	<nav
		class="flex items-center gap-1 px-4 py-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:px-3 md:py-6 {stylex.attrs(
			styles.nav,
		).class}"
	>
		<a
			href="/"
			class="mr-4 px-2 uppercase no-underline md:mr-0 md:mb-6 {stylex.attrs(styles.mark).class}"
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
				).class}">{section.label}</a
			>
		{/each}
	</nav>

	<!-- No column here. The preview draws the site's own page, whose rail works out where it goes
	     from the width it is given -- a wrapper narrower than an article plus its rail leaves the
	     rail no region to sit in, and it collapses against the edge. A page that wants a measure
	     sets its own. -->
	<div class="min-w-0 px-4 pt-8 pb-24 md:px-8">
		{@render children()}
	</div>
</div>
