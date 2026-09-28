<script lang="ts">
	/**
	 * Where the panel goes: its pages, and signing out. The marker behind the page being read
	 * crosses to the next one rather than jumping, the way the editor's tabs do.
	 */
	import { page } from '$app/state';
	import * as stylex from '@stylexjs/stylex';
	import Boxes from '@lucide/svelte/icons/boxes';
	import Layers from '@lucide/svelte/icons/layers';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Server from '@lucide/svelte/icons/server';
	import Waypoints from '@lucide/svelte/icons/waypoints';
	import { travel, type Place } from './motion';
	import { surfaces, type } from './style/surfaces';
	import { duration, radius, text, weight } from './style/vocabulary.stylex';

	let { machine, onsignout }: { machine?: string; onsignout: () => void } = $props();

	const pages = [
		{ href: '/', label: 'Overview', icon: LayoutDashboard, here: (path: string) => path === '/' },
		{ href: '/apps', label: 'Apps', icon: Boxes, here: (path: string) => path.startsWith('/apps') },
		{
			href: '/images',
			label: 'Images',
			icon: Layers,
			here: (path: string) => path.startsWith('/images'),
		},
		{
			href: '/routes',
			label: 'Routes',
			icon: Waypoints,
			here: (path: string) => path.startsWith('/routes'),
		},
	];

	const current = $derived(pages.findIndex((item) => item.here(page.url.pathname)));
	const links: HTMLAnchorElement[] = $state([]);
	let marker: HTMLElement | undefined = $state();
	let placed: Place | undefined;

	$effect(() => {
		const link = links[current];
		if (!marker) return;
		if (!link) {
			marker.style.opacity = '0';
			placed = undefined;
			return;
		}
		const to = { start: link.offsetTop, size: link.offsetHeight };
		marker.style.opacity = '1';
		travel(marker, placed, to, 'y');
		placed = to;
	});

	const styles = stylex.create({
		brandMark: {
			backgroundColor: 'var(--color-primary)',
			color: 'var(--nord6)',
			borderRadius: radius.lg,
		},
		brandName: {
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.semibold,
			lineHeight: 1.2,
		},
		link: {
			borderRadius: radius.md,
			color: {
				default: 'var(--color-text-muted)',
				':hover': 'var(--color-text-strong)',
			},
			fontSize: text.px13,
			fontWeight: weight.medium,
			transitionProperty: 'color',
			transitionDuration: duration.hover,
		},
		here: {
			color: 'var(--color-text-strong)',
		},
		marker: {
			backgroundColor: 'var(--color-selected)',
			borderRadius: radius.md,
		},
		markerEdge: {
			backgroundColor: 'var(--color-accent)',
			borderRadius: radius.full,
		},
	});
</script>

<aside
	class="sticky top-0 flex h-screen w-56 shrink-0 flex-col {stylex.attrs(surfaces.sidebar).class}"
>
	<div class="flex items-center gap-3 px-4 pt-5 pb-6">
		<span
			class="flex size-8 shrink-0 items-center justify-center {stylex.attrs(styles.brandMark)
				.class}"
		>
			<Server size={16} strokeWidth={2} />
		</span>
		<span class="flex min-w-0 flex-col gap-0.5">
			<span class={stylex.attrs(styles.brandName).class}>host</span>
			<span class="truncate {stylex.attrs(type.label).class}">{machine ?? 'home'}</span>
		</span>
	</div>

	<nav class="relative flex flex-col gap-0.5 px-2">
		<span
			bind:this={marker}
			class="pointer-events-none absolute top-0 right-2 left-2 opacity-0 {stylex.attrs(
				styles.marker,
			).class}"
		>
			<span class="absolute top-2 bottom-2 left-0 w-0.5 {stylex.attrs(styles.markerEdge).class}"
			></span>
		</span>
		{#each pages as item, index (item.href)}
			<a
				bind:this={links[index]}
				href={item.href}
				aria-current={index === current ? 'page' : undefined}
				class="relative flex h-9 items-center gap-2.5 px-3 {stylex.attrs(
					styles.link,
					index === current && styles.here,
				).class}"
			>
				<item.icon size={16} strokeWidth={1.75} />
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="mt-auto px-2 pb-4">
		<button
			type="button"
			onclick={onsignout}
			class="flex h-9 w-full items-center gap-2.5 border-0 bg-transparent px-3 {stylex.attrs(
				styles.link,
			).class}"
		>
			<LogOut size={16} strokeWidth={1.75} />
			Sign out
		</button>
	</div>
</aside>
