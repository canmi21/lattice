<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { line } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the support page's links. Every colour is the token variable
	 * `libs/tokens` already declares. See spec/architecture/css/authoring.md.
	 *
	 * `focus-link` stays in the markup beside these: it is the site's named vocabulary, which
	 * both the utility this replaces and this style already outrank. See spec/todo/todo.md, "The
	 * named layer in CSS is the visual layer, written before there was one".
	 */
	const styles = stylex.create({
		link: {
			lineHeight: line.tight,
			color: 'var(--color-text-strong)',
		},
	});
</script>

<script lang="ts">
	import Icon from './icons.svelte';
	import * as m from '@canmi/messages';
	import type { PageBlock } from '@canmi/artifacts/types';
	import type { LocaleCode } from '$lib/locale';

	/** `locale` is the view being rendered. Passed rather than read: see
	 *  spec/locale/addressing.md. */
	let { blocks, locale }: { blocks: PageBlock[]; locale: LocaleCode } = $props();
</script>

{#each blocks as block, i (i)}
	{#if block.type === 'p'}
		<p>
			{#each block.segments as seg, j (j)}
				{#if seg.type === 'html'}
					<!-- Compiled at build time from the tracked corpus, not reader input. Stated
					     rather than suppressed; see spec/lint-format.md. -->
					{@html seg.html}
				{:else}
					<a
						href={seg.href}
						class="focus-link inline-flex items-center gap-1 align-middle {stylex.attrs(styles.link)
							.class} {seg.width ?? ''}"
						{...seg.new_tab ? { target: '_blank', rel: 'noopener' } : {}}
					>
						{#if seg.icon}<Icon name={seg.icon} />{/if}
						<!-- The label is its own element so that the rule runs under the words and not
						     under the icon beside them. -->
						<span class="underline decoration-border underline-offset-4">{seg.label}</span>
						{#if seg.new_tab}<span class="sr-only">
								({m['support.new-tab']({}, { locale })})</span
							>{/if}
					</a>
				{/if}
			{/each}
		</p>
	{:else}
		<!-- Compiled at build time from the tracked corpus, not reader input. Stated rather
		     than suppressed; see spec/lint-format.md. -->
		{@html block.html}
	{/if}
{/each}
