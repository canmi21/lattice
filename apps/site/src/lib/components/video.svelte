<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a clip: a frame, and the notice under it when nothing else is on screen.
	 *
	 * `picture.svelte`'s border values, not `surfaces.blockFrame` -- see
	 * spec/architecture/css/extraction.md, "A repeated group gets one name too, and that one is
	 * free", for why a clip's frame differs from the code block's. The ground is `paper` because the
	 * box is visible before anything decodes. Kept out of `stylex.create` so the notice reads as the
	 * same frame with softer ink, not a second spelling of one.
	 */
	const frame = {
		borderWidth: border.doublePx,
		borderStyle: 'solid',
		borderColor: 'var(--color-border)',
		borderRadius: '1rem',
		backgroundColor: 'var(--color-paper)',
	};

	const styles = stylex.create({
		frame,
		notice: { ...frame, color: 'var(--color-text-soft)' },
		/** The way out, which is the one thing in the notice a reader is meant to reach for. */
		link: { color: 'var(--color-text-strong)', fontWeight: weight.medium },
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { positionOf } from '$lib/client/progress';
	import { pageUrls } from '@canmi/urls';
	import { onMount } from 'svelte';
	import Controls from './video-controls.svelte';
	import { surfaces } from '$lib/surfaces.ts';
	import type { VideoRung, VideoTrack } from '@canmi/artifacts/types';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	let {
		src,
		rungs,
		width,
		height,
		poster,
		preview,
		captions,
		description,
		source,
		gain = 1,
		ratio = '16 / 9',
		locale,
	}: {
		/** The reference the article wrote. Only an unresolved clip is addressed by it. */
		src: string;
		rungs?: VideoRung[];
		width?: number;
		height?: number;
		poster?: string;
		preview?: string;
		captions?: VideoTrack[];
		description?: string;
		source?: { url: string; label?: string };
		/** What every sample is multiplied by, so two clips play at one level. See `assets.ts`. */
		gain?: number;
		/**
		 * The shape of the window, as a CSS `aspect-ratio`. `picture.svelte` calls the same thing
		 * `crop` and leaves it absent to mean "whatever the file is"; a clip defaults to 16:9
		 * instead, because that is what every clip this site embeds already is and because a
		 * player's chrome is laid out against a box rather than against a file. A clip that is not
		 * 16:9 declares its own here; one that does not is cropped to fit, the same as a picture.
		 */
		ratio?: string;
		/** The view being rendered. Passed rather than read: see spec/locale/addressing.md. */
		locale: LocaleCode;
	} = $props();

	let el = $state<HTMLVideoElement>();

	/**
	 * Whether the element has given up, which is the only time the poster is wanted.
	 *
	 * The poster never quite matches the clip it was cut from -- see
	 * spec/architecture/video/player.md ("The poster is a fallback, and the wait is a blur") for why
	 * -- so it shows only once there is nothing else; the blurred ground fills the wait until then.
	 */
	let broken = $state(false);
	$effect(() => {
		const element = el;
		if (!element) return;
		const failed = () => (broken = true);
		const again = () => (broken = false);
		element.addEventListener('error', failed);
		element.addEventListener('loadstart', again);
		return () => {
			element.removeEventListener('error', failed);
			element.removeEventListener('loadstart', again);
		};
	});

	/**
	 * Whether the picture on screen is the one asked for. Until then the element stays
	 * transparent behind the blurred ground -- left alone it decodes frame zero first and the
	 * seek to a remembered position replaces it. See spec/architecture/video/player.md, "The poster
	 * is a fallback, and the wait is a blur", for the measurements and why media events are used over
	 * `requestVideoFrameCallback`. Checked synchronously up front, since the answer may already be
	 * yes; the deadline is the backstop, a wrong frame a blemish, a blank one broken.
	 */
	const SETTLE_WITHIN = 0.5;
	const SETTLE_DEADLINE = 2000;
	let settled = $state(false);
	$effect(() => {
		const element = el;
		if (!element) return;
		const wanted = positionOf(sessionStorage, src)?.at ?? 0;
		const near = () => Math.abs(element.currentTime - wanted) < SETTLE_WITHIN;
		const ready = () => element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
		const look = () => {
			if (ready() && near()) settled = true;
		};
		const give = () => {
			settled = true;
		};
		look();
		element.addEventListener('seeked', look);
		element.addEventListener('loadeddata', look);
		element.addEventListener('canplay', look);
		const deadline = setTimeout(give, SETTLE_DEADLINE);
		return () => {
			element.removeEventListener('seeked', look);
			element.removeEventListener('loadeddata', look);
			element.removeEventListener('canplay', look);
			clearTimeout(deadline);
		};
	});

	/**
	 * Whether the element has a frame of its own to show. Kept so the ground can come back when a
	 * frame is lost, reset on `emptied` and `error`. See spec/architecture/video/player.md
	 * ("`readyState` does not mean a frame has been painted...") for why this does not read
	 * `readyState`, and for why `requestVideoFrameCallback` is used where it exists and `seeked`
	 * stands in for it in Firefox, which lacks it.
	 */
	let framed = $state(false);
	$effect(() => {
		const element = el;
		if (!element) return;
		let pending: number | undefined;
		const painted = () => {
			framed = true;
		};
		const watch = () => {
			pending = element.requestVideoFrameCallback?.(painted);
		};
		const lost = () => {
			framed = false;
			watch();
		};
		element.addEventListener('seeked', painted);
		element.addEventListener('emptied', lost);
		element.addEventListener('error', lost);
		watch();
		return () => {
			if (pending !== undefined) element.cancelVideoFrameCallback?.(pending);
			element.removeEventListener('seeked', painted);
			element.removeEventListener('emptied', lost);
			element.removeEventListener('error', lost);
		};
	});
	let frame = $state<HTMLElement>();
	/** Web fullscreen. Held here because this is the element that changes shape. */
	let filling = $state(false);
	/**
	 * Real fullscreen, watched for the same reason `filling` is held here: this is the element the
	 * Fullscreen API promotes, and both modes have to take the same things off it.
	 *
	 * Read from the API rather than from the button, because the button is not the only way out.
	 * Escape leaves, the browser's own chrome leaves, and a second element entering fullscreen
	 * takes this one out of it.
	 */
	let screened = $state(false);
	$effect(() => {
		const box = frame;
		if (!box) return;
		const sync = () => {
			screened = document.fullscreenElement === box;
		};
		document.addEventListener('fullscreenchange', sync);
		sync();
		return () => document.removeEventListener('fullscreenchange', sync);
	});
	/** Either fullscreen: the frame is the window, whichever window it is. */
	const bare = $derived(filling || screened);
	/**
	 * The chrome, so the picture can hand a press to it.
	 *
	 * The picture is this file's element and the meaning of pressing it belongs to the controls --
	 * it is the first click that buys sound, then play and pause with a pointer, and a tap that
	 * shows the chrome with a finger. One implementation of that, reached from both.
	 */
	let controls = $state<ReturnType<typeof Controls> | undefined>();
	const describedBy = $props.id();

	/**
	 * Whether this page is driving the element itself.
	 *
	 * False on the server and until `onMount`, which is not caution -- it is the contract. The
	 * element carries `controls` for exactly as long as nothing else can work them, so a reader
	 * with no script, or one who reaches the clip before hydration, gets a player rather than a
	 * picture that does nothing. Swapping the two at mount is the only ordering where neither
	 * reader is left without a way to press play.
	 */
	let driven = $state(false);
	onMount(() => {
		driven = true;
	});

	/**
	 * What this browser can do with the clip. `'unknown'` is the state the page is served in --
	 * nothing has run yet, and the markup has to be right anyway -- and it resolves once, at
	 * hydration. A fourth value, `'transcode'`, is already designed for the deferred WebCodecs
	 * branch; see spec/architecture/video/pipeline.md, "Decided, not built", for why it is not built
	 * yet.
	 */
	let support = $state<'unknown' | 'native' | 'none'>('unknown');

	/**
	 * Which rung the display needs, once there is a display to ask.
	 *
	 * This function is the whole reason a chooser exists. A `<source>` is selected by its `type`
	 * and never by its size, so a browser handed two rungs takes the first one it can decode
	 * rather than the one it needs, and `srcset` has no equivalent here -- there is nowhere in
	 * the markup to say "this many pixels wide". So the smallest rung that covers the physical
	 * width wins, and nothing above it buys a pixel the column can show.
	 */
	function chooseRung(available: VideoRung[], rendered: number, ratio: number): VideoRung {
		const needed = rendered * ratio;
		return available.find((rung) => rung.width >= needed) ?? available[available.length - 1]!;
	}

	/**
	 * The choice, made once, from a device that has finally said what it is.
	 *
	 * Setting `src` rather than reordering the `<source>` children is not a shortcut: resource
	 * selection ran when the element was parsed and re-runs only for `load()`, and the element's
	 * own `src` outranks its children, so this is the one way to express a second answer. It
	 * costs a metadata request and no more -- `preload="metadata"` means the clip itself has not
	 * been fetched, and a reader who has not pressed anything yet loses nothing.
	 */
	$effect(() => {
		const video = el;
		if (!video || !rungs?.length) return;
		const playable = rungs.filter((rung) => video.canPlayType(rung.type) !== '');
		if (playable.length === 0) {
			support = 'none';
			return;
		}
		support = 'native';
		const wanted = chooseRung(playable, video.clientWidth, window.devicePixelRatio);
		if (wanted !== playable[0]) {
			video.src = wanted.src;
			video.load();
		}
	});

	/**
	 * The backstop, because `canPlayType` answers `'maybe'` and means it.
	 *
	 * A browser that claims a codec and then cannot decode it ends here, and so does one whose
	 * whole source list was rejected before the effect above ran. Only a format the element
	 * refused counts: a dropped connection is a different failure and the notice would be lying
	 * about it.
	 */
	function onError() {
		if (el?.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) support = 'none';
	}

	// An article can name a clip nothing has imported yet. That should cost a placeholder rather
	// than a build, so an unresolved reference still renders -- the same fallback a picture takes.
	const fallback = $derived(`${pageUrls(dev).cdn}/video/${src}`);
	const resolved = $derived(Boolean(rungs?.length));

	// The clip's origin, named by the label somebody wrote for it and by its host otherwise. A
	// label is what spec/architecture/media.md asks for -- the origin rather than the route -- and
	// a host is the only thing left to say when nobody wrote one.
	const origin = $derived(source ? (source.label ?? new URL(source.url).hostname) : undefined);

	/**
	 * The blurred ground, on the frame rather than on the element -- a transparent `<video>` takes
	 * its own background with it, which is why `data-clip` below is on the frame. See
	 * spec/architecture/video/player.md ("The choice is made before anything is painted" and "The
	 * selector names the frame") for `--clip-ground`, `app.html`'s script, and the measurements.
	 * Withheld in either full screen, where the bars are meant to be black; inline, so the
	 * stylesheet cannot take it back without `!important`.
	 */
	const ground = $derived(
		bare
			? undefined
			: `background-image:var(--clip-ground${preview ? `,url(${preview})` : ''});background-size:cover;background-position:center`,
	);

	// The shape of the window, on the element rather than on the frame: the frame is sized by the
	// column, and the picture is what has to keep its proportions inside it. Both fullscreens put
	// it back to `auto` from the stylesheet, where the box is the window and the file's own shape
	// is what decides.
	const style = $derived(ratio ? `aspect-ratio:${ratio}` : undefined);
</script>

<div class="space-y-2">
	<!--
		One frame around the picture and the bar, which is the shape `code-block` already draws: a
		body and a hairline-divided row of controls inside one border. `relative` is what the play
		affordance is positioned against, and `overflow-hidden` is what keeps the video's corners
		inside the frame's now that the border is the frame's rather than the element's.
	-->
	<div
		bind:this={frame}
		style={ground}
		class="video-frame relative overflow-hidden {stylex.attrs(styles.frame).class}"
		data-clip={src}
		data-filling={filling || undefined}
	>
		<!--
		`block`, for `picture.svelte`'s reason: a replaced inline box discards the vertical margins
		its neighbours are spaced with, and Tailwind's reset only says so by default. `crossorigin`
		is load-bearing, not decoration -- the tracks come from the CDN and a `<track>` that is not
		CORS-fetched never loads. The sources are smallest first, which is the pre-hydration answer:
		see spec/architecture/video/pipeline.md ("Why 1080 and not 720") for why that rung is not a
		compromise for the column it covers.
	-->
		<!-- svelte-ignore a11y_media_has_caption (the tracks are the record's: there are as many as
	     the clip has, written by the loop below, and the compiler can only see a static one) -->
		<video
			bind:this={el}
			class="video-surface block w-full"
			onclick={() => controls?.press()}
			src={resolved ? undefined : fallback}
			data-settled={settled || undefined}
			poster={broken ? poster : undefined}
			{width}
			{height}
			{style}
			preload="metadata"
			data-script-only
			playsinline
			crossorigin="anonymous"
			aria-describedby={description ? describedBy : undefined}
			onerror={onError}
		>
			{#each rungs ?? [] as rung (rung.src)}
				<source src={rung.src} type={rung.type} />
			{/each}
			{#each captions ?? [] as track (track.src)}
				<!-- One per entry, so a clip with no tracks shows none. No `label`: a track is named by
			     its kind and its language because that is what the record carries, and a label
			     invented here would be a name nothing checks. -->
				<track src={track.src} kind={track.kind} srclang={track.language} />
			{/each}
		</video>

		<!--
		The player a reader with no script gets. It used to be the element above, served with
		`controls` and stripped by `onMount`, which showed the browser's own control bar to every
		reader for as long as hydration took. See spec/architecture/video/player.md ("The no-script
		player lives in `<noscript>`") for why that flash is gone, why the inline `<style>` matches on
		`data-script-only` rather than a class, and why it names the frame as well as the element.
	-->
		<noscript>
			<style>
				.video-frame video[data-script-only] {
					display: none;
				}
			</style>
			<video
				class="video-surface block w-full"
				src={resolved ? undefined : fallback}
				{poster}
				{width}
				{height}
				style={ratio ? `aspect-ratio:${ratio}` : undefined}
				preload="metadata"
				controls
				playsinline
				crossorigin="anonymous"
				aria-describedby={description ? describedBy : undefined}
			>
				{#each rungs ?? [] as rung (rung.src)}
					<source src={rung.src} type={rung.type} />
				{/each}
				{#each captions ?? [] as track (track.src)}
					<track src={track.src} kind={track.kind} srclang={track.language} />
				{/each}
			</video>
		</noscript>

		<!--
			Rendered from the first frame rather than once the elements are bound -- see
			spec/architecture/video/player.md ("The chrome is rendered from the first frame") for the
			measurement behind why the cover cannot wait for hydration. `support` still gates it: a
			browser that refused every source gets the notice below, and a player drawn over a clip
			that will not decode is a lie.
		-->
		{#if support !== 'none'}
			<Controls
				bind:this={controls}
				video={el}
				{frame}
				clip={src}
				{rungs}
				{gain}
				bind:filling
				{locale}
			/>
		{/if}
	</div>

	{#if support === 'none'}
		<!--
			What a device without a decoder gets, and it is the whole of what is built: the poster
			frame stays where it is, above, and this says why nothing is playing over it.

			A notice rather than a replacement, so the shape survives the branch that is decided and
			deferred. The clip that can be transcoded ahead of time renders the same element with a
			progress bar in place of this paragraph; nothing above it moves.
		-->
		<p class="px-3 py-2 {stylex.attrs(surfaces.uiText, styles.notice).class}">
			{m['video.unsupported']({}, { locale })}
			{#if source && origin}
				<a
					href={source.url}
					target="_blank"
					rel="noopener"
					class="focus-link spring-underline article-link {stylex.attrs(styles.link).class}"
				>
					{m['video.source']({ name: origin }, { locale })}
				</a>
				<span class="sr-only">, {m['support.new-tab']({}, { locale })}</span>
			{/if}
		</p>
	{/if}

	{#if description}
		<!--
			The clip's own description, offered as a description rather than as a name: a `<video>`
			has no name of its own to carry it, and making one would put a paragraph in front of
			every reader who reaches the element with a keyboard. `aria-describedby` is announced
			after the name and can be skipped. The poster's description is deliberately not here --
			`poster` takes no alternative text, and spec/architecture/media.md says not to tell the
			same seconds twice.
		-->
		<span id={describedBy} class="sr-only">{description}</span>
	{/if}
</div>

<style>
	/* Captions, in the page's own voice: `font-family: inherit` picks a Latin or CJK glyph the way
	   the prose around it would. The rest is the player's palette, not the page's, because a
	   caption is read against a video frame this site does not choose -- see
	   `libs/tokens/src/player.css`. `--cue-size` is measured rather than declared, since a caption
	   is read at whatever size the picture happens to be; the controls set it in `placeCaptions`. */
	.video-surface::cue {
		font-family: inherit;
		font-size: var(--cue-size, 1rem);
		line-height: 1.35;
		color: var(--player-ink);
		background: var(--player-plate-strong);
		/* Half of what the browser draws by itself, which read as a lozenge rather than as a plate
		   behind a line of text. Enough of a corner to say the shape is deliberate, not enough to
		   become the shape. */
		border-radius: 0.1875rem;
	}

	/* The window is the declared shape and the picture fills it, which is `picture.svelte`'s
	   `crop` applied to a clip: the box is the layout and the file bends to it. */
	.video-surface {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		/* Held back until the frame on screen is the one asked for, with the blurred ground behind
		   it showing through. Only a clip this tab remembers is held, via `--clip-hold` set on the
		   frame by the head script -- see spec/architecture/video/player.md ("Only a remembered clip is
		   held") for why defaulting to held here would cost every reader a wait for hydration. */
		opacity: var(--clip-hold, 1);
		transition: opacity 120ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.video-surface[data-settled] {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.video-surface {
			transition: none;
		}
	}

	/* Both fullscreens: whatever the frame looks like in an article, it stops looking like it. The
	   two modes arrive by different routes -- an attribute this file writes, and the Fullscreen API
	   promoting the same element -- and written apart, only the attribute used to turn the frame
	   off; see spec/architecture/video/player.md ("The clip is fitted and never stretched") for the
	   two-pixel grey rectangle that gave it away. `:fullscreen` stands alone rather than in a list
	   with a prefixed spelling, because an unknown selector in a list invalidates the whole rule. */
	.video-frame[data-filling='true'],
	.video-frame:fullscreen {
		display: grid;
		/* One cell, the size of the frame, stated rather than left to grow: an `auto` track is
		   circular for an item asking for `height: 100%`, so it fell back to the clip's own
		   `aspect-ratio` and stretched only as far as the window had free space -- measured at
		   1400x420, a 16:9 clip laid out 1400x787.5 and `overflow` cut 367 pixels off it. With the
		   track definite the box is the window on both axes and `contain` letterboxes the rest. */
		grid-template: 100% / 100%;
		place-items: center;
		border: 0;
		border-radius: 0;
		/* Also the letterbox. The frame's ground is `paper`, so without this a clip that does not
		   match the screen's shape is bordered by the page's colour on two sides. */
		background: oklch(0 0 0);
	}

	/* Web fullscreen only: the frame becomes the window. Opaque and covering everything, because
	   the point of the mode is that nothing but the clip is on screen and the browser's own chrome
	   stays -- the whole difference from the button beside it; no player library has this since it
	   is a page mode rather than a media one. Driven by an attribute rather than a scoped
	   `:has(.player-filling)`, which cannot match across the component boundary this crosses. */
	.video-frame[data-filling='true'] {
		position: fixed;
		inset: 0;
		/* The article's own block rhythm, which a fixed box still honours: `inset: 0` pins both
		   edges and the margin is then taken out of the height between them. Measured, the frame
		   came up eight pixels short and the page showed through the bottom of it. */
		margin: 0;
		z-index: 60;
	}

	/* The clip is fitted, never stretched, and bordered by black on the axis it does not fill. The
	   box is sized to the window rather than to the picture -- `max-width`/`max-height` on an
	   auto-sized element only ever constrain, never grow: measured, a 640x360 clip stayed 640x360
	   in a 1088x1043 window. `contain` fits the picture inside the sized box, which also retires
	   the clip's own inline `aspect-ratio`: a box with both axes definite ignores it outright. */
	.video-frame[data-filling='true'] .video-surface,
	.video-frame:fullscreen .video-surface {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
