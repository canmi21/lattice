<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import {
		border,
		duration,
		easing,
		leading,
		line,
		radius,
		text,
		weight,
	} from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of the board. Colours are palette names, read rather than retyped, and the
	 * accents appear only where they say a state. See spec/architecture/css/authoring.md.
	 */
	const styles = stylex.create({
		headline: {
			color: 'var(--color-text-strong)',
			// unnamed: the page's one display size, above the ladder's top step.
			fontSize: '1.5rem',
			lineHeight: line.tight,
			fontWeight: weight.semibold,
			// unnamed: display tracking, on this headline alone.
			letterSpacing: '-0.02em',
		},
		dot: {
			borderRadius: radius.full,
			transitionProperty: 'background-color',
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: easing.inOut,
		},
		up: { backgroundColor: 'var(--color-green)' },
		down: { backgroundColor: 'var(--color-red)' },
		quiet: { backgroundColor: 'var(--color-text-soft)' },
		empty: { backgroundColor: 'var(--color-border-strong)' },
		soft: { color: 'var(--color-text-soft)' },
		group: {
			fontSize: text.px14,
			lineHeight: leading.px20,
		},
		heading: { color: 'var(--color-text-strong)', fontWeight: weight.medium },
		list: {
			backgroundColor: 'var(--color-paper)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			borderRadius: radius.lg,
		},
	});
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { byKind, key, overallOf } from '$lib/board';
	import CheckRow from '$lib/components/check-row.svelte';
	import { Live } from '$lib/live.svelte';
	import { settle } from '$lib/motion';
	import { ago } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The server's answer seeds the board once; from here on the browser keeps it.
	const live = new Live(untrack(() => data));
	let local = $state(false);

	$effect(() => {
		local = true;
		return live.start();
	});

	const KIND: Record<string, { title: string; about: string }> = {
		health: { title: 'Services', about: "Each service's own health, asked on the private side." },
		api: { title: 'APIs', about: "The whole chain a visitor's request takes, end to end." },
		dns: { title: 'DNS', about: "Names resolving, through Cloudflare's resolver and Google's." },
		page: { title: 'Pages', about: 'Pages rendered in a real browser, reporting their errors.' },
	};

	const overall = $derived(overallOf(live.checks, live.nowByKey, live.clock));
	const groups = $derived(byKind(live.checks));

	const headline = $derived.by(() => {
		switch (overall.state) {
			case 'up':
				return { text: 'All checks passing', dot: styles.up };
			case 'down':
				return { text: `${overall.failing} of ${overall.total} checks failing`, dot: styles.down };
			case 'partial':
				return {
					text: `${overall.silent} of ${overall.total} checks gone quiet`,
					dot: styles.quiet,
				};
			case 'silent':
				return { text: 'The probe is silent', dot: styles.quiet };
			case 'empty':
				return { text: 'No checks reported yet', dot: styles.empty };
		}
	});
</script>

<svelte:head>
	<title>Status</title>
	<meta
		name="description"
		content="Whether the platform's services, APIs, names and pages are answering, checked from outside every few seconds."
	/>
</svelte:head>

<section aria-labelledby="overall" class="mb-14 sm:mb-16">
	<h1
		id="overall"
		use:settle={headline.text}
		class="flex items-center gap-3 {stylex.attrs(styles.headline).class}"
	>
		<span
			class="size-2.5 shrink-0 {stylex.attrs(styles.dot, headline.dot).class}"
			aria-hidden="true"
		></span>
		{headline.text}
	</h1>
	<p class="mt-3 max-w-prose {stylex.attrs(styles.soft).class}" aria-live="polite">
		{#if overall.state === 'silent'}
			Nothing has been heard from the probe
			{overall.lastHeard ? `since ${ago(overall.lastHeard.getTime(), live.clock)}` : 'yet'}: the
			node, its link or the probe itself is down, so the last results are not shown as current.
		{:else if live.unreachable}
			The database is not answering{live.answeredAt
				? `; last answered ${ago(live.answeredAt, live.clock)}`
				: ''}. Retrying.
		{:else}
			Checked from outside every few seconds. Updated {ago(live.answeredAt, live.clock)}.
		{/if}
	</p>
</section>

{#each groups as [kind, checks] (kind)}
	<section aria-labelledby="kind-{kind}" class="mb-12 {stylex.attrs(styles.group).class}">
		<h2 id="kind-{kind}" class={stylex.attrs(styles.heading).class}>
			{KIND[kind]?.title ?? kind}
		</h2>
		{#if KIND[kind]}
			<p class="mt-0.5 {stylex.attrs(styles.soft).class}">{KIND[kind].about}</p>
		{/if}
		<ul class="mt-4 overflow-hidden {stylex.attrs(styles.list).class}">
			{#each checks as check (key(check.id, check.place))}
				<CheckRow
					{check}
					latest={live.nowByKey.get(key(check.id, check.place))}
					history={live.historyOf(check)}
					clock={live.clock}
					{local}
				/>
			{/each}
		</ul>
	</section>
{/each}
