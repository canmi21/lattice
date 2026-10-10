<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		applyTheme,
		currentTheme,
		observeTheme,
		themeCookie,
		type Theme,
	} from '@canmi/kit/theme';

	let { initial }: { initial: Theme } = $props();

	/** The theme on screen: the server's reading of the cookie, then the document's own class. */
	let theme = $state<Theme>(untrack(() => initial));
	onMount(() => {
		theme = currentTheme();
		return observeTheme((next) => (theme = next));
	});

	function flip() {
		const next = theme === 'dark' ? 'light' : 'dark';
		applyTheme(next);
		document.cookie = themeCookie(next);
	}
</script>

<button
	type="button"
	class="rounded-md px-2 py-1 text-(--foreground-muted) hover:bg-(--interaction-hover) hover:text-(--foreground-strong)"
	onclick={flip}
>
	{theme === 'dark' ? 'Light' : 'Dark'}
</button>
