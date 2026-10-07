<script lang="ts">
	/** A page whose view holds nothing of what it shows yet, said once in place of the page. */
	import * as stylex from '@stylexjs/stylex';
	import { surfaces, type } from '../style.ts';
	import { type View, labelOf } from './scope.ts';

	let { view }: { view: View } = $props();
</script>

<p
	class="flex min-h-48 items-center justify-center p-6 {stylex.attrs(surfaces.card, type.soft)
		.class}"
>
	{view === 'all' ? 'Nothing deployed yet.' : `Nothing deployed in ${labelOf(view)} yet.`}
</p>
