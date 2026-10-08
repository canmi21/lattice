<script lang="ts">
	/**
	 * A state as an icon and a word in its tone: never the color alone, so it reads the same to a
	 * reader who cannot tell the tones apart.
	 */
	import * as stylex from '@stylexjs/stylex';
	import WarningIcon from '@tabler/icons-svelte-runes/icons/alert-triangle';
	import CheckCircleIcon from '@tabler/icons-svelte-runes/icons/circle-check';
	import MinusCircleIcon from '@tabler/icons-svelte-runes/icons/circle-minus';
	import XCircleIcon from '@tabler/icons-svelte-runes/icons/circle-x';
	import CircleNotchIcon from '@tabler/icons-svelte-runes/icons/loader-2';
	import type { Snippet } from 'svelte';
	import { surfaces, tone as tones, wash, type, type Tone } from '../style.ts';

	let { tone, title, children }: { tone: Tone; title?: string; children: Snippet } = $props();

	const ICONS = {
		good: CheckCircleIcon,
		busy: CircleNotchIcon,
		warn: WarningIcon,
		bad: XCircleIcon,
		quiet: MinusCircleIcon,
	};
	const Icon = $derived(ICONS[tone]);
</script>

<span
	{title}
	class="inline-flex h-5.5 items-center gap-1 px-2 whitespace-nowrap {stylex.attrs(
		surfaces.pill,
		type.soft,
		tones[tone],
		wash[tone],
	).class}"
>
	<Icon size={12} stroke={2.5} aria-hidden="true" />
	{@render children()}
</span>
