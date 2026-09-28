<script lang="ts" generics="Key extends string">
	/** A row of tabs over a card, its underline crossing to the one chosen. */
	import * as stylex from '@stylexjs/stylex';
	import { travel, type Place } from './motion';
	import { surfaces } from './style/surfaces';
	import { duration, text, weight } from './style/vocabulary.stylex';

	let { tabs, current = $bindable() }: { tabs: { key: Key; label: string }[]; current: Key } =
		$props();

	const buttons: HTMLButtonElement[] = $state([]);
	let underline: HTMLElement | undefined = $state();
	let placed: Place | undefined;

	$effect(() => {
		const button = buttons[tabs.findIndex((tab) => tab.key === current)];
		if (!underline || !button) return;
		const to = { start: button.offsetLeft, size: button.offsetWidth };
		travel(underline, placed, to, 'x');
		placed = to;
	});

	const styles = stylex.create({
		tab: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px13,
			fontWeight: weight.medium,
			transitionProperty: 'color',
			transitionDuration: duration.hover,
		},
		chosen: { color: 'var(--color-text-strong)' },
		underline: { backgroundColor: 'var(--color-accent)' },
	});
</script>

<div class="relative mb-5 flex gap-6 {stylex.attrs(surfaces.hairline).class}" role="tablist">
	{#each tabs as tab, index (tab.key)}
		<button
			bind:this={buttons[index]}
			role="tab"
			aria-selected={tab.key === current}
			class="h-10 border-0 bg-transparent px-0.5 {stylex.attrs(
				styles.tab,
				tab.key === current && styles.chosen,
			).class}"
			onclick={() => (current = tab.key)}>{tab.label}</button
		>
	{/each}
	<span
		bind:this={underline}
		class="pointer-events-none absolute -bottom-px left-0 h-0.5 {stylex.attrs(styles.underline)
			.class}"
	></span>
</div>
