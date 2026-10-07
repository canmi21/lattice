<script lang="ts">
	/** A node's name with its state before it: the dot's tone and `title`, never the color alone. */
	import * as stylex from '@stylexjs/stylex';
	import { surfaces, tone, type } from '../style.ts';
	import type { State } from './apps.ts';

	let { node, state }: { node: string; state: State } = $props();

	const TONES = { running: 'good', held: 'warn', stopped: 'bad' } as const;
</script>

<span
	title="{node}: {state}"
	class="inline-flex h-5.5 items-center gap-1.5 px-2 {stylex.attrs(surfaces.pill, type.mono).class}"
>
	<span class="size-1.5 {stylex.attrs(surfaces.dot, tone[TONES[state]]).class}"></span>
	{node}
	<span class="sr-only">{state}</span>
</span>
