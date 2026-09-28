<script lang="ts">
	/**
	 * The second step every action on an app takes: it says what is about to happen, and happens
	 * only on the button that names it. See spec/architecture/host.md, "What the panel can do to an
	 * app".
	 */
	import * as stylex from '@stylexjs/stylex';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Button from './button.svelte';
	import { arrive } from './motion';
	import { surfaces, tone, type } from './style/surfaces';

	let {
		title,
		detail,
		confirm,
		danger = false,
		onconfirm,
		oncancel,
	}: {
		title: string;
		detail: string;
		confirm: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	$effect(() => {
		dialog.showModal();
		arrive(dialog);
	});
</script>

<dialog
	bind:this={dialog}
	onclose={oncancel}
	class="m-auto w-full max-w-md p-6 backdrop:bg-black/50 {stylex.attrs(surfaces.card, type.body)
		.class}"
>
	<div class="flex gap-4">
		{#if danger}
			<span class="mt-0.5 shrink-0 {stylex.attrs(tone.danger).class}"
				><TriangleAlert size={20} /></span
			>
		{/if}
		<div class="flex flex-col gap-2">
			<h2 class={stylex.attrs(type.heading).class}>{title}</h2>
			<p class={stylex.attrs(type.muted).class}>{detail}</p>
		</div>
	</div>
	<div class="mt-6 flex justify-end gap-2">
		<Button variant="ghost" onclick={oncancel}>Cancel</Button>
		<Button variant={danger ? 'danger' : 'primary'} onclick={onconfirm}>{confirm}</Button>
	</div>
</dialog>
