<script lang="ts">
	/**
	 * Where the console goes: the pages of the level being read, the open one held raised, and inside
	 * a node or an app the way back up above them -- spec/console/navigation.md; and at the foot the
	 * account -- one button for the menu that waits on accounts, holding the avatar with a
	 * dot for whether the socket is up, the name, and the relay's country -- beside a link to the
	 * commit and the button notifications will open. Fixed down the left edge; see
	 * spec/architecture/console.md.
	 */
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { author } from '@canmi/me/identity';
	import { SOURCE } from '@canmi/me/urls';
	import BellIcon from '@tabler/icons-svelte-runes/icons/bell';
	import BackIcon from '@tabler/icons-svelte-runes/icons/chevron-left';
	import GitIcon from '@tabler/icons-svelte-runes/icons/git-merge';
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { pickUrls } from '@monoflake/sdk';
	import { imgsrc } from '@monoflake/sdk/imgsrc';
	import type { Live } from '../live.svelte.ts';
	import { countryOf } from '../map/places.ts';
	import type { Level } from '../levels.ts';
	import { surfaces, tone } from '../style.ts';
	import Badge from '../ui/badge.svelte';
	import Find from './find.svelte';
	import Icon from './icon.svelte';
	import IconButton from './icon-button.svelte';
	import { pass } from './motion.ts';
	import { CONTRACT } from '../wire.ts';

	let { level, live, nearest }: { level: Level; live: Live; nearest: string | undefined } =
		$props();

	const COMMIT = import.meta.env.VITE_COMMIT_HASH;
	// Three times the 2rem it is drawn at, for the densest screen and no more.
	const avatar = imgsrc(`github:avatar:${author.githubId}@96`, { cdnUrl: pickUrls(dev).cdn });
	// Up or down, and nothing between but the moment before the socket has tried; see
	// spec/architecture/console.md.
	const TONE = { connecting: 'quiet', live: 'good', polling: 'bad' } as const;
	const WORD = { connecting: 'Connecting', live: 'Live', polling: 'Polling every 5 s' } as const;

	// The relay the socket went through once one has answered; until then the node the server
	// worked out as nearest, which is where the socket goes first.
	const relayed = $derived(live.view.via ?? nearest);
	const relay = $derived(relayed === undefined ? undefined : countryOf(relayed));
	const through = $derived(
		[
			WORD[live.mode],
			relayed && `through ${relayed}`,
			live.failure && `last poll failed: ${live.failure}`,
		]
			.filter(Boolean)
			.join(', '),
	);

	/**
	 * Whether `href` is the page being read, query and all: a click there goes nowhere, and one from
	 * deeper -- a run under Deployments, a later page of Events -- goes back to it. See
	 * spec/console/navigation.md, "A page's own entry goes nowhere".
	 */
	function isHere(href: string): boolean {
		const to = new URL(href, page.url.href);
		return to.pathname === page.url.pathname && to.search === page.url.search;
	}

	function stay(event: MouseEvent, href: string) {
		const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey;
		if (plain && !event.altKey && isHere(href)) event.preventDefault();
	}

	/**
	 * The level drawn, and on a move to a deeper or a shallower one a copy of the old left over it to
	 * slide away as the new arrives. Taken before the DOM changes, played after.
	 */
	let panel: HTMLElement | undefined = $state();
	const identity = $derived(`${level.depth} ${level.up?.href ?? ''} ${level.name ?? ''}`);
	let shown = { identity: untrack(() => identity), depth: untrack(() => level.depth) };
	const leaving: { next?: { ghost: HTMLElement; way: 1 | -1 } } = {};
	$effect.pre(() => {
		const next = identity;
		const depth = level.depth;
		untrack(() => {
			if (next === shown.identity) return;
			if (panel && depth !== shown.depth) {
				const ghost = panel.cloneNode(true) as HTMLElement;
				ghost.inert = true;
				ghost.setAttribute('aria-hidden', 'true');
				Object.assign(ghost.style, {
					position: 'absolute',
					top: `${panel.offsetTop}px`,
					left: `${panel.offsetLeft}px`,
					width: `${panel.offsetWidth}px`,
				});
				leaving.next = { ghost, way: depth > shown.depth ? 1 : -1 };
			}
			shown = { identity: next, depth };
		});
	});
	$effect(() => {
		void identity;
		untrack(() => {
			const { next } = leaving;
			leaving.next = undefined;
			if (!next || !panel) return;
			// Not `after`, which the Workers types beside the DOM's take for HTMLRewriter's.
			panel.parentNode?.insertBefore(next.ghost, panel.nextSibling);
			pass(next.ghost, panel, next.way);
		});
	});

	const styles = stylex.create({
		disc: { backgroundColor: 'var(--color-raised)' },
		link: {
			borderRadius: radius.md,
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-hover)',
			},
			color: {
				default: 'var(--color-text-muted)',
				':hover': 'var(--color-text-strong)',
			},
			fontSize: text.px14,
			fontWeight: weight.medium,
			transitionProperty: 'color, background-color',
			transitionDuration: duration.base,
		},
		here: {
			backgroundColor: { default: 'var(--color-selected)', ':hover': 'var(--color-selected)' },
			color: { default: 'var(--color-text-strong)', ':hover': 'var(--color-text-strong)' },
		},
		/** The way back up: laid out as a page, with no ground of its own, hovered or not. */
		back: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px14,
			fontWeight: weight.medium,
			transitionProperty: 'color',
			transitionDuration: duration.base,
		},
		account: {
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.semibold,
		},
		rule: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-line-faint)',
		},
		status: {
			fontSize: text.px12,
			color: 'var(--color-text-muted)',
		},
		/** The whole account is the menu's button, raised on hover as a section's link is. */
		menu: {
			borderRadius: radius.md,
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-hover)',
			},
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		/** The dot's ring, the sidebar's ground, so it reads as cut out of the avatar's edge. */
		presence: {
			borderWidth: '2px',
			borderStyle: 'solid',
			borderColor: 'var(--color-ground)',
		},
	});
