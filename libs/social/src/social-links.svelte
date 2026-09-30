<script lang="ts">
	import Icon from '@canmi/prose/icons.svelte';
	import { socialLinks, type SocialName } from './index';

	/**
	 * The row's layout and icons; the links' color, hover and focus colors are `linkClass`, the
	 * caller's, and the glyphs draw in the link's current color.
	 */
	let {
		entries,
		hrefs = {},
		newTab,
		linkClass = '',
		scale = '1rem',
	}: {
		entries: readonly SocialName[];
		/** Overrides an entry's address; required for the ones only the app knows. */
		hrefs?: Partial<Record<SocialName, string>>;
		/** Appended to an external link's accessible name, as "(opens in new tab)" says it. */
		newTab: string;
		linkClass?: string;
		/** The row's size: an icon is `1em` of it, and every gap and box keeps its proportion. */
		scale?: string;
	} = $props();

	const links = $derived(socialLinks(entries, hrefs));
</script>

<nav
	aria-label="Find me elsewhere"
	class="flex flex-wrap items-center gap-[0.75em]"
	style:font-size={scale}
>
	{#each links as link (link.label)}
		<a
			href={link.href}
			aria-label={link.href.startsWith('/') ? link.label : `${link.label} (${newTab})`}
			title={link.label}
			data-sveltekit-reload={link.document ? true : undefined}
			class="focus-ring inline-flex size-[1.25em] items-center justify-center {linkClass}"
			{...link.href.startsWith('/') ? {} : { target: '_blank', rel: 'noopener' }}
		>
			<Icon name={link.icon} class={link.size} />
		</a>
	{/each}
</nav>
