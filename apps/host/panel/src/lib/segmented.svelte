<script lang="ts" generics="Key extends string">
	/** A choice of a few, side by side, the chosen one's ground crossing to the next. */
	import * as stylex from '@stylexjs/stylex';
	import { travel, type Place } from './motion';
	import { duration, radius, text, weight } from './style/vocabulary.stylex';

	let { options, value = $bindable() }: { options: { key: Key; label: string }[]; value: Key } =
		$props();

	const buttons: HTMLButtonElement[] = $state([]);
	let marker: HTMLElement | undefined = $state();
	let placed: Place | undefined;

	$effect(() => {
		const button = buttons[options.findIndex((option) => option.key === value)];
		if (!marker || !button) return;
		const to = { start: button.offsetLeft, size: button.offsetWidth };
		travel(marker, placed, to, 'x');
		placed = to;
	});

	const styles = stylex.create({
		frame: {
			backgroundColor: 'var(--color-sunken)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: radius.md,
		},
		marker: { backgroundColor: 'var(--color-selected)', borderRadius: radius.sm },
		option: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px12,
			fontWeight: weight.medium,
			transitionProperty: 'color',
			transitionDuration: duration.hover,
		},
		chosen: { color: 'var(--color-text-strong)' },
	});
</script>

<div class="relative inline-flex p-0.5 {stylex.attrs(styles.frame).class}" role="radiogroup">
	<span
		bind:this={marker}
		class="pointer-events-none absolute top-0.5 bottom-0.5 left-0 {stylex.attrs(styles.marker)
			.class}"
	></span>
	{#each options as option, index (option.key)}
		<button
			bind:this={buttons[index]}
			type="button"
			role="radio"
			aria-checked={option.key === value}
			class="relative h-7 border-0 bg-transparent px-3 whitespace-nowrap {stylex.attrs(
				styles.option,
				option.key === value && styles.chosen,
			).class}"
			onclick={() => (value = option.key)}>{option.label}</button
		>
	{/each}
</div>
