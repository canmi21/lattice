<script lang="ts" module>
	/** The spans a monitoring page is read over, in seconds; the time range's usual choices. */
	export const RANGES = [
		{ key: '1h', label: '1h', seconds: 3600 },
		{ key: '6h', label: '6h', seconds: 6 * 3600 },
		{ key: '24h', label: '24h', seconds: 86_400 },
		{ key: '7d', label: '7d', seconds: 7 * 86_400 },
		{ key: '30d', label: '30d', seconds: 30 * 86_400 },
	] as const;

	export type Range = (typeof RANGES)[number]['key'];
</script>

<script lang="ts" generics="Key extends string">
	/**
	 * A choice of a few, side by side, the chosen one on a raised ground. Each option carries its
	 * own ground rather than one that travels, so the server draws the choice where it is. An option
	 * with an `href` is a link, the way a time range in the query works before the page hydrates.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';

	let {
		options,
		value = $bindable(),
		label,
	}: {
		options: readonly { key: Key; label: string; href?: string }[];
		value: Key;
		label: string;
	} = $props();

	const elements: HTMLElement[] = $state([]);

	function key(event: KeyboardEvent, index: number) {
		const step =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		event.preventDefault();
		const next = (index + step + options.length) % options.length;
		const option = options[next];
		if (option && !option.href) value = option.key;
		elements[next]?.focus();
	}

	const styles = stylex.create({
		frame: {
			backgroundColor: 'var(--color-sunken)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: radius.md,
		},
		option: {
			backgroundColor: 'transparent',
			borderWidth: 0,
			borderRadius: radius.sm,
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px12,
			fontWeight: weight.medium,
			transitionProperty: 'color, background-color',
			transitionDuration: duration.base,
		},
		chosen: { backgroundColor: 'var(--color-selected)', color: 'var(--color-text-strong)' },
	});
</script>

<div
	class="inline-flex gap-0.5 p-0.5 {stylex.attrs(styles.frame).class}"
	role="radiogroup"
	aria-label={label}
>
	{#each options as option, index (option.key)}
		{@const chosen = option.key === value}
		{@const shape = `inline-flex h-7 items-center px-3 whitespace-nowrap ${
			stylex.attrs(styles.option, chosen && styles.chosen).class
		}`}
		{#if option.href}
			<a
				bind:this={elements[index]}
				href={option.href}
				role="radio"
				aria-checked={chosen}
				tabindex={chosen ? 0 : -1}
				class={shape}
				onkeydown={(event) => key(event, index)}>{option.label}</a
			>
		{:else}
			<button
				bind:this={elements[index]}
				type="button"
				role="radio"
				aria-checked={chosen}
				tabindex={chosen ? 0 : -1}
				class={shape}
				onclick={() => (value = option.key)}
				onkeydown={(event) => key(event, index)}>{option.label}</button
			>
		{/if}
	{/each}
</div>
