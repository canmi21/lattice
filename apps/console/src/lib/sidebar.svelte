<script lang="ts">
	/**
	 * The account, then where the console goes: the sections the view shows, the one being read
	 * held in a raised row; and at the foot whether the console is live, how many nodes it hears
	 * and through which one. Fixed down the whole left edge; see spec/architecture/console.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Live } from './live.svelte.ts';
	import { PLACES } from './map/places.ts';
	import { liveness } from './node.ts';
	import { type View, within } from './scope/scope.ts';
	import { sectionsIn, type Section } from './sections.ts';
	import { surfaces, tone, type } from './style.ts';
	import Badge from './ui/badge.svelte';
	import { CONTRACT } from './wire.ts';

	let { view, current, live }: { view: View; current: Section | undefined; live: Live } = $props();

	const WORD = { connecting: 'Connecting', live: 'Live', polling: 'Polling' } as const;
	const TONE = { connecting: 'quiet', live: 'good', polling: 'warn' } as const;
	const TOTAL = Object.keys(PLACES).length;
	const heard = $derived(
		Object.values(live.view.nodes).filter((held) => liveness(held.heard_at, live.now) === 'live')
			.length,
	);
	const through = $derived(
		[
			live.view.via && `Through ${live.view.via}`,
			live.mode === 'polling' && 'every 5 s',
			live.failure && `last poll failed: ${live.failure}`,
		]
			.filter(Boolean)
			.join(', '),
	);

	const styles = stylex.create({
		link: {
			borderRadius: radius.md,
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			color: {
				default: 'var(--color-text-muted)',
				':hover': 'var(--color-text-strong)',
			},
			fontSize: text.px14,
			fontWeight: weight.medium,
			transitionProperty: 'color, background-color',
			transitionDuration: '120ms',
		},
		here: {
			backgroundColor: { default: 'var(--color-raised)', ':hover': 'var(--color-raised)' },
			color: { default: 'var(--color-text-strong)', ':hover': 'var(--color-text-strong)' },
		},
		account: {
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.semibold,
		},
		status: {
			fontSize: text.px12,
			color: 'var(--color-text-muted)',
		},
	});
</script>

<aside
	class="fixed inset-y-0 left-0 z-30 flex w-60 flex-col {stylex.attrs(surfaces.sidebar).class}"
>
	<a
		href={within(view)}
		class="flex h-14 shrink-0 items-center px-6 {stylex.attrs(styles.account).class}">canmi</a
	>
	<!-- A section's load starts on hover; see spec/architecture/console.md. -->
	<nav
		class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3"
		data-sveltekit-preload-data="hover"
	>
		{#each sectionsIn(view) as section (section.path)}
			{@const here = section === current}
			<a
				href={within(view, section.path)}
				aria-current={here ? 'page' : undefined}
				class="flex h-9 items-center gap-2.5 px-3 {stylex.attrs(styles.link, here && styles.here)
					.class}"
			>
				<section.icon size={16} strokeWidth={1.75} />
				{section.label}
			</a>
		{/each}
	</nav>
	<footer class="flex shrink-0 flex-col items-start gap-2 px-6 py-4">
		{#if live.view.refused !== undefined}
			<Badge tone="warn">Relay contract {live.view.refused}, console {CONTRACT}</Badge>
		{/if}
		<span
			class="inline-flex items-center gap-2 {stylex.attrs(styles.status).class}"
			title={through}
		>
			<span class="size-1.5 rounded-full bg-current {stylex.attrs(tone[TONE[live.mode]]).class}"
			></span>
			{WORD[live.mode]}
			<span class={stylex.attrs(type.figure, styles.status).class}>{heard}/{TOTAL}</span>
		</span>
	</footer>
</aside>
