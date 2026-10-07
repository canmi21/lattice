<script lang="ts">
	/**
	 * An app as the console names it: its display name, in the type around it, and its code name
	 * small and muted beside it. See spec/architecture/console.md, "A node is shown by its city, and
	 * its code is the key".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { displayOf } from '../scope/scope.ts';
	import { type } from '../style.ts';

	let { app }: { app: string } = $props();

	const name = $derived(displayOf(app));
	const styles = stylex.create({
		code: { color: 'var(--color-text-muted)', fontSize: text.px11 },
	});
</script>

<!-- Positioned, so a row's link drawn over the whole row does not cover its title. -->
<span class="relative inline-flex items-baseline gap-1.5 whitespace-nowrap"
	>{name}{#if name !== app}<span class={stylex.attrs(type.mono, styles.code).class}>{app}</span
		>{/if}</span
>
