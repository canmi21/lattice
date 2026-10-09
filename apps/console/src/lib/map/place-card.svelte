<script lang="ts">
	/**
	 * What a mark's card says of its place, as rows of a name and a value: how long it has been up,
	 * its role, the apps it runs, and two rings, how busy its processor is and how much memory is in
	 * use, written in `G`. A shared place is named once and its nodes are columns of the same rows,
	 * each headed by what tells it from the others there, its airport or its district, never its
	 * code, and each head a link to its node. The map places the card; this draws it. See
	 * spec/console/overview.md, "A place's card says what the list does not".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration as hover, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import Gauge from '../chart/gauge.svelte';
	import { uptime } from '../nodes/machine.ts';
	import { scoped } from '../scope/context.ts';
	import { tone } from '../style.ts';
	import Flag from './flag.svelte';
	import { nameOf, PLACES, ROLES, type Member, type Site } from './places.ts';

	let { site, now }: { site: Site; now: number } = $props();

	const { node: toNode } = scoped();
	const GIB = 2 ** 30;

	const shared = $derived(site.members.length > 1);
	/** What tells a node from the others at its place: `Narita`, of `Tokyo, Narita`. */
	function partOf(code: string): string {
		const place = PLACES[code as keyof typeof PLACES]?.place ?? code;
		return place.includes(', ') ? (place.split(', ').at(-1) ?? place) : place;
	}
	const lone = $derived(shared ? undefined : site.members[0]);
	/** The city, where a node alone is named by its country: Gävle, of `Sweden, European Union`. */
	const city = $derived(
		lone && !nameOf(lone.code).full.includes(partOf(lone.code)) ? partOf(lone.code) : undefined,
	);

	const cpuOf = (member: Member) =>
		member.cpu === undefined ? undefined : `${member.cpu.toFixed(1)}%`;
	const ramOf = (member: Member) =>
		member.used === undefined ? undefined : `${(member.used / GIB).toFixed(1)}G`;
	/** How long it has been up, in its two largest units and no space inside one: `3d 2h`. */
	function upOf(member: Member): string {
		if (member.state === 'gone') return 'Not heard';
		const up = uptime(member.booted, now);
		if (up === undefined) return '–';
		const [days, hours, minutes] = [
			Math.floor(up / 86_400),
			Math.floor((up % 86_400) / 3600),
			Math.floor((up % 3600) / 60),
		];
		if (days) return `${days}d ${hours}h`;
		if (hours) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	const ROWS = ['Uptime', 'Role', 'Apps running', 'CPU', 'RAM'] as const;

	const styles = stylex.create({
		card: {
			paddingBlock: 10,
			paddingInline: 12,
			backgroundColor: 'var(--color-surface)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: 8,
			boxShadow: '0 4px 12px rgb(0 0 0 / 0.18), 0 1px 3px rgb(0 0 0 / 0.12)',
			fontSize: text.px13,
			lineHeight: 1.4,
		},
		title: { color: 'var(--color-text-strong)', fontWeight: weight.semibold },
		muted: { color: 'var(--color-text-muted)' },
		value: { color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
		head: {
			color: 'var(--color-text-strong)',
			fontWeight: weight.medium,
			borderRadius: 6,
			textDecorationLine: { default: 'none', ':hover': 'underline' },
			textUnderlineOffset: '0.2em',
			outline: { default: 'none', ':focus-visible': '2px solid var(--color-accent)' },
			transitionProperty: 'color',
			transitionDuration: hover.base,
		},
	});
</script>

{#snippet value(member: Member, row: (typeof ROWS)[number])}
	{#if row === 'Uptime'}
		<span class={stylex.attrs(member.state === 'gone' && tone.bad).class}>{upOf(member)}</span>
	{:else if row === 'Role'}
		{ROLES[member.role]}
	{:else if row === 'Apps running'}
		{member.apps ? `${member.apps.running} of ${member.apps.total}` : '–'}
	{:else if row === 'CPU'}
		{#if cpuOf(member) === undefined}–{:else}<Gauge
				share={(member.cpu ?? 0) / 100}
				size={14}
				label="Processor {cpuOf(member)} busy"
				figure={cpuOf(member)}
			/>{/if}
	{:else if ramOf(member) === undefined}
		–
	{:else}
		<Gauge
			share={member.memory ? (member.used ?? 0) / member.memory : undefined}
			size={14}
			label="Memory {ramOf(member)} in use"
			figure={ramOf(member)}
		/>
	{/if}
{/snippet}

<div class="flex flex-col gap-1.5 {stylex.attrs(styles.card).class}" data-site={site.key}>
	<span class="flex items-baseline gap-2">
		<span class="inline-flex items-center gap-1.5 {stylex.attrs(styles.title).class}">
			<Flag code={site.members[0]?.code ?? site.key} size={14} />
			{nameOf(site.members[0]?.code ?? site.key).full}
		</span>
		{#if city}<span class="ml-auto pl-3 {stylex.attrs(styles.muted).class}">{city}</span>{/if}
	</span>
	{#if lone}
		<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
			{#each ROWS as row (row)}
				<dt class={stylex.attrs(styles.muted).class}>{row}</dt>
				<dd class={stylex.attrs(styles.value).class}>{@render value(lone, row)}</dd>
			{/each}
		</dl>
	{:else}
		<!-- One table, the place's nodes as its columns, so its rows are read across. -->
		<!-- The console's table rules and padding are for a page's tables, not a card's. -->
		<table class="w-auto">
			<thead>
				<tr>
					<th scope="col" class="border-0 p-0"><span class="sr-only">For each node</span></th>
					{#each site.members as member (member.code)}
						<th scope="col" class="border-0 py-0.5 pr-0 pl-6 text-right font-normal">
							<a
								href={toNode(member.code)}
								data-row={member.code}
								aria-label="{partOf(member.code)}, {nameOf(member.code).full} ({member.code})"
								class={stylex.attrs(styles.head).class}>{partOf(member.code)}</a
							>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each ROWS as row (row)}
					<tr>
						<th
							scope="row"
							class="border-0 p-0 py-0.5 text-left font-normal {stylex.attrs(styles.muted).class}"
							>{row}</th
						>
						{#each site.members as member (member.code)}
							<td
								class="border-0 py-0.5 pr-0 pl-6 whitespace-nowrap {stylex.attrs(styles.value)
									.class}">{@render value(member, row)}</td
							>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
