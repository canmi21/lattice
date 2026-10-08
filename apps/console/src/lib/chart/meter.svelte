<script lang="ts">
	/**
	 * A value against its limit. The fill carries how close it is -- accent, then warn, then danger,
	 * each with an icon and a word -- and the track is a dimmer step of the fill's own hue, so the
	 * state reads across the whole bar and not only its filled part.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import WarningIcon from '@tabler/icons-svelte-runes/icons/alert-triangle';
	import XCircleIcon from '@tabler/icons-svelte-runes/icons/circle-x';
	import { tone, type } from '../style.ts';
	import { compact, percent } from './numbers.ts';

	let {
		label,
		value,
		limit,
		format = compact,
		warn = 0.75,
		danger = 0.9,
	}: {
		label: string;
		value: number;
		limit: number;
		format?: (value: number) => string;
		/** The shares of the limit past which the meter warns, and then alarms. */
		warn?: number;
		danger?: number;
	} = $props();

	const share = $derived(limit > 0 ? value / limit : 0);
	const level = $derived(share >= danger ? 'bad' : share >= warn ? 'warn' : 'calm');
	const FILL = {
		calm: 'var(--color-accent)',
		warn: 'var(--color-warn)',
		bad: 'var(--color-danger)',
	};
	const word = $derived(share > 1 ? 'Over limit' : level === 'bad' ? 'Near limit' : 'High');

	const styles = stylex.create({
		track: { borderRadius: radius.sm, overflow: 'hidden' },
		fill: { borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm },
		figure: { color: 'var(--color-text-strong)' },
	});
</script>

<div
	class="flex min-w-0 flex-col gap-1.5"
	role="meter"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={limit}
	aria-valuenow={Math.min(value, limit)}
	aria-valuetext="{format(value)} of {format(limit)}"
>
	<div class="flex items-baseline justify-between gap-3">
		<span class="truncate {stylex.attrs(type.soft).class}">{label}</span>
		<span class="inline-flex items-center gap-2 whitespace-nowrap {stylex.attrs(type.soft).class}">
			{#if level !== 'calm'}
				<span class="inline-flex items-center gap-1 {stylex.attrs(tone[level]).class}">
					{#if level === 'bad'}<XCircleIcon size={14} stroke={2.5} />{:else}<WarningIcon
							size={14}
							stroke={2.5}
						/>{/if}{word}
				</span>
			{/if}
			<span
				><span class={stylex.attrs(styles.figure).class}>{format(value)}</span> of {format(limit)}
				&middot; {percent(share)}</span
			>
		</span>
	</div>
	<div
		class="h-2 w-full {stylex.attrs(styles.track).class}"
		style:background-color="color-mix(in oklab, {FILL[level]} 22%, var(--color-surface))"
	>
		<div
			class="h-full {stylex.attrs(styles.fill).class}"
			style:width="{Math.min(100, Math.max(0, share * 100))}%"
			style:background-color={FILL[level]}
		></div>
	</div>
</div>
