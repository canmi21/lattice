<script lang="ts">
	import { onMount } from 'svelte';
	import { challenge, dismissChallenge, holdChallenge, warmTrust } from './trust.svelte';

	/**
	 * The one place Turnstile is drawn. Mounted on every page and invisible until the widget needs
	 * the reader, then it covers the whole screen on any device with the widget alone and holds the
	 * page's scroll; Escape closes it and the page reads on from where it was. See
	 * spec/architecture/trust.md.
	 */
	let widget: HTMLDivElement | undefined = $state();

	onMount(() => {
		if (!widget) return;
		const release = holdChallenge(widget);
		warmTrust();
		return release;
	});

	// While it covers the page, the page does not scroll under it: the root's overflow is held and
	// given back, so the reader is where they were when it closes. Nothing shifts visibly as the
	// scrollbar goes, since the overlay is opaque over all of it.
	$effect(() => {
		if (!challenge.shown) return;
		const root = document.documentElement;
		const before = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = before;
		};
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
	style:overscroll-behavior="none"
	role="dialog"
	aria-modal="true"
	aria-label="A quick check before you can like or subscribe"
	aria-hidden={!challenge.shown}
>
	<div bind:this={widget}></div>
</div>
