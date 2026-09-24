<script module lang="ts">
	import { compileFragment, type Fragment } from './collection';

	/**
	 * Compiled fragments by their text. A block is drawn again whenever the document around it
	 * changes, and the answer to the same markdown does not.
	 */
	const compiled = new Map<string, Promise<Fragment>>();

	function fragment(markdown: string, language: string): Promise<Fragment> {
		const key = `${language}\n${markdown}`;
		let held = compiled.get(key);
		if (!held) {
			held = compileFragment(markdown, language).catch((error: unknown) => ({
				error: error instanceof Error ? error.message : String(error),
			}));
			compiled.set(key, held);
		}
		return held;
	}
</script>

<script lang="ts">
	/**
	 * One custom block in the editor, drawn by the component the site draws it with.
	 *
	 * The block's own markdown is compiled by `local` the way a preview is, and the answer is
	 * handed to the article body -- so what stands in the document is the site's rendering, not
	 * an imitation of it. A refusal is shown in the block's place with the reason and the source,
	 * because a block that silently draws nothing is one the author cannot find to fix. See
	 * spec/architecture/local.md, "A custom block is drawn in the editor as what it is".
	 */
	import * as stylex from '@stylexjs/stylex';
	import ArticleBody from '@canmi/prose/body.svelte';
	import { family, radius, text } from '@canmi/tokens/vocabulary.stylex';

	let {
		markdown,
		language,
		name,
		selected,
	}: { markdown: string; language: string; name: string; selected: boolean } = $props();

	const answer = $derived(fragment(markdown, language));

	const styles = stylex.create({
		frame: {
			borderRadius: radius.lg,
			outlineOffset: '0.25rem',
			outlineWidth: '2px',
			outlineStyle: 'solid',
			outlineColor: 'transparent',
		},
		selected: { outlineColor: 'var(--color-border-strong)' },
		pending: {
			borderRadius: radius.lg,
			backgroundColor: 'var(--color-paper)',
			color: 'var(--color-text-muted)',
			fontFamily: family.monoTheme,
			fontSize: text.px13,
		},
		refused: {
			borderRadius: radius.lg,
			borderWidth: '1px',
			borderStyle: 'dashed',
			borderColor: 'var(--color-red)',
			color: 'var(--color-text-soft)',
			fontSize: text.px13,
		},
		reason: { color: 'var(--color-red)' },
		source: { fontFamily: family.monoTheme, whiteSpace: 'pre-wrap' },
	});
</script>

<div class={stylex.attrs(styles.frame, selected && styles.selected).class}>
	{#await answer}
		<div class="px-4 py-3 {stylex.attrs(styles.pending).class}">::{name}</div>
	{:then result}
		{#if 'error' in result}
			<div class="flex flex-col gap-2 px-4 py-3 {stylex.attrs(styles.refused).class}">
				<span class={stylex.attrs(styles.reason).class}>{result.error}</span>
				<code class={stylex.attrs(styles.source).class}>{markdown}</code>
			</div>
		{:else}
			<ArticleBody blocks={result.blocks} resources={result.resources} locale="mw" />
		{/if}
	{/await}
</div>
