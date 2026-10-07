<script lang="ts" generics="Key extends string">
	/**
	 * A row of tabs, the chosen one underlined. Each tab carries its own underline rather than one
	 * that travels, so the server draws it under the right tab and nothing moves on hydration. A tab
	 * with an `href` is a link, the way to tabs that are pages; the rest switch `current`.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { surfaces } from '../style.ts';

	let {
		tabs,
		current = $bindable(),
		label,
	}: {
		tabs: { key: Key; label: string; href?: string }[];
		current: Key;
		label?: string;
	} = $props();

	const buttons: HTMLElement[] = $state([]);

	function key(event: KeyboardEvent, index: number) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const next = (index + step + tabs.length) % tabs.length;
		const tab = tabs[next];
		if (tab && !tab.href) current = tab.key;
		buttons[next]?.focus();
	}

	const styles = stylex.create({
		tab: {
			backgroundColor: 'transparent',
			borderWidth: 0,
			borderBottomWidth: border.doublePx,
			borderBottomStyle: 'solid',
			borderBottomColor: 'transparent',
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px13,
			fontWeight: weight.medium,
			transitionProperty: 'color, border-color',
			transitionDuration: duration.base,
		},
		chosen: { color: 'var(--color-text-strong)', borderBottomColor: 'var(--color-text-strong)' },
	});
</script>

<div class="mb-5 flex gap-6 {stylex.attrs(surfaces.bar).class}" role="tablist" aria-label={label}>
	{#each tabs as tab, index (tab.key)}
		{@const chosen = tab.key === current}
		{@const shape = `-mb-px inline-flex h-10 items-center px-0.5 ${
			stylex.attrs(styles.tab, chosen && styles.chosen).class
		}`}
		{#if tab.href}
			<a
				bind:this={buttons[index]}
				href={tab.href}
				role="tab"
				aria-selected={chosen}
				aria-current={chosen ? 'page' : undefined}
				tabindex={chosen ? 0 : -1}
				class={shape}
				onkeydown={(event) => key(event, index)}>{tab.label}</a
			>
		{:else}
			<button
				bind:this={buttons[index]}
				type="button"
				role="tab"
				aria-selected={chosen}
				tabindex={chosen ? 0 : -1}
				class={shape}
				onclick={() => (current = tab.key)}
				onkeydown={(event) => key(event, index)}>{tab.label}</button
			>
		{/if}
	{/each}
</div>
