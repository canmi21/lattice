<script lang="ts">
	/** A read that failed, said plainly where its data would be. */
	import * as stylex from '@stylexjs/stylex';
	import type { Failure } from './server/read.ts';
	import { surfaces, type } from './style.ts';

	let { what, failure }: { what: string; failure: Failure } = $props();
</script>

<div class="flex flex-col gap-1 p-4 {stylex.attrs(surfaces.empty).class}">
	<p class={stylex.attrs(type.name).class}>{what} could not be read</p>
	<p class={stylex.attrs(type.soft).class}>
		{failure.message} <span class={stylex.attrs(type.mono).class}>{failure.code}</span>
	</p>
</div>
