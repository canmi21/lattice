<script lang="ts">
	import { danger as dangerous, primary } from './ui';

	/**
	 * The second step every action on an app takes: it says what is about to happen, and happens
	 * only on the button that names it. See spec/architecture/host.md, "What the panel can do to an
	 * app".
	 */
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
	});
</script>

<dialog
	bind:this={dialog}
	onclose={oncancel}
	class="m-auto max-w-md rounded-xl border border-line bg-surface p-5 text-ink backdrop:bg-black/40"
>
	<h2 class="mb-2 text-base font-semibold">{title}</h2>
	<p>{detail}</p>
	<div class="mt-4 flex justify-end gap-2">
		<button onclick={oncancel}>Cancel</button>
		<button class={danger ? dangerous : primary} onclick={onconfirm}>{confirm}</button>
	</div>
</dialog>
