<script lang="ts">
	/**
	 * A state as an icon and a word in its tone: never the color alone, so it reads the same to a
	 * reader who cannot tell the tones apart.
	 */
	import * as stylex from '@stylexjs/stylex';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleMinus from '@lucide/svelte/icons/circle-minus';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';
	import { surfaces, tone as tones, wash, type, type Tone } from '../style.ts';

	let { tone, title, children }: { tone: Tone; title?: string; children: Snippet } = $props();

	const ICONS = {
		good: CircleCheck,
		busy: LoaderCircle,
		warn: TriangleAlert,
		bad: CircleX,
		quiet: CircleMinus,
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
	<Icon size={12} strokeWidth={2.25} aria-hidden="true" />
	{@render children()}
</span>
