<script lang="ts">
	/**
	 * A draft drawn on the page the site reads an article on, and nothing around it.
	 *
	 * A route of its own rather than a mode of the editor, because the editor's pane scrolls and
	 * this page cannot: the rail is fixed to the viewport, and the contents and the progress bar
	 * read the window's scroll. So it stands outside the ground and the pane, and the document is
	 * what scrolls. See spec/architecture/local.md.
	 *
	 * It shows what was last saved. The editor saves before it comes here, so that is what was
	 * just being written.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import ArticleBody from '@canmi/prose/body.svelte';
	import Shell from '@canmi/prose/shell.svelte';
	import { articleRailScript } from '@canmi/prose/rail';
	import { currentTheme } from '@canmi/theme';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { previewDraft, readDraft, type Preview } from '$lib/collection.ts';

	const rid = $derived(page.params.rid ?? '');

	let title = $state('');
	let preview = $state<Preview | undefined>(undefined);
	let failure = $state<string | undefined>(undefined);

	// Compiled where the compiler is, then rendered with the components the site renders with --
	// so what is shown here is the article and not an approximation of it. See milestones.md B3a.
	$effect(() => {
		const id = rid;
		if (!id) return;
		void Promise.all([readDraft(id), previewDraft(id)])
			.then(async ([draft, compiled]) => {
				title = draft.meta.title ?? '';
				preview = compiled;
				// The rail's vertical placement is a measurement, and the site takes it in a shell
				// script once the markup is there. Here the markup arrives after a fetch, so it is
				// taken then.
				await tick();
				new Function(articleRailScript)();
			})
			.catch((error: unknown) => (failure = String(error)));
	});

	const styles = stylex.create({
		// The article's own title is the strong ink and nothing else, as it is on the site.
		title: { color: 'var(--color-text-strong)' },
		quiet: { color: 'var(--color-text-soft)' },
		failure: { color: 'var(--color-red)' },
		back: {
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
		},
		// The offset the rail script writes, which is how the site's own return control follows
		// the rail. A transform because no utility translates one; see
		// spec/architecture/css/migration.md, "No utility translates a `transform` declaration".
		slot: { transform: 'translateY(calc(-50% + var(--home-offset, 0rem)))' },
	});
</script>

{#if failure}
	<p class="p-8 {stylex.attrs(surfaces.uiText, styles.failure).class}">{failure}</p>
{:else if preview === undefined}
	<p class="p-8 {stylex.attrs(surfaces.uiText, styles.quiet).class}">Compiling {rid}…</p>
{:else}
	<!-- The page the site reads an article on, drawn around this draft. Not a preview layout:
	     the same component, so there is nothing here that can drift from what is published. -->
	<Shell toc={preview.toc} locale="mw" theme={currentTheme()}>
		{#snippet home()}
			<!-- Where the site's control leads back to its homepage, this one leads back to the
			     editor. The rail script measures the slot by its class to place it. -->
			<div
				class="home-slot pointer-events-none absolute top-27 left-0 flex w-full items-center {stylex.attrs(
					styles.slot,
				).class}"
			>
				<a
					href="/draft/{rid}"
					class="pointer-events-auto no-underline {stylex.attrs(
						surfaces.uiText,
						surfaces.colorShift,
						styles.back,
					).class}">Edit</a
				>
			</div>
		{/snippet}
		{#snippet header()}
			<h1 class={stylex.attrs(styles.title).class}>{title || 'Untitled'}</h1>
		{/snippet}
		<ArticleBody blocks={preview.blocks} resources={preview.resources} locale="mw" />
	</Shell>
{/if}
