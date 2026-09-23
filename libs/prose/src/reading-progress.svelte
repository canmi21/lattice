<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { radius } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * How far down the article the reader is, drawn as a ring, and a way back to the top.
	 *
	 * No figure is shown. A percentage invites a reader to watch a number climb rather than read,
	 * and the ring already says the one thing a figure would: how much is left.
	 */
	const styles = stylex.create({
		/**
		 * The button's own shape: a full circle, because the ring it holds is one. A radius is the
		 * vocabulary's by property, and `.focus-ring`'s 0.25rem fallback in `@layer components`
		 * yields to it here as it yielded to the utility. See spec/architecture/css/layers.md.
		 */
		control: {
			borderRadius: radius.full,
		},
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
	import { BROWSER as browser } from 'esm-env';
	import { arriving } from '@canmi/behavior/arrival';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Dial from './components/dial.svelte';
	import type { LocaleCode } from '@canmi/locales';
	import * as m from '@canmi/messages';

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
	 * Which way the reader was last going, which is what the arrow offers to finish.
	 *
	 * Not where they are: at the same position a reader on the way down wants the end and a reader
	 * on the way back wants the top, and only the direction they came from separates the two. A
	 * wheel, a trackpad and a thumb all express it, so nothing here asks which device it is.
	 *
	 * Down until told otherwise, because a page opens at the top and there is nowhere up to go.
	 */
	let heading = $state<'down' | 'up'>('down');
	let previous = browser ? scrollY : 0;

	/**
	 * Whether the entry settle is still allowed to ease. False once it has had its 260ms.
	 *
	 * Armed only in the document the reader arrived in. A client navigation lands at the top of
	 * its page, so the ring is empty and correct before it is drawn -- and where a place was
	 * remembered, the scroll that restores it is a real scroll the ring simply follows. Easing
	 * either would be easing a value that was never wrong. See spec/styling/first-paint.md.
	 */
	let entering = $state(arriving());

	function measure(): void {
		const now = scrollY;
		// A move of nothing is not a change of mind: two events one pixel apart would otherwise
		// flip the glyph on a resize or a rubber band.
		if (Math.abs(now - previous) > 2) {
			heading = now > previous ? 'down' : 'up';
			previous = now;
		}
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
	 * The arrow's share: nothing at either end, full across the middle.
	 *
	 * It grows over the first fifth and shrinks away over the last, because at the very top there
	 * is nowhere up to go and at the very bottom nowhere down, and an arrow offering a move that
	 * is already made is worse than no arrow. It grows rather than appearing at a threshold: a
	 * control that pops into place reads as one that just became possible, and it was possible
	 * from the first pixel.
	 */
	const shown = $derived(Math.min(1, read / 0.2, (1 - read) / 0.2));

	function jump(): void {
		const to = heading === 'down' ? document.documentElement.scrollHeight : 0;
		scrollTo({ top: to, behavior: 'smooth' });
	}
</script>

<!-- `--reading-read` and `--reading-arrow` are written from here because only the scroll knows
     them; everything they drive is declared in the two layers above. See
     spec/architecture/css/authoring.md. -->
<button
	type="button"
	class="focus-ring grid size-5 place-items-center {stylex.attrs(styles.control).class}"
	style="--reading-read: {read}; --reading-arrow: {shown}"
	onclick={jump}
	onpointerenter={() => (hovered = true)}
	onpointerleave={() => (hovered = false)}
	aria-label={heading === 'down'
		? m['article.to-end']({}, { locale })
		: m['article.to-top']({}, { locale })}
>
	<!-- One cell, so the ring and the arrow share a centre without either being positioned. -->
	<svg class="col-start-1 row-start-1 size-5 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
		<!-- r is 15.9155 because that circle is 100 long, so the dash offset below is a percentage
		     and nothing has to compute a circumference to write it. -->
		<circle
			class={stylex.attrs(styles.ring).class}
			cx="18"
			cy="18"
			r="15.9155"
			stroke-width="3.6"
		/>
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
		<Dial shown={heading === 'up' ? 'first' : 'second'}>
			{#snippet first()}<ArrowUp size={9} strokeWidth={2.5} aria-hidden="true" />{/snippet}
			{#snippet second()}<ArrowDown size={9} strokeWidth={2.5} aria-hidden="true" />{/snippet}
		</Dial>
	</span>
</button>
