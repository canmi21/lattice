<script lang="ts">
	/**
	 * What the shortcut opens from anywhere: ./find-body.svelte in a panel over the page, which dims
	 * behind it, so finding something does not lose the place one was at. The sidebar's field opens
	 * the same in place instead, ./find.svelte. See spec/console/design.md, "The sidebar's head is
	 * the way in to finding".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import { Dialog } from 'bits-ui';
	import FindBody from './find-body.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const styles = stylex.create({
		panel: {
			borderRadius: radius.lg,
			backgroundColor: 'var(--color-surface)',
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line), 0 16px 48px rgb(0 0 0 / 0.24)`,
			color: 'var(--color-text)',
		},
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="find-overlay fixed inset-0 z-60" />
		<Dialog.Content
			class="fixed top-[14vh] left-1/2 z-60 flex max-h-[min(30rem,70vh)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden {stylex.attrs(
				styles.panel,
			).class}"
		>
			<Dialog.Title class="sr-only">Find</Dialog.Title>
			<FindBody {open} close={() => (open = false)} name="palette" />
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Portalled out of the component, so global; the page behind dims rather than blurs. */
	:global(.find-overlay) {
		background: color-mix(in oklch, var(--color-ground) 60%, transparent);
	}
</style>
