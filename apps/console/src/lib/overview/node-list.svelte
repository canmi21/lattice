<script lang="ts">
	/**
	 * Every place beside the map, a line each: a dot for whether its nodes are heard, its name, and
	 * the figure the switch above the list picks -- how busy its processors are, how much of its
	 * memory is in use, or how many apps it runs. Nodes sharing a name are one line, which opens to
	 * a line each, told apart by code. Pointing at a line points the map at it, and a node's line is
	 * a link to the node. See spec/console/overview.md, "The map is the page's whole picture".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import ChevronIcon from '@tabler/icons-svelte-runes/icons/chevron-right';
	import Icon from '../design/icon.svelte';
	import type { Live } from '../live.svelte.ts';
	import { nameOf } from '../map/places.ts';
	import { liveness, readings, running } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { tone, type } from '../style.ts';
	import Segmented from '../ui/segmented.svelte';

	let {
		live,
		pointed = $bindable(),
	}: {
		live: Live;
		/** The node a line is pointed at, which the map opens. */
		pointed?: string;
	} = $props();

	const { node: toNode } = scoped();

	const FIGURES = [
		{ key: 'cpu', label: 'CPU' },
		{ key: 'memory', label: 'Memory' },
		{ key: 'apps', label: 'Apps' },
	] as const;
	let figure = $state<(typeof FIGURES)[number]['key']>('cpu');
	/** The names whose nodes are open, a line each. */
	let open = $state<string[]>([]);

	/** One decimal always, so the column's figures line up. */
	const share = (part: number) => `${(part * 100).toFixed(1)}%`;

	/** What each node reads now. */
	const nodes = $derived(
		CODES.map((code) => {
			const held = live.view.nodes[code];
			const read = readings(held?.snapshot.machine);
			return {
				code,
				name: nameOf(code).full,
				heard: held ? liveness(held.heard_at, live.now) !== 'gone' : false,
				cpu: read?.cpu,
				memory: read?.memory?.total ? read.memory : undefined,
				apps: held ? running(held) : undefined,
			};
		}),
	);
	type Read = (typeof nodes)[number];

	/** The figure picked, of one node or of several together: their mean, their sum, their total. */
	function valueOf(of: Read[]): string | undefined {
		if (figure === 'cpu') {
			const read = of.flatMap((one) => (one.cpu === undefined ? [] : [one.cpu]));
			return read.length ? share(read.reduce((a, b) => a + b, 0) / read.length / 100) : undefined;
		}
		if (figure === 'memory') {
			const read = of.flatMap((one) => (one.memory ? [one.memory] : []));
			const total = read.reduce((sum, one) => sum + (one.total ?? 0), 0);
			return total ? share(read.reduce((sum, one) => sum + one.used, 0) / total) : undefined;
		}
		const read = of.flatMap((one) => (one.apps ? [one.apps] : []));
		if (!read.length) return undefined;
		const sum = (key: 'running' | 'total') => read.reduce((total, one) => total + one[key], 0);
		return `${sum('running')} of ${sum('total')}`;
	}

	/** The nodes grouped by the name they are shown by, in the order the first of each comes. */
	const places = $derived(
		[...Map.groupBy(nodes, (one) => one.name)].map(([name, members]) => ({
			name,
			members,
			heard: members.every((one) => one.heard),
			value: valueOf(members),
		})),
	);

	function toggle(name: string) {
		open = open.includes(name) ? open.filter((one) => one !== name) : [...open, name];
	}

	const styles = stylex.create({
		row: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		/** A place's name, a step under the page's body, so the list stays dense. */
		name: { color: 'var(--color-text)', fontSize: text.px13 },
		/** A heard place's dot in the map's own blue, so a line and its mark read as one. */
		heard: { color: 'var(--color-primary)' },
		count: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		chevron: {
			color: 'var(--color-text-muted)',
			transitionProperty: 'transform',
			transitionDuration: duration.base,
		},
		turned: { transform: 'rotate(90deg)' },
		code: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		value: {
			color: 'var(--color-text)',
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
		},
	});
	const LINE = 'grid h-7 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2';
</script>

{#snippet dot(heard: boolean)}
	<span
		aria-hidden="true"
		class="size-1.5 rounded-full bg-current {stylex.attrs(heard ? styles.heard : tone.bad).class}"
	></span>
{/snippet}

<div class="flex flex-col items-start gap-3">
	<Segmented options={FIGURES} bind:value={figure} label="What each place shows" />
	<ul class="-mx-2 flex flex-col self-stretch" aria-label="Places">
		{#each places as place (place.name)}
			{@const lead = place.members[0]?.code ?? ''}
			<li>
				{#if place.members.length === 1}
					<a
						href={toNode(lead)}
						class="{LINE} {stylex.attrs(styles.row).class}"
						onpointerenter={() => (pointed = lead)}
						onpointerleave={() => (pointed = undefined)}
						onfocus={() => (pointed = lead)}
						onblur={() => (pointed = undefined)}
					>
						{@render dot(place.heard)}
						<span class="truncate {stylex.attrs(styles.name).class}">{place.name}</span>
						<span class={stylex.attrs(styles.value).class}>{place.value ?? '–'}</span>
					</a>
				{:else}
					{@const opened = open.includes(place.name)}
					<button
						type="button"
						aria-expanded={opened}
						class="w-full cursor-pointer text-left {LINE} {stylex.attrs(styles.row).class}"
						onclick={() => toggle(place.name)}
						onpointerenter={() => (pointed = lead)}
						onpointerleave={() => (pointed = undefined)}
						onfocus={() => (pointed = lead)}
						onblur={() => (pointed = undefined)}
					>
						{@render dot(place.heard)}
						<span class="flex min-w-0 items-center gap-1.5 {stylex.attrs(styles.name).class}">
							<span class="truncate">{place.name}</span>
							<span class={stylex.attrs(styles.count).class}>{place.members.length}</span>
							<Icon
								icon={ChevronIcon}
								size={14}
								class={stylex.attrs(styles.chevron, opened && styles.turned).class}
							/>
						</span>
						<span class={stylex.attrs(styles.value).class}>{place.value ?? '–'}</span>
					</button>
					{#if opened}
						<ul class="flex flex-col pl-4" aria-label="{place.name}, each node">
							{#each place.members as member (member.code)}
								<li>
									<a
										href={toNode(member.code)}
										class="{LINE} {stylex.attrs(styles.row).class}"
										onpointerenter={() => (pointed = member.code)}
										onpointerleave={() => (pointed = undefined)}
										onfocus={() => (pointed = member.code)}
										onblur={() => (pointed = undefined)}
									>
										{@render dot(member.heard)}
										<span class={stylex.attrs(type.mono, styles.code).class}>{member.code}</span>
										<span class={stylex.attrs(styles.value).class}>{valueOf([member]) ?? '–'}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
</div>
