<script lang="ts">
	/**
	 * What a mark's card says of its place: a node alone by its figures, a shared place by its sums
	 * and a row per node, each a link to it. The map places the card; this draws it.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { ago } from '../format.ts';
	import { scoped } from '../scope/context.ts';
	import { tone } from '../style.ts';
	import type { Shown } from './marks.ts';
	import { CLUSTERS, PLACES, ROLES, type Site } from './places.ts';

	let { site, now }: { site: Site; now: number } = $props();

	const { node: toNode } = scoped();
	const WORDS: Record<Shown, string> = { live: 'Live', gone: 'Gone' };
	const GIB = 2 ** 30;

	const lone = $derived(site.members.length === 1 ? site.members[0] : undefined);
	const gib = (bytes: number) => `${(bytes / GIB).toFixed(1)} GiB`;
	const percent = (cpu: number) => `${cpu < 10 ? cpu.toFixed(1) : Math.round(cpu)}%`;
	const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;
	const summary = $derived(
		[
			plural(site.members.length, 'node'),
			site.memory === undefined ? undefined : gib(site.memory),
			site.apps === undefined ? undefined : plural(site.apps, 'app'),
		]
			.filter(Boolean)
			.join(', '),
	);

	const styles = stylex.create({
		card: {
			minWidth: 180,
			paddingBlock: 10,
			paddingInline: 12,
			backgroundColor: 'var(--color-surface)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: 8,
			boxShadow: '0 4px 12px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2)',
			fontSize: text.px13,
			lineHeight: 1.4,
		},
		dot: { backgroundColor: 'var(--color-primary)', borderRadius: radius.full },
		gone: { backgroundColor: 'var(--color-danger)' },
		strong: { color: 'var(--color-text-strong)', fontWeight: weight.semibold },
		muted: { color: 'var(--color-text-muted)' },
		value: { color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
		row: {
			borderRadius: 6,
			backgroundColor: { default: 'transparent', ':hover': 'var(--color-raised)' },
			outline: { default: 'none', ':focus-visible': '2px solid var(--color-accent)' },
		},
	});
</script>

{#snippet dot(state: Shown)}
	<span class="size-2 shrink-0 {stylex.attrs(styles.dot, state === 'gone' && styles.gone).class}"
	></span>
{/snippet}

<div class="flex flex-col gap-1.5 {stylex.attrs(styles.card).class}" data-site={site.key}>
	{#if lone}
		<span class="flex items-center gap-2">
			<span class={stylex.attrs(styles.strong).class}>{lone.code}</span>
			{@render dot(lone.state)}
			<span class="ml-auto pl-3 {stylex.attrs(styles.muted).class}"
				>{PLACES[lone.code as keyof typeof PLACES]?.place}</span
			>
		</span>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
			<dt class={stylex.attrs(styles.muted).class}>Status</dt>
			<dd class={stylex.attrs(styles.value, lone.state === 'gone' && tone.bad).class}>
				{WORDS[lone.state]}
			</dd>
			<dt class={stylex.attrs(styles.muted).class}>Heard</dt>
			<dd class={stylex.attrs(styles.value, styles.muted).class}>
				{lone.heard ? ago(lone.heard, now) : 'never'}
			</dd>
			<dt class={stylex.attrs(styles.muted).class}>Role</dt>
			<dd class={stylex.attrs(styles.value).class}>{ROLES[lone.role]}</dd>
			<dt class={stylex.attrs(styles.muted).class}>Apps running</dt>
			<dd class={stylex.attrs(styles.value).class}>
				{lone.apps ? `${lone.apps.running} of ${lone.apps.total}` : '–'}
			</dd>
			<dt class={stylex.attrs(styles.muted).class}>CPU now</dt>
			<dd class={stylex.attrs(styles.value).class}>
				{lone.cpu === undefined ? '–' : percent(lone.cpu)}
			</dd>
			<dt class={stylex.attrs(styles.muted).class}>Memory</dt>
			<dd class={stylex.attrs(styles.value).class}>
				{lone.memory ? gib(lone.memory) : '–'}
			</dd>
			{#if lone.memory && lone.used !== undefined}
				<dt class={stylex.attrs(styles.muted).class}>Memory used</dt>
				<dd class={stylex.attrs(styles.value).class}>
					{Math.round((lone.used / lone.memory) * 100)}%
				</dd>
			{/if}
		</dl>
	{:else}
		<span class="flex items-center gap-2">
			<span class={stylex.attrs(styles.strong).class}>{CLUSTERS[site.key] ?? site.key}</span>
			{@render dot(site.state)}
		</span>
		<span class={stylex.attrs(styles.muted).class}>{summary}</span>
		<ul class="-mx-1.5 flex flex-col">
			{#each site.members as member (member.code)}
				<li>
					<a
						href={toNode(member.code)}
						data-row={member.code}
						class="grid grid-cols-[2.5rem_auto_1fr_auto] items-center gap-x-2 px-1.5 py-0.5 {stylex.attrs(
							styles.row,
						).class}"
					>
						<span class={stylex.attrs(styles.strong).class}>{member.code}</span>
						{@render dot(member.state)}
						<span class={stylex.attrs(styles.value).class}>
							{member.cpu === undefined ? '–' : percent(member.cpu)}
						</span>
						<span class="min-w-14 {stylex.attrs(styles.value).class}">
							{member.apps ? plural(member.apps.running, 'app') : '–'}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
