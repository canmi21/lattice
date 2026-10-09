<script lang="ts">
	/**
	 * A country's flag, drawn by Twemoji, flat as the rest of the console is, rather than by the
	 * system's emoji font; only the flags of the countries a node stands in are bundled. Nothing
	 * where the country has no flag here. See spec/console/overview.md, "A place's card says what
	 * the list does not".
	 */
	import BE from '@twemoji/svg/1f1e7-1f1ea.svg?url';
	import CN from '@twemoji/svg/1f1e8-1f1f3.svg?url';
	import GB from '@twemoji/svg/1f1ec-1f1e7.svg?url';
	import JP from '@twemoji/svg/1f1ef-1f1f5.svg?url';
	import SE from '@twemoji/svg/1f1f8-1f1ea.svg?url';
	import US from '@twemoji/svg/1f1fa-1f1f8.svg?url';
	import { isoOf } from './places.ts';

	let { code, size = 16 }: { code: string; size?: number } = $props();

	const FLAGS: Readonly<Record<string, string>> = { BE, CN, GB, JP, SE, US };
	const src = $derived(FLAGS[isoOf(code) ?? '']);
</script>

{#if src}
	<img {src} alt="" width={size} height={size} class="inline-block shrink-0 align-[-0.15em]" />
{/if}
