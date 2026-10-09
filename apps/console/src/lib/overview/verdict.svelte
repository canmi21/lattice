<script lang="ts">
	/**
	 * Whether anything is wrong, said first and in one line on the card's own ground: the dot takes
	 * the color of the worst of it, and each thing wrong is named, linked to where it is read. See
	 * spec/console/overview.md, "The page answers whether anything is wrong first".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Live } from '../live.svelte.ts';
	import { stateOf } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { surfaces, tone } from '../style.ts';
	import type { State } from '../wire.ts';
	import type { Now } from './moving.ts';

	let {
		live,
		now,
		keep = () => true,
		nodes = true,
	}: {
		live: Live;
		/** What is deploying and what failed, once the page's runs have landed. */
		now: Now | undefined;
		keep?: (app: string) => boolean;
		/** Whether the view holds the nodes, which are infra's alone. */
		nodes?: boolean;
	} = $props();

	const { to } = scoped();

	/** How far back a failure still asks for attention. */
	const DAY = 86_400_000;

	const held = $derived(Object.values(live.view.nodes));
	const known = $derived(held.length > 0);
	/** Each node's state as the relay says it, one the relay holds nothing of gone. */
	const states = $derived(CODES.map((code) => stateOf(live.view.nodes[code], live.now)));
	const counted = (state: State) => states.filter((one) => one === state).length;
	const silent = $derived(counted('gone'));
	const upgrading = $derived(counted('upgrading'));
	const restarting = $derived(counted('restarting'));
	const stopped = $derived(
		held.flatMap((one) => one.snapshot?.apps ?? []).filter((app) => keep(app.name) && !app.running)
			.length,
	);
	const failed = $derived(
		(now?.failed ?? []).filter(
			(step) => live.now - Date.parse(step.finished_at ?? step.started_at) < DAY,
		).length,
	);
	const deploying = $derived(
		(now?.running ?? []).reduce((sum, group) => sum + group.steps.length, 0),
	);
	const plural = (count: number, one: string, many: string) =>
		`${count} ${count === 1 ? one : many}`;

	/**
	 * Each thing wrong, worst first: a node gone outweighs one leaving, which said it would be
	 * back, a node an app, an app a failed deploy. See spec/architecture/console.md, "A node has
	 * three states on the map".
	 */
	const wrong = $derived(
		[
			nodes && silent > 0
				? { text: `${plural(silent, 'node', 'nodes')} not heard`, href: to('/nodes') }
				: undefined,
			nodes && upgrading > 0
				? { text: `${plural(upgrading, 'node', 'nodes')} upgrading`, href: to('/nodes') }
				: undefined,
			nodes && restarting > 0
				? { text: `${plural(restarting, 'node', 'nodes')} restarting`, href: to('/nodes') }
				: undefined,
			stopped > 0
				? { text: `${plural(stopped, 'app', 'apps')} not running`, href: to('/apps') }
				: undefined,
			failed > 0
				? {
						text: `${plural(failed, 'deploy', 'deploys')} failed in the last day`,
						href: to('/deployments'),
					}
				: undefined,
		].filter((one) => one !== undefined),
	);
	const level = $derived(nodes && silent > 0 ? 'bad' : wrong.length ? 'warn' : 'good');

	const styles = stylex.create({
		bar: { borderRadius: radius.lg },
		said: { fontSize: text.px14, fontWeight: weight.medium, color: 'var(--color-text-strong)' },
		link: {
			textDecorationLine: { default: 'none', ':hover': 'underline' },
			textUnderlineOffset: '0.2em',
			transitionProperty: 'color',
			transitionDuration: duration.base,
		},
		apart: { color: 'var(--color-text-faint)' },
		aside: { fontSize: text.px13, color: 'var(--color-text-muted)' },
	});
</script>

<!-- Told as it changes, for a reader who cannot see its color. -->
<div
	role="status"
	class="flex min-h-12 items-center gap-3 px-5 py-3 {stylex.attrs(styles.bar, surfaces.card).class}"
>
	<span
		aria-hidden="true"
		class="size-2 shrink-0 rounded-full bg-current {stylex.attrs(known ? tone[level] : tone.quiet)
			.class}"
	></span>
	<p class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 {stylex.attrs(styles.said).class}">
		{#if !known}
			Listening for the nodes…
		{:else if wrong.length === 0}
			All systems normal
		{:else}
			{#each wrong as one, index (one.text)}
				{#if index > 0}<span aria-hidden="true" class={stylex.attrs(styles.apart).class}>·</span
					>{/if}
				<a href={one.href} class={stylex.attrs(styles.link).class}>{one.text}</a>
			{/each}
		{/if}
	</p>
	{#if known && now}
		<span class="shrink-0 {stylex.attrs(styles.aside).class}">
			{deploying ? `Deploying ${plural(deploying, 'app', 'apps')}` : 'Nothing deploying'}
		</span>
	{/if}
</div>
