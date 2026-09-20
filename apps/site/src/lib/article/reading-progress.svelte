<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	/**
	 * How far down the article the reader is, drawn as a ring, and a way back to the top.
	 *
	 * No figure is shown. A percentage invites a reader to watch a number climb rather than read,
	 * and the ring already says the one thing a figure would: how much is left.
	 */
	const styles = stylex.create({
		/** The dish the ring is drawn on -- unfilled, so the page shows through the middle. */
		ring: {
			fill: 'none',
			stroke: 'var(--color-border)',
		},
		/**
		 * The read part, over the dish.
		 *
		 * The two are one circle drawn twice rather than an arc computed per frame: an arc means
		 * trigonometry on every scroll event and a path that has to be rebuilt, and a dash offset
		 * is one number the compositor can interpolate.
		 */
		read: {
			fill: 'none',
			stroke: 'var(--color-text-strong)',
			strokeLinecap: 'round',
			// No transition, deliberately. The offset is already being driven continuously by the
			// scroll, so easing it eases the input rather than the output: the ring arrives where
			// the reader already is, a frame or two late, and the lag is what a hand reads as the
			// ring being attached to something other than the page. The scrubber down in the
			// player leaves its bars bare for the same reason. See spec/styling/controls.md,
			// "A value the reader is already driving takes no easing at all".
		},
		/**
		 * The one settle that is not the reader's, and therefore the one that eases.
		 *
		 * The server has no scroll to read, so its first frame is an empty ring and hydration
		 * corrects it -- a jump nobody asked for, whose ends are both the page's. Armed from the
		 * server's own markup so the browser has a starting frame to animate from, and taken off
		 * once it lands, because every move after this one belongs to a hand. A fresh navigation
		 * settles from zero to zero and shows nothing, which is right: nothing moved.
		 */
		entering: {
			transitionProperty: 'stroke-dashoffset',
			transitionDuration: '260ms',
			transitionTimingFunction: 'ease-out',
		},
		/**
		 * The way back up, which is not drawn until there is somewhere to go back to.
		 *
		 * `(hover: hover)` and not a bare `:hover`: the migrated components use a bare one because
		 * sameness came first there, and this is new. The two devices want different answers -- a
		 * pointer can ask for the control and a touch cannot -- so where nothing can hover the
		 * arrow stays out and is seen whenever it means anything.
		 */
		arrow: {
			color: 'var(--color-text-soft)',
			// The condition hangs on the property, which is the only place StyleX takes one.
			opacity: { default: 'var(--reading-arrow)', '@media (hover: hover)': 0 },
			transitionProperty: 'opacity, scale, color',
			transitionDuration: '200ms',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
		},
		/** Under a pointer, the arrow arrives at whatever the scroll has earned it. */
		arrowShown: {
			color: 'var(--color-text-strong)',
			opacity: { default: 'var(--reading-arrow)', '@media (hover: hover)': 'var(--reading-arrow)' },
		},
	});
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	/** Passed rather than read; see spec/locale/addressing.md. */
	let { locale }: { locale: LocaleCode } = $props();

	let hovered = $state(false);

	/**
	 * What fraction of the scrollable length is behind the reader.
	 *
	 * Measured against the scrollable length rather than the document's height: a page shorter
	 * than the window has nothing to scroll and a ratio of its height would read as part-done
	 * forever. Zero length answers zero, which is also what stops a division by it.
	 */
	function fraction(): number {
		const scrollable = document.documentElement.scrollHeight - window.innerHeight;
		return scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
	}

	/**
	 * Read once while the component initialises, not in an effect.
	 *
	 * The browser restores a reload's scroll position before any of this runs, so the answer
	 * already exists -- and an effect runs after the first paint, which drew a full ring's worth
	 * of untouched track under a reader who was halfway down. The server has no scroll to read
	 * and answers zero, which is what a fresh navigation is anyway.
	 */
	let read = $state(browser ? fraction() : 0);

	/**
	 * Whether the entry settle is still allowed to ease. True from the server's markup, false once
	 * the settle has had its 260ms, and never true again.
	 */
	let entering = $state(true);

	function measure(): void {
		read = fraction();
	}

	/**
	 * One read per frame, however many events arrived.
	 *
	 * A scroll listener fires far faster than the page paints, and every one of ours ends in a
	 * layout read. Coalescing to the frame is what keeps that off the scrolling thread.
	 */
	$effect(() => {
		const landed = setTimeout(() => (entering = false), 300);
		let queued = 0;
		const schedule = () => {
			if (queued) return;
			queued = requestAnimationFrame(() => {
				queued = 0;
				measure();
			});
		};
		measure();
		addEventListener('scroll', schedule, { passive: true });
		addEventListener('resize', schedule, { passive: true });
		return () => {
			clearTimeout(landed);
			if (queued) cancelAnimationFrame(queued);
			removeEventListener('scroll', schedule);
			removeEventListener('resize', schedule);
		};
	});

	/**
	 * The arrow's share, full by the first fifth.
	 *
	 * It grows with the read rather than appearing at a threshold, because a control that pops
	 * into place reads as a thing that just became possible, and going back up was possible from
	 * the first pixel. A fifth is where it stops growing and not where it starts.
	 */
	const shown = $derived(Math.min(1, read / 0.2));

	function toTop(): void {
		scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<!-- `--reading-read` and `--reading-arrow` are written from here because only the scroll knows
     them; everything they drive is declared in the two layers above. See
     spec/architecture/css/authoring.md. -->
<button
	type="button"
	class="focus-ring grid size-5 place-items-center rounded-full"
	style="--reading-read: {read}; --reading-arrow: {shown}"
	onclick={toTop}
	onpointerenter={() => (hovered = true)}
	onpointerleave={() => (hovered = false)}
	aria-label={m['article.to-top']({}, { locale })}
>
	<!-- One cell, so the ring and the arrow share a centre without either being positioned. -->
	<svg class="col-start-1 row-start-1 size-5 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
		<!-- r is 15.9155 because that circle is 100 long, so the dash offset below is a percentage
		     and nothing has to compute a circumference to write it. -->
		<circle class={stylex.attrs(styles.ring).class} cx="18" cy="18" r="15.9155" stroke-width="3.6" />
		<circle
			class={stylex.attrs(styles.read, entering && styles.entering).class}
			cx="18"
			cy="18"
			r="15.9155"
			stroke-width="3.6"
			stroke-dasharray="100"
			stroke-dashoffset="calc(100 - var(--reading-read) * 100)"
		/>
	</svg>
	<span
		class="col-start-1 row-start-1 grid place-items-center {stylex.attrs(
			styles.arrow,
			hovered && styles.arrowShown,
		).class}"
		style="scale: calc(0.4 + 0.6 * var(--reading-arrow))"
	>
		<ArrowUp size={9} strokeWidth={2.5} aria-hidden="true" />
	</span>
</button>
