<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a clip, which is a frame and the notice that can appear under it.
	 *
	 * The frame is `picture.svelte`'s, value for value -- a 2px edge and a 1rem corner -- rather
	 * than `surfaces.blockFrame`, which is the hairline and `radius.xl` that the code block, the
	 * Mermaid figure and the quadrant draw. A clip's neighbour in a column of prose is almost
	 * always a picture, and two media boxes with different corners next to each other read as a
	 * mistake in a way a figure and a code block do not. Whether the site should have one answer
	 * for both is a question about those five, not about this one. See spec/architecture/css.md.
	 *
	 * The ground is `paper` rather than nothing, because this box is visible before anything has
	 * been decoded: a poster that has not arrived and a clip that will never play both leave it
	 * empty, and an empty bordered box is the page's own colour unless it is told otherwise.
	 *
	 * Kept out of `stylex.create` so the notice is visibly the same frame with softer ink in it
	 * rather than a second spelling of one, which is how `surfaces.ts` writes the same idea.
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
	import { pageUrls } from '@canmi/urls';
	import { onMount } from 'svelte';
	import Controls from './video-controls.svelte';
	import { surfaces } from '$lib/surfaces.ts';
	import type { VideoRung, VideoTrack } from '$lib/content/build/assets.ts';
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
		/** The view being rendered. Passed rather than read: see spec/locale.md. */
		locale: LocaleCode;
	} = $props();

	let el = $state<HTMLVideoElement>();

	/**
	 * Whether the element has a frame of its own to show, which is when the poster stops being
	 * wanted.
	 *
	 * The poster is cut from this very clip and it still does not match it: encoded separately, it
	 * lands a shade off on colour, and where its pixel dimensions differ from the rung being
	 * played `object-fit: cover` crops the two differently, so the first frame of playback arrives
	 * with a small visible shift. Two pictures of the same instant, one of them slightly wrong.
	 *
	 * So the poster goes back to being what it was always for: something to show while there is
	 * nothing better. The moment the element can paint its own pixels it does, and the reader
	 * never sees the seam because there is no longer anything to cut between.
	 *
	 * Reset on `emptied` and `error`, which are the two ways a decoded frame stops being true --
	 * a source swap, or a clip that has stopped working. The poster is the fallback again from
	 * there.
	 */
	let framed = $state(false);
	$effect(() => {
		const element = el;
		if (!element) return;
		const check = () => {
			framed = element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
		};
		const shown = ['loadeddata', 'seeked', 'canplay'];
		const lost = ['emptied', 'error'];
		for (const event of shown) element.addEventListener(event, check);
		for (const event of lost) element.addEventListener(event, check);
		check();
		return () => {
			for (const event of shown) element.removeEventListener(event, check);
			for (const event of lost) element.removeEventListener(event, check);
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
	 * What this browser can do with the clip.
	 *
	 * `'unknown'` is not ignorance, it is the state the page is served in: nothing has run, and
	 * the markup has to be right anyway. It resolves once, at hydration.
	 *
	 * Three values today and the fourth is already written down. spec/architecture/video.md's
	 * middle branch -- no hardware decoder, but WebCodecs -- decodes the clip ahead of time and
	 * would be a `'transcode'` here, answering the same two questions this already answers: what
	 * the element shows, and which rung is worth fetching. It is deferred deliberately and is not
	 * begun; what this shape buys is that beginning it moves nothing that exists.
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
	 * The poster's placeholder, painted under it while it arrives.
	 *
	 * The same two-line trick `picture.svelte` uses, and it matters more here: a clip reserves its
	 * box from `width` and `height`, so without this there is a bordered rectangle of page colour
	 * sitting in the prose for as long as the poster takes.
	 */
	const style = $derived(
		[
			// Dropped in either fullscreen rather than overridden there. This is an inline style
			// and an inline style beats any selector, so the stylesheet cannot take it back
			// without `!important` -- and the placeholder showing through the letterbox bars is
			// exactly what both modes asked for black instead of. Nothing is uncovered in an
			// article, which is why it only ever showed in one of the three.
			//
			// It was `filling` alone for a while, so web fullscreen had black bars and real
			// fullscreen had a blurred still in them. Measured on a 16:9 clip in a 1400x1000
			// window, the bars read (30, 25, 24) at the top and (8, 6, 3) at the bottom.
			!bare && preview && `background-image:url(${preview})`,
			!bare && preview && 'background-size:cover',
			!bare && preview && 'background-position:center',
			ratio && `aspect-ratio:${ratio}`,
		]
			.filter(Boolean)
			.join(';') || undefined,
	);
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
		class="video-frame relative overflow-hidden {stylex.attrs(styles.frame).class}"
		data-filling={filling || undefined}
	>
	<!--
		`block`, for `picture.svelte`'s reason: a replaced inline box discards the vertical margins
		its neighbours are spaced with, and both this element and the notice under it are spaced
		that way. Tailwind's reset already says so for `video`; it is stated because this depends
		on the default rather than merely inheriting it.

		`crossorigin` is not optional decoration. The text tracks come from the CDN, which is a
		different origin, and a `<track>` that is not CORS-fetched never loads at all.

		The sources are smallest first, which is the pre-hydration answer and is a real choice.
		A reader with no script, or one who presses play before hydration, gets the first source
		the browser can decode -- and above 1080p the ladder publishes exactly two rungs, the
		1080p one and a larger tier that exists for the full-screen view. The column is 48rem, so
		1080p covers it at two times the pixel ratio with room to spare: the smaller rung is not a
		compromise here, it is the rung the column was measured for, and the larger one is what the
		chooser reaches for when a display turns out to want it. See spec/architecture/video.md.
	-->
	<!-- svelte-ignore a11y_media_has_caption (the tracks are the record's: there are as many as
	     the clip has, written by the loop below, and the compiler can only see a static one) -->
	<video
		bind:this={el}
		class="video-surface block w-full"
		onclick={() => controls?.press()}
		src={resolved ? undefined : fallback}
		poster={framed ? undefined : poster}
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
		The player a reader with no script gets, and the reason the element above no longer carries
		`controls`.

		It used to. The element was served with `controls` and `onMount` took them off, so every
		reader watched the browser's own control bar for as long as hydration took -- measured at
		247ms and 21 painted frames on a warm local load, and longer over a network. The bar was
		there to be a fallback and it was being shown to the one audience that does not need it.

		`<noscript>` is the exact tool for that split. With scripting enabled the browser does not
		parse its contents as markup at all -- they are raw text, so there is no element, no
		request and nothing to paint -- and with scripting disabled they are the only copy that
		exists. So the flash goes and the fallback stays, rather than one being traded for the
		other.

		The `<style>` is how the two stop overlapping: without it a reader with no script would see
		this one and the inert one above it. It repeats once per clip, which is a few dozen bytes
		and the price of the block being self-contained; the rule is idempotent and a second copy
		costs nothing but its own length. It cannot be Svelte-scoped -- a `<style>` written into
		markup is not the compiler's -- so it matches on the attribute instead of on the class.

		It names the frame as well, and that is not for readability. Svelte's scoped rules are
		unlayered, so `.video-surface.svelte-hash { display: block }` is an ordinary author rule at
		two classes, and `video[data-script-only]` is one class and one element: it loses, and the
		first version of this block showed a reader with no script both copies stacked. Measured in
		a sandboxed frame with scripting off -- which is the condition `<noscript>` is defined
		against -- six `<video>` elements where three were wanted. Adding the frame makes it two
		classes and an element, which is the smallest thing that wins without `!important`.
	-->
	<noscript>
		<style>.video-frame video[data-script-only]{display:none}</style>
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
			Rendered from the first frame rather than once the elements are bound, which is what
			the cover needs: it is the one part of the chrome a reader sees before they touch
			anything, and withholding the component until hydration meant it did not exist and
			then appeared at full opacity. Measured: nothing until 400ms against a first paint at
			88ms. Now the server writes the same disc the client keeps, so there is nothing to
			appear -- and nothing to press either, because until `video` is bound every handler
			inside returns early.

			`support` still gates it. A browser that refused every source gets the notice below
			instead, and a player drawn over a clip that will not decode is a lie.
		-->
		{#if support !== 'none'}
			<Controls bind:this={controls} video={el} {frame} clip={src} {rungs} {gain} bind:filling {locale} />
		{/if}
	</div>

<style>
	/* The window is the declared shape and the picture fills it, which is `picture.svelte`'s
	   `crop` applied to a clip: the box is the layout and the file bends to it. */
	.video-surface {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>

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
			The clip's own description, offered as a description rather than as a name.

			A `<video>` has no name of its own to carry it -- no title, no destination -- and making
			this one would put a paragraph in front of every reader who reaches the element with a
			keyboard, which is the argument the link card makes at length. `aria-describedby` is
			announced after the name and can be skipped.

			The poster's description is deliberately not here. `poster` is an attribute and takes no
			alternative text, so there is nowhere to put it, and a second telling of the same
			seconds is what spec/architecture/media.md says not to write.
		-->
		<span id={describedBy} class="sr-only">{description}</span>
	{/if}
</div>

<style>
	/* The window is the declared shape and the picture fills it, which is `picture.svelte`'s
	   `crop` applied to a clip: the box is the layout and the file bends to it. */
	.video-surface {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Both fullscreens: whatever the frame looks like in an article, it stops looking like it.

	   The two modes arrive by different routes -- one is an attribute this file's markup writes,
	   the other is the Fullscreen API promoting the same element -- and they were written apart,
	   so for a while only the attribute turned the frame off. In a dark theme nothing showed,
	   because the border is dark there too. In a light one, going full screen drew a two-pixel
	   grey rectangle around the picture, which is the frame doing in front of a black screen
	   exactly what it is meant to do in a column of prose.

	   `:fullscreen` is on its own here and not in a list with `:-webkit-full-screen`. Every engine
	   this site supports takes the unprefixed one, and an unknown selector in a list invalidates
	   the whole rule -- which is how the scrubber once painted in neither engine. */
	.video-frame[data-filling='true'],
	.video-frame:fullscreen {
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 0;
		/* Also the letterbox. The frame's ground is `paper`, so without this a clip that does not
		   match the screen's shape is bordered by the page's colour on two sides. */
		background: oklch(0 0 0);
	}

	/* Web fullscreen only: the frame becomes the window, since nothing else is going to move it.

	   Opaque and covering everything rather than sitting in the article: the point of the mode is
	   that nothing but the clip is on screen, and a page showing through even faintly is the thing
	   it exists to remove. The browser's own chrome stays, which is the whole difference from the
	   button beside it. No player library has this -- it is a page mode rather than a media one.

	   Driven by an attribute this file's own markup writes. A scoped `:has(.player-filling)`
	   cannot match across a component boundary: Svelte rewrites both halves of the selector into
	   this file's scope, and that class carries the child's. An attribute belongs to neither. */
	.video-frame[data-filling='true'] {
		position: fixed;
		inset: 0;
		/* The article's own block rhythm, which a fixed box still honours: `inset: 0` pins both
		   edges and the margin is then taken out of the height between them. Measured, the frame
		   came up eight pixels short and the page showed through the bottom of it. */
		margin: 0;
		z-index: 60;
	}

	/* The clip is fitted, never stretched: it grows until one axis meets the window and stops, so
	   a 16:9 clip in a 16:9 window fills both and anything else fills one and is bordered by black
	   on the other. Both axes go back to `auto` so the file's own ratio decides, and the declared
	   `aspect-ratio` -- which shapes the box in an article -- has no business here, where the box
	   is the window.
	   
	   The box is the window and `contain` fits the picture inside it, rather than the box being
	   sized to the picture. `max-width`/`max-height` on an auto-sized element only ever constrain,
	   never grow: measured, a 640x360 clip stayed 640x360 in the middle of a 1088x1043 window. */
	.video-frame[data-filling='true'] .video-surface,
	.video-frame:fullscreen .video-surface {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
		object-fit: contain;
	}
</style>
