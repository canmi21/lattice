<script lang="ts">
	/**
	 * A node as the console names it: its display name, in the type around it, and the code that
	 * tells it from the other nodes sharing that name small and muted beside it. `short` writes the
	 * name's first part alone, for a table cell or a chip, the whole of it on hover. See
	 * spec/architecture/console.md, "A node is shown by its city, and its code is the key".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { nameOf } from '../map/places.ts';
	import { type } from '../style.ts';

	let { code, short = false }: { code: string; short?: boolean } = $props();

	const name = $derived(nameOf(code));
	const styles = stylex.create({
		code: { color: 'var(--color-text-muted)', fontSize: text.px11 },
	});
</script>

<!-- Positioned, so a row's link drawn over the whole row does not cover its title. -->
<span
	class="relative inline-flex items-baseline gap-1.5 whitespace-nowrap"
	title={short && name.lead !== name.full ? name.full : undefined}
	>{short ? name.lead : name.full}{#if name.full !== code}<span
			class={stylex.attrs(type.mono, styles.code).class}>{code}</span
		>{/if}</span
>
