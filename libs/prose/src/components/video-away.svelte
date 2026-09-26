<!--
	@component
	What stands over the still while the clip plays in another window: where it went, in the
	corner, and the way back, in the middle -- nothing else on a picture that is not playing here.
	See spec/architecture/video/player.md, "A clip playing elsewhere leaves the frame it left on".
-->
<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import PictureInPictureIcon from 'phosphor-svelte/lib/PictureInPictureIcon';
	import type { LocaleCode } from '@canmi/locales';
	import * as m from '@canmi/messages';
	import { styles } from './video-controls.styles.ts';

	let { locale, onreturn }: { locale: LocaleCode; onreturn: () => void } = $props();
</script>

<p
	class="pointer-events-none absolute top-3 left-3.5 m-0 inline-flex items-center gap-1.5 {stylex.attrs(
		styles.away,
		styles.awayText,
	).class}"
>
	<PictureInPictureIcon class="size-3.5" weight="bold" aria-hidden="true" />
	{m['video.pip-playing']({}, { locale })}
</p>
<button
	type="button"
	onclick={(event) => {
		event.stopPropagation();
		onreturn();
	}}
	class="focus-ring absolute top-1/2 left-1/2 inline-flex -translate-1/2 cursor-pointer items-center gap-2 px-3.5 py-1.5 whitespace-nowrap {stylex.attrs(
		styles.away,
		styles.awayButton,
	).class}"
>
	<PictureInPictureIcon class="size-4" weight="bold" aria-hidden="true" />
	{m['video.exit-pip']({}, { locale })}
</button>
