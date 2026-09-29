<script lang="ts">
	import { applyTheme, currentTheme, observeTheme, themeCookie, type Theme } from '@canmi/theme';

	// Unknown until the browser says: the render is shared, so the server cannot know a reader's.
	let theme = $state<Theme | null>(null);

	$effect(() => {
		theme = currentTheme();
		return observeTheme((next) => (theme = next));
	});

	const next = $derived<Theme>(theme === 'dark' ? 'light' : 'dark');

	function toggle() {
		applyTheme(next);
		document.cookie = themeCookie(next);
	}
</script>

<button
	type="button"
	class="focus-ring grid size-8 place-items-center rounded-full text-text-soft transition-colors hover:bg-paper-hover hover:text-text-strong"
	aria-label={theme ? `Switch to the ${next} theme` : 'Switch theme'}
	onclick={toggle}
>
	<svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
		<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
		<path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" />
	</svg>
</button>
