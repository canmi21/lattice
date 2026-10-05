<script lang="ts">
	import { onMount } from 'svelte';
	import { challenge, dismissChallenge, holdChallenge, warmTrust } from './trust.svelte';

	/**
	 * The one place Turnstile is drawn. Mounted on every page and invisible until the widget needs
	 * the reader, then it covers the whole screen on any device with the widget alone; Escape closes
	 * it and the page reads as before. See spec/architecture/trust.md.
	 */
	let widget: HTMLDivElement | undefined = $state();

	onMount(() => {
		if (!widget) return;
		const release = holdChallenge(widget);
		warmTrust();
		return release;
	});

	function onKeydown(event: KeyboardEvent): void {
		if (challenge.shown && event.key === 'Escape') dismissChallenge();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="fixed inset-0 z-60 flex items-center justify-center {challenge.shown
		? 'visible'
		: 'invisible'}"
	style:background="var(--color-page)"
	role="dialog"
	aria-modal="true"
	aria-label="A quick check before you can like or subscribe"
	aria-hidden={!challenge.shown}
>
	<div bind:this={widget}></div>
</div>
