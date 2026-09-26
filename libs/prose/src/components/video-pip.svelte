<!--
	@component
	What the page's own picture-in-picture window shows: the clip's element, moved here from the
	article, and the player's row over it, drawn by the same `video-chrome.svelte` the page uses
	and told it is detached. Mounted into the window by `video-controls.svelte`, which owns every
	state the row reads and every action it asks for. See spec/architecture/video/player.md,
	"Picture in picture is ours where the browser allows it".
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import VideoChrome from './video-chrome.svelte';

	let {
		video,
		chrome,
	}: {
		/** The clip's own element, which this window holds until it closes. */
		video: HTMLVideoElement;
		/** The row's props, as the controls on the page hand them over. */
		chrome: Omit<ComponentProps<typeof VideoChrome>, 'shown' | 'detached' | 'menu'>;
	} = $props();

	/** Whether the pointer is in the window, which is when the row shows, as on the page. */
	let over = $state(false);
	let menu = $state(false);

	/**
	 * Take the element into this window. `contain` rather than the page's `cover` while it is
	 * here: the reader sizes this window, and a crop they did not ask for would be the page's.
	 */
	function hold(node: HTMLElement, element: HTMLVideoElement) {
		const fit = element.style.objectFit;
		element.style.objectFit = 'contain';
		node.append(element);
		return {
			destroy() {
				element.style.objectFit = fit;
			},
		};
	}
</script>

<div
	class="relative h-dvh w-dvw overflow-hidden bg-black"
	role="presentation"
	onpointerenter={() => (over = true)}
	onpointerleave={() => (over = false)}
>
	<div class="absolute inset-0" use:hold={video}></div>
	<VideoChrome {...chrome} shown={over || menu} bind:menu detached />
</div>
