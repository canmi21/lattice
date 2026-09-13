<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	/**
	 * The visual half of the support page's links. Every colour is the token variable
	 * `libs/tokens` already declares, so nothing here can change one. See
	 * spec/architecture/css.md.
	 *
	 * `focus-link` stays in the markup beside these. It is the site's named vocabulary rather
	 * than a utility, and it sits in Tailwind's `components` layer, which both the utility this
	 * replaces and this style outrank -- so the line it declares loses here exactly as it lost
	 * before. See spec/todo.md on where that vocabulary should live.
	 */
	const styles = stylex.create({
		link: {
			lineHeight: 1.25,
			color: 'var(--color-text-strong)',
		},
		/** The label, which carries the rule under the words rather than under the icon. */
		label: {
			textDecorationLine: 'underline',
			textDecorationColor: 'var(--color-border)',
			textUnderlineOffset: '4px',
		},
	});
</script>

<script lang="ts">
	import Icon from './icons.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageBlock } from '$lib/content/types';
	import type { LocaleCode } from '$lib/locale';

	/** `locale` is the view being rendered. Passed rather than read: see spec/locale.md. */
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
						{...seg.newTab ? { target: '_blank', rel: 'noopener' } : {}}
					>
						{#if seg.icon}<Icon name={seg.icon} />{/if}
						<span class={stylex.attrs(styles.label).class}>{seg.label}</span>
						{#if seg.newTab}<span class="sr-only">
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