</script>

<svelte:head>
	<!-- Asked for before the page's modules, so the first frame paints it. -->
	<link rel="preload" as="image" href={avatar} fetchpriority="high" />
</svelte:head>

<aside
	aria-label="Console"
	class="fixed inset-y-0 left-0 z-30 flex w-60 flex-col select-none {stylex.attrs(surfaces.sidebar)
		.class}"
>
	<!-- As tall as the top bar, so the two heads read as one band. -->
	<div class="flex h-14 shrink-0 items-center px-3">
		<Find />
	</div>
	<!-- A page's load starts on hover; see spec/architecture/console.md. -->
	<nav
		aria-label={level.name ?? 'Sections'}
		class="relative flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-1"
		data-sveltekit-preload-data="hover"
	>
		<div bind:this={panel} class="flex flex-col gap-1">
			{#if level.up}
				<a
					href={level.up.href}
					class="flex h-9 items-center gap-2.5 px-3 {stylex.attrs(styles.back).class}"
				>
					<Icon icon={BackIcon} size={18} stroke={1.75} />
					{level.up.label}
				</a>
			{/if}
			{#each level.items as item (item.key)}
				{@const here = item.key === level.current}
				<!-- `page` where it is the page, `true` where the page is somewhere under it. -->
				<a
					href={item.href}
					aria-current={here ? (isHere(item.href) ? 'page' : 'true') : undefined}
					onclick={(event) => stay(event, item.href)}
					class="flex h-9 items-center gap-2.5 px-3 {stylex.attrs(styles.link, here && styles.here)
						.class}"
				>
					<item.icon size={18} stroke={1.75} />
					{item.label}
				</a>
			{/each}
		</div>
	</nav>
	{#if live.view.refused !== undefined}
		<footer class="flex shrink-0 px-6 pb-3">
			<Badge tone="warn">Relay contract {live.view.refused}, console {CONTRACT}</Badge>
		</footer>
	{/if}
	<div class="flex shrink-0 items-center gap-2 px-3 py-2 {stylex.attrs(styles.rule).class}">
		<!-- The menu waits on accounts, and until it opens one nothing says it does; see
		     spec/console/design.md, "Accessibility". -->
		<button
			type="button"
			aria-label="Account, {author.name}"
			class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-1 py-1.5 text-left {stylex.attrs(
				styles.menu,
			).class}"
		>
			<span class="relative shrink-0" title={through}>
				<img
					src={avatar}
					alt=""
					width="32"
					height="32"
					fetchpriority="high"
					class="size-8 rounded-full object-cover {stylex.attrs(styles.disc).class}"
				/>
				<!-- Whether the socket is up, as a presence dot ringed in the sidebar's own ground. -->
				<span
					aria-hidden="true"
					class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-current {stylex.attrs(
						tone[TONE[live.mode]],
						styles.presence,
					).class}"
				></span>
			</span>
			<span class="flex min-w-0 flex-col leading-4">
				<span class="truncate {stylex.attrs(styles.account).class}">{author.name}</span>
				{#if relay !== undefined}
					<span class="truncate {stylex.attrs(styles.status).class}">{relay}</span>
				{/if}
			</span>
		</button>
		<span class="flex shrink-0 items-center gap-1.5">
			<!-- The commit this console was built from, opened where it was made. -->
			<IconButton
				label="Built from {COMMIT}"
				variant="framed"
				shape="circle"
				size="sm"
				href={COMMIT === 'unknown' ? SOURCE : `${SOURCE}/commit/${COMMIT}`}
				external
			>
				<Icon icon={GitIcon} size={18} />
			</IconButton>
			<!-- Notifications wait on a feed of their own; see spec/architecture/console.md. -->
			<IconButton label="Notifications" variant="framed" shape="circle" size="sm">
				<Icon icon={BellIcon} size={18} />
			</IconButton>
		</span>
	</div>
	<!-- The dot told in words, as the state changes, for a reader who cannot see it. -->
	<span class="sr-only" role="status">{through}</span>
</aside>
