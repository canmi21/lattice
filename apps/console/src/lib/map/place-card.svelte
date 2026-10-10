<script lang="ts">
	/**
	 * What a mark's card says of its place, as rows of a name and a value: how long it has been up,
	 * its role, the apps it runs, two rings, how busy its processor is and how much memory is in
	 * use, written in `G`, and its round trip to the database's primary. A shared place's nodes
	 * follow one under another with no title over them, each headed by its city and country --
	 * `Narita, Japan` -- never its code, and each head a link to its node. The map places the card;
	 * this draws it. See spec/console/overview.md, "A place's card says what the list does not".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration as hover, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import AppsIcon from '@tabler/icons-svelte-runes/icons/apps';
	import ClockUpIcon from '@tabler/icons-svelte-runes/icons/clock-up';
	import CpuIcon from '@tabler/icons-svelte-runes/icons/cpu';
	import MemoryIcon from '@tabler/icons-svelte-runes/icons/memory';
	import TopologyIcon from '@tabler/icons-svelte-runes/icons/topology-star-3';
	import SpeedtestIcon from '@tabler/icons-svelte-runes/icons/brand-speedtest';
	import Gauge from '../chart/gauge.svelte';
	import Icon from '../design/icon.svelte';
	import type { IconComponent } from '../design/optics.ts';
	import Flag from './flag.svelte';
	import { reshape } from '../design/motion.ts';
	import { uptime } from '../nodes/machine.ts';
	import { scoped } from '../scope/context.ts';
	import { tone, type, type Tone } from '../style.ts';
	import type { State } from '../wire.ts';
	import { countryOf, nameOf, partOf, ROLES, type Member, type Site } from './places.ts';

	let { site, now }: { site: Site; now: number } = $props();

	const { node: toNode } = scoped();
	const GIB = 2 ** 30;

	const shared = $derived(site.members.length > 1);
	const lone = $derived(shared ? undefined : site.members[0]);

	const cpuOf = (member: Member) =>
		member.cpu === undefined ? undefined : `${member.cpu.toFixed(1)}%`;
	const ramOf = (member: Member) =>
		member.used === undefined ? undefined : `${(member.used / GIB).toFixed(1)}G`;
	/**
	 * Its round trip to the database's primary: a tenth of a millisecond under ten, whole above;
	 * `Primary` on the primary itself, and nothing where its relay has not timed it lately.
	 */
	function latencyOf(member: Member): string {
		if (member.primary) return 'Primary';
		if (member.latency === undefined) return '–';
		return `${member.latency < 10 ? member.latency.toFixed(1) : Math.round(member.latency)}ms`;
	}

	/**
	 * How long it has been up, in its two largest units and no space inside one: `3d 2h`; in its
	 * place, why it is away, as spec/architecture/console.md, "A node has three states on the map".
	 */
	function upOf(member: Member): string {
		if (member.state === 'gone') return 'Not heard';
		if (member.state === 'upgrading') return 'Upgrading';
		if (member.state === 'restarting') return 'Restarting';
		if (member.state === 'waiting') return 'Waiting';
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

	/** The tone a word in the uptime's place takes; a figure takes none. */
	const UPTIME_TONE: Partial<Record<State, Tone>> = {
		upgrading: 'warn',
		restarting: 'warn',
		waiting: 'quiet',
		gone: 'bad',
	};

	const ROWS = ['Uptime', 'Role', 'Apps', 'CPU', 'RAM', 'Latency'] as const;
	/** Each row's mark, before its name, as a menu's rows carry theirs. */
	const GLYPHS: Readonly<Record<(typeof ROWS)[number], IconComponent>> = {
		Uptime: ClockUpIcon,
		Role: TopologyIcon,
		Apps: AppsIcon,
		CPU: CpuIcon,
		RAM: MemoryIcon,
		Latency: SpeedtestIcon,
	};
	const LAST = ROWS.at(-1);
	/**
	 * The card's first and last words cut to their ink, cap height above and baseline below, so
	 * its padding reads as even on every side rather than gaining a line's leading at top and
	 * foot. A browser without `text-box` keeps the leading, as before.
	 */
	const START = '[text-box:trim-start_cap_alphabetic]';
	const END = '[text-box:trim-end_cap_alphabetic]';

	const styles = stylex.create({
		card: {
			// Even on every side, measured from the words' ink, which `TRIM` cuts the leading to.
			padding: 12,
			backgroundColor: 'var(--color-surface)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: 8,
			fontSize: text.px13,
			lineHeight: 1.4,
		},
		title: { color: 'var(--color-text-strong)', fontWeight: weight.semibold },
		/** A word among figures, as `Primary` is in the latency's row. */
		word: { fontFamily: 'var(--font-sans)' },
		muted: { color: 'var(--color-text-muted)' },
		value: { color: 'var(--color-text)', textAlign: 'right' },
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
		{@const said = UPTIME_TONE[member.state]}
		<span class={stylex.attrs(said && tone[said]).class}>{upOf(member)}</span>
	{:else if row === 'Role'}
		<!-- A word, in the sans; every other row is a figure, in the shell's face. -->
		{ROLES[member.role]}
	{:else if row === 'Apps'}
		{member.apps ? `${member.apps.running}/${member.apps.total}` : '–'}
	{:else if row === 'CPU'}
		{#if cpuOf(member) === undefined}–{:else}<Gauge
				share={(member.cpu ?? 0) / 100}
				size={14}
				label="Processor {cpuOf(member)} busy"
				figure={cpuOf(member)}
			/>{/if}
	{:else if row === 'Latency'}
		<span
			title="Round trip to the database's primary"
			class={stylex.attrs(member.primary && styles.word).class}>{latencyOf(member)}</span
		>
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

{#snippet named(row: (typeof ROWS)[number])}
	<Icon icon={GLYPHS[row]} size={14} words={row} class="mr-1.5" />{row}
{/snippet}

{#snippet rows(member: Member)}
	<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
		{#each ROWS as row (row)}
			<dt class="{row === LAST ? END : ''} {stylex.attrs(styles.muted).class}">
				{@render named(row)}
			</dt>
			<dd
				class="{row === LAST ? END : ''} {stylex.attrs(styles.value, row !== 'Role' && type.shell)
					.class}"
			>
				{@render value(member, row)}
			</dd>
		{/each}
	</dl>
{/snippet}

<!-- The frame, carried to a new size when its words change it, and what it holds at its own. -->
<div
	class="overflow-hidden {stylex.attrs(styles.card).class}"
	data-site={site.key}
	{@attach reshape}
>
	<div class="flex w-max flex-col gap-1.5">
		{#if lone}
			<!-- Its country's flag before its name, as the timeline and the place list wear it. -->
			<span class="flex items-center gap-2">
				<Flag code={lone.code} size={14} />
				<span class="block {START} {stylex.attrs(styles.title).class}"
					>{nameOf(lone.code).full}</span
				>
			</span>
			{@render rows(lone)}
		{:else}
			<!-- One table: the rows named once at the left, a little apart, and the place's nodes as
		     close columns headed by their cities, the country in the corner over the names. The
		     console's table rules and padding are for a page's tables, not a card's. -->
			<table class="w-auto">
				<thead>
					<tr>
						<th
							scope="col"
							class="border-0 p-0 pr-5 text-left font-normal {START} {stylex.attrs(styles.muted)
								.class}"
							><span class="inline-flex items-center gap-2"
								><Flag code={site.members[0]?.code ?? site.key} size={14} /><span class={START}
									>{countryOf(site.members[0]?.code ?? site.key)}</span
								></span
							></th
						>
						{#each site.members as member (member.code)}
							<th scope="col" class="border-0 pt-0 pr-0 pb-0.5 pl-3 text-right font-normal {START}">
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
								class="border-0 p-0 py-0.5 pr-5 text-left font-normal {row === LAST
									? `pb-0 ${END}`
									: ''} {stylex.attrs(styles.muted).class}">{@render named(row)}</th
							>
							{#each site.members as member (member.code)}
								<td
									class="border-0 py-0.5 pr-0 pl-3 whitespace-nowrap {row === LAST
										? `pb-0 ${END}`
										: ''} {stylex.attrs(styles.value, row !== 'Role' && type.shell).class}"
									>{@render value(member, row)}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
