<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { line, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the table of contents. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * Nothing here draws a bar's width or the indicator's height. Those are measured and written
	 * inline by the script below, an inline style outranks every layer, and this one only says
	 * what the marks are made of.
	 */
	const styles = stylex.create({
		/**
		 * The rail's own offset near the end of an article, on top of the box's vertical centring.
		 *
		 * Here rather than in the markup because no utility translates a `transform` -- Tailwind 4
		 * writes `translate` as its own property, a different declaration with a different computed
		 * value. See spec/architecture/css/migration.md, "No utility translates a `transform`
		 * declaration". Horizontal placement stays the rail box's, in utilities.css.
		 */
		nav: {
			transform: 'translateY(var(--toc-end-offset, 0rem))',
		},
		/** The bar marking the entry being read. Its height and its offset are the animation's. */
		indicator: {
			borderRadius: radius.full,
			backgroundColor: 'var(--color-text-soft)',
		},
		entry: {
			// The ring belongs to one of the two wrappers inside, which `focus-ring-inner` draws
			// around the bar while the column is collapsed and around the label once it is not.
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
		/** The wrapper the ring is drawn on while the column is collapsed. */
		barRing: {
			borderRadius: radius.full,
		},
		/** The collapsed thumbnail of one heading. The width it is drawn at stays inline. */
		bar: {
			borderRadius: radius.full,
			backgroundColor: 'var(--color-text-soft)',
		},
		label: {
			fontSize: text.px13,
			// The line is Tailwind's `--leading-snug`, and its value is written out rather
			// than read: that variable is emitted only for the utilities that name it, so reading
			// it here would leave this line depending on a class somewhere else in the markup. The
			// value terminates, so there is no arithmetic to round.
			lineHeight: line.snug,
		},
		labelActive: {
			color: 'var(--color-text-strong)',
		},
		labelIdle: {
			color: 'var(--color-text-soft)',
		},
	});

	/** What a rail label's class resolves to; see article.svelte, `ARTICLE_BODY_CLASS`. */
	export const TOC_LABEL_CLASS = stylex.attrs(styles.label).class ?? '';
</script>

<script lang="ts">
	import { animate, frame as motionFrame } from 'motion';
	import {
		DEFAULT_PIXELS_PER_REM,
		remFromDefaultPixels,
		remFromMeasuredPixels,
	} from '$lib/client/units';
	import { untrack } from 'svelte';
	import { arriving } from '$lib/client/arrival';
	import type { TocEntry } from '@canmi/artifacts/types';
	import { measureRail } from './rail-measure';
	import type { RailWidths } from './rail-widths';
	import { railEndOffset } from './rail';
	import { scheduleInitialHashJump } from './toc';

	let {
		toc,
		rail,
	}: {
		toc: TocEntry[];
		/**
		 * Every bar's width, when the load already worked them out.
		 *
		 * Absent means a server drew this, which cannot measure a heading -- so the bars carry
		 * their baked first frame and settle into the measurement after hydration. Present means
		 * a browser measured before this rendered, and the first frame is the answer. See
		 * spec/styling/first-paint.md.
		 */
		rail?: RailWidths;
	} = $props();

	const MAX_BAR_WIDTH = 64;
	/**
	 * How many steps the bar scale has, and how far one entry may stand above its neighbour.
	 *
	 * Ten steps of the longest heading: finer than that is below what anyone reads off a column
	 * of bars, and pretending otherwise only makes rounding look like meaning. Three is the
	 * widest rise that still reads as a step rather than as one entry towering over the column.
	 */
	const STEPS = 10;
	const MAX_ADJACENT_STEP = 3;
	/**
	 * How far apart neighbouring entries must be drawn.
	 *
	 * One step, the smallest move that separates them at all. Two was tried and is too much:
	 * with headings this evenly sized, it leaves only differences of two or three steps, so the
	 * column can only alternate -- and two headings of genuinely the same length get drawn three
	 * steps apart, inventing a difference rather than reporting one.
	 */
	const MIN_ADJACENT_STEP = 1;
	/**
	 * Where the shortest bar sits when every entry cleared it anyway.
	 *
	 * An article whose headings are all long has no short bar to anchor the column, so the rail
	 * reads as uniformly heavy -- the scale spent at the top of its range, the bottom unused.
	 * Sliding the column down until its shortest entry rests here puts the range back in use.
	 * Three rather than one: the shortest bar in such an article is still a long heading.
	 */
	const RESTING_STEP = 3;
	const BAR_HEIGHT = 4;
	const INDICATOR_HEIGHT = 12;
	const INDICATOR_OPACITY = 0.8;
	const REVEAL_DELAY = 180;
	const LEAVE_DELAY = 250;
	const SCROLL_OFFSET = 96;
	const TOP_DEAD_ZONE = 64;
	const BAR_SPRING = { type: 'spring' as const, stiffness: 300, damping: 28 };
	const TEXT_TWEEN = { duration: 0.15 };

	// Geometry is authored against the default root and written as rem. Calculations that mix it
	// with DOM measurements scale it to the live root first.
	const rootFontPixels = () =>
		Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
		DEFAULT_PIXELS_PER_REM;
	const toScaledPixels = (value: number, root: number) => (value / DEFAULT_PIXELS_PER_REM) * root;

	type Phase = 'collapsed' | 'expanded' | 'revealed';
	type Entry = { el?: HTMLHeadingElement; slug: string; text: string };
	type HydratedEntries = { source: TocEntry[]; entries: Entry[] };
	type IndicatorGeometry = { y: number; height: number };
	type AnimationControl = { stop: () => void };

	let hydratedEntries = $state.raw<HydratedEntries>();
	/** The widest label as the rail will draw it, which is the widest a bar may be. */
	// The measurement is a fact about this render, not a value that goes on changing, so taking
	// only the initial one is the intent. See blocks/code-block.svelte for the same reading.
	/**
	 * What this component measured for itself, on the one render where nobody had it.
	 *
	 * The same call the load makes, so a first visit, a reload painted from the sitting's record
	 * and a client navigation all draw the same bars. Two measurements meaning the same thing is
	 * how they stop agreeing -- and they had: this component's own ceiling came out 0 where the
	 * shared one is the rail's declared width, which is a different column of bars.
	 */
	let fallback = $state.raw<RailWidths | undefined>();

	/**
	 * A shape is only usable if it carries everything this build asks of one.
	 *
	 * The sitting's record outlives a deploy: a tab that measured under an older build has a
	 * stored answer in the older build's shape, and the subject it was keyed by still matches.
	 * An incomplete one is treated as no answer -- the page measures again and settles, which is
	 * what a first visit does anyway.
	 */
	function whole(value: RailWidths | undefined): RailWidths | undefined {
		if (!value) return undefined;
		const sized = value.widths?.length === toc.length && value.lines?.length === toc.length;
		return sized ? value : undefined;
	}
	const shape = $derived(whole(rail) ?? fallback);

	/**
	 * Whether a shape painted before hydration may be read.
	 *
	 * Only on the document the reader arrived in: the head script runs once, so its properties
	 * belong to the page that was served and to no page navigated to afterwards.
	 */
	const settled = untrack(() => arriving());
	const entries = $derived(
		hydratedEntries?.source === toc
			? hydratedEntries.entries
			: toc.map<Entry>(({ slug, text }) => ({ slug, text })),
	);
	let asideEl = $state<HTMLElement | undefined>();
	let indicatorEl = $state<HTMLElement | undefined>();
	let phase = $state<Phase>('collapsed');
	let activeIndex = $state(-1);
	let firstWidthSet = false;
	let firstShowSet = false;
	let firstIndicatorSet = false;
	let prevIndicatorVisible = false;
	let prevIndicatorActive = -1;
	let prevShowText = false;
	let prevGeometryVersion = 0;
	let isClickScrolling = false;
	let phaseTimer: ReturnType<typeof setTimeout> | undefined;
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	let indicatorAnimation: AnimationControl | undefined;
	/** Whether the animation in flight is the reveal, rather than a move along the rail. */
	let indicatorRevealing = false;
	let geometryVersion = $state(0);

	function jumpToSection(el: HTMLHeadingElement | undefined, idx: number) {
		if (!el) return;
		isClickScrolling = true;
		activeIndex = idx;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		const onEnd = () => {
			isClickScrolling = false;
		};
		if ('onscrollend' in window) {
			window.addEventListener('scrollend', onEnd, { once: true });
		} else {
			setTimeout(onEnd, 600);
		}
	}

	/**
	 * A heading as the table of contents should read it: the words, without a note's marker.
	 *
	 * The compiled entries never carry the marker -- flattening a heading to a string drops a
	 * childless directive -- but this measures the rendered headings instead, and there the
	 * marker is a real superscript with a real number in it. Read raw, an entry gained a stray
	 * digit at hydration and the whole rail said something the article did not.
	 */
	function headingText(el: HTMLElement): string {
		const clone = el.cloneNode(true) as HTMLElement;
		for (const marker of clone.querySelectorAll('[data-note-marker]')) marker.remove();
		return clone.textContent?.trim() ?? '';
	}

	/**
	 * Where the indicator goes, for a rail opened by `opened` with bars still `bar` tall.
	 *
	 * Arithmetic rather than measured, because the rail is in motion exactly when this is asked:
	 * a button reports 28px mid-flight and 24px once it settles. The two resting layouts are this
	 * function's endpoints and every frame of the reveal lies between them. See
	 * spec/styling/rail.md, "The active mark opens with the column, not to where the column is
	 * going".
	 */
	function indicatorGeometry(
		index: number,
		bar: number,
		opened: number,
	): IndicatorGeometry | undefined {
		const lines = shape?.lines;
		const label = asideEl?.querySelector<HTMLElement>('[data-toc-text]');
		const button = asideEl?.querySelector<HTMLElement>('[data-toc-button]');
		if (!lines || !label || !button || index < 0 || index >= lines.length) return undefined;

		const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
		const style = getComputedStyle(button);
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		if (!Number.isFinite(lineHeight) || !Number.isFinite(padding)) return undefined;

		// Every entry above this one contributes the same padding and the same bar, and its own
		// label's share of whatever has arrived -- so their labels are counted in lines rather
		// than one entry at a time.
		let above = 0;
		for (let entry = 0; entry < index; entry += 1) above += lines[entry] ?? 1;
		const top = button.offsetTop + index * (padding + bar) + lineHeight * opened * above;
		const tall = padding + bar + lineHeight * opened * (lines[index] ?? 1);

		// Collapsed, the entry is a bar and the mark on it is that bar; open, it is the mark's
		// own length, plus a line for a label that takes two.
		const open =
			toScaledPixels(INDICATOR_HEIGHT, rootFontPixels()) + lineHeight * ((lines[index] ?? 1) - 1);
		const height = bar * (1 - opened) + open * opened;
		return { y: top + tall / 2 - height / 2, height };
	}

	/** The rail open: bars gone, labels arrived. The reveal's far end, and where it rests. */
	const OPEN = (index: number) => indicatorGeometry(index, 0, 1);

	/**
	 * The reveal: the mark opens out of the collapsed column along with the entry it marks.
	 *
	 * The frames are reconstructed rather than read off the rail -- one spring and one tween, the
	 * same two constants the bars and the labels run on, so the mark cannot drift from the column
	 * without the column drifting from itself. See spec/styling/rail.md, "The active mark opens
	 * with the column, not to where the column is going".
	 */
	function revealIndicator(index: number) {
		const indicator = indicatorEl;
		if (!indicator) return;
		let bar = toScaledPixels(BAR_HEIGHT, rootFontPixels());
		let opened = 0;
		indicatorRevealing = true;
		const write = () => {
			const at = indicatorGeometry(index, bar, opened);
			if (!at) return;
			indicator.style.height = remFromMeasuredPixels(at.height);
			indicator.style.transform = `translateY(${remFromMeasuredPixels(at.y)})`;
			// Drawn on the labels' own tween rather than animated beside it, so the mark cannot
			// arrive ahead of or behind the words it marks. It is also the only thing writing
			// this element's opacity: `animate` keeps a value per element and property, and one
			// that has been set behind its back reads as already there and is never rendered --
			// which is how the mark came up at full strength on a first hover and not at all on
			// the second.
			indicator.style.opacity = `${INDICATOR_OPACITY * opened}`;
		};
		write();
		const labels = animate(0, 1, {
			...TEXT_TWEEN,
			onUpdate: (value) => {
				opened = value;
				write();
			},
			onComplete: () => {
				opened = 1;
			},
		});
		// The bars settle after the labels do, so theirs is the animation that ends the reveal.
		const bars = animate(bar, 0, {
			...BAR_SPRING,
			onUpdate: (value) => {
				bar = value;
				write();
			},
			onComplete: () => {
				bar = 0;
				write();
				indicatorAnimation = undefined;
				indicatorRevealing = false;
			},
		});
		indicatorAnimation = {
			stop: () => {
				labels.stop();
				bars.stop();
			},
		};
	}

	/** One spring from one geometry to another, written as a height and a transform. */
	function springIndicator(from: IndicatorGeometry, to: IndicatorGeometry) {
		const indicator = indicatorEl;
		if (!indicator) return;
		const startCenter = from.y + from.height / 2;
		const targetCenter = to.y + to.height / 2;
		indicatorAnimation = animate(0, 1, {
			...BAR_SPRING,
			onUpdate: (progress) => {
				const height = from.height + (to.height - from.height) * progress;
				const center = startCenter + (targetCenter - startCenter) * progress;
				indicator.style.height = remFromMeasuredPixels(height);
				indicator.style.transform = `translateY(${remFromMeasuredPixels(center - height / 2)})`;
			},
			onComplete: () => {
				indicator.style.height = remFromMeasuredPixels(to.height);
				indicator.style.transform = `translateY(${remFromMeasuredPixels(to.y)})`;
				indicatorAnimation = undefined;
			},
		});
	}

	/** Whatever the indicator is running, and the state that says the reveal is one of them. */
	function stopIndicator() {
		indicatorAnimation?.stop();
		indicatorAnimation = undefined;
		indicatorRevealing = false;
	}

	function followArticleEnd(node: HTMLElement) {
		const article = document.querySelector<HTMLElement>('article');
		let frame = 0;
		let rootPixels = rootFontPixels();
		let navHeight = node.getBoundingClientRect().height;
		let articleTop = 0;
		let articleEnd = Number.POSITIVE_INFINITY;
		let renderedOffset = '';
		let destroyed = false;
		let measureNext = false;

		const position = () => {
			const offset = railEndOffset(window.innerHeight, navHeight, articleEnd - window.scrollY);
			const rendered = remFromMeasuredPixels(offset, rootPixels);
			if (rendered === renderedOffset) return;
			renderedOffset = rendered;
			node.style.setProperty('--toc-end-offset', rendered);
		};

		const calibrate = () => {
			rootPixels = rootFontPixels();
			navHeight = node.getBoundingClientRect().height;
			if (article) {
				const rect = article.getBoundingClientRect();
				articleTop = rect.top + window.scrollY;
				articleEnd = rect.bottom + window.scrollY;
			}
			position();
		};

		const schedule = (measure = false) => {
			measureNext ||= measure;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				if (measureNext) {
					measureNext = false;
					calibrate();
				} else {
					position();
				}
			});
		};

		const resize = new ResizeObserver((observations) => {
			for (const entry of observations) {
				const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
				if (entry.target === node) navHeight = height;
				if (entry.target === article) articleEnd = articleTop + height;
			}
			position();
		});
		resize.observe(node);
		if (article) resize.observe(article);
		const onScroll = () => schedule();
		const onResize = () => schedule(true);
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize);
		calibrate();
		document.fonts.ready.then(() => {
			if (!destroyed) calibrate();
		});

		return {
			destroy() {
				destroyed = true;
				cancelAnimationFrame(frame);
				resize.disconnect();
				window.removeEventListener('scroll', onScroll);
				window.removeEventListener('resize', onResize);
			},
		};
	}

	/**
	 * What each bar is drawn at: the load's answer where there is one, worked out here where not.
	 *
	 * One function either way -- the scale lives in `rail-widths.ts` so a measurement taken in a
	 * `load`, one taken in this component and one painted by the head script are the same numbers.
	 */
	/** What each bar is drawn at: the shape, or the resting half-scale until there is one. */
	const barWidths = $derived(shape ? shape.widths : toc.map(() => MAX_BAR_WIDTH / 2));
	const showText = $derived(phase === 'revealed');

	function handleEnter() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = undefined;
		}
		if (phase === 'revealed') return;
		if (phaseTimer) clearTimeout(phaseTimer);
		phase = 'expanded';
		phaseTimer = setTimeout(() => (phase = 'revealed'), REVEAL_DELAY);
	}

	function handleLeave() {
		if (phaseTimer) clearTimeout(phaseTimer);
		if (leaveTimer) clearTimeout(leaveTimer);
		leaveTimer = setTimeout(() => (phase = 'collapsed'), LEAVE_DELAY);
	}

	$effect(() => {
		const source = toc;
		const headings = source
			.map(({ slug }) => document.getElementById(slug))
			.filter(
				(el): el is HTMLHeadingElement =>
					el instanceof HTMLHeadingElement && headingText(el) !== '',
			);

		hydratedEntries = {
			source,
			entries: headings.map((el) => ({
				el,
				slug: el.id,
				width: 0,
				text: headingText(el),
			})),
		};

		const cleanups: Array<() => void> = [];

		for (const el of headings) {
			el.style.scrollMarginTop = remFromDefaultPixels(SCROLL_OFFSET);
			cleanups.push(() => {
				el.style.scrollMarginTop = '';
			});
		}

		// Only on a fresh navigation. A reload keeps the position the reader had scrolled to,
		// which is the browser's own behaviour and what somebody reloading halfway down a page
		// wants; taking over both alike is what throws that away. See spec/styling/notes.md.
		const interceptedHash = window.canmiArticleInitialHash;
		const initialHash = interceptedHash ?? window.location.hash.slice(1);
		const nav = performance.getEntriesByType('navigation')[0] as
			| PerformanceNavigationTiming
			| undefined;
		if (interceptedHash) {
			history.replaceState(
				history.state,
				'',
				`${window.location.pathname}${window.location.search}#${interceptedHash}`,
			);
			delete window.canmiArticleInitialHash;
		}
		const initialTarget =
			initialHash && nav?.type === 'navigate' ? document.getElementById(initialHash) : null;
		if (initialTarget) {
			const targetIdx = headings.indexOf(initialTarget as HTMLHeadingElement);
			if (targetIdx >= 0) activeIndex = targetIdx;
			isClickScrolling = true;
		}

		let cancelInitialJump: (() => void) | undefined;
		/** One reading per frame however many scroll events arrived. */
		let spyFrame: number | undefined;
		/** How long the recheck above waits for a restored place: a handful of frames, never more. */
		const SETTLE_FRAMES = 30;
		let settleFrame = 0;
		let destroyedSpy = false;
		cleanups.push(() => {
			destroyedSpy = true;
		});

		const raf = requestAnimationFrame(() => {
			const measured: Entry[] = [];
			// Already worked out, before this page was drawn. The elements are still collected --
			// they are what a jump and the scroll spy need -- but nothing is measured again, and
			// nothing therefore changes for the bars to animate between.
			// The elements, which are what a jump and the scroll spy need. Widths are the shape's.
			for (const el of headings) {
				measured.push({ el, slug: el.id, text: headingText(el) });
			}
			hydratedEntries = { source, entries: measured };
			// Nobody handed this render a shape, so it is measured here -- by the same function,
			// so the bars are the ones every other route to this page would have drawn.
			if (!rail) fallback = measureRail(source);
			if (initialTarget) {
				// Bar-width animation snapshots scrollY while resolving keyframes. Start after that
				// restoration phase or it cancels this smooth jump and leaves a cold load at the top.
				cancelInitialJump = scheduleInitialHashJump(
					motionFrame.postRender,
					requestAnimationFrame,
					cancelAnimationFrame,
					() => window.scrollTo({ top: 0, behavior: 'instant' }),
					() => {
						const top =
							initialTarget.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET / 2;
						window.scrollTo({ top, behavior: 'smooth' });
						const onEnd = () => {
							isClickScrolling = false;
						};
						if ('onscrollend' in window) {
							window.addEventListener('scrollend', onEnd, { once: true });
						} else {
							setTimeout(onEnd, 1500);
						}
					},
				);
			}
		});

		const onScroll = () => {
			if (isClickScrolling) return;
			if (window.scrollY <= TOP_DEAD_ZONE) {
				activeIndex = -1;
				if (window.location.hash) {
					history.replaceState(null, '', window.location.pathname + window.location.search);
				}
			}
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		cleanups.push(() => window.removeEventListener('scroll', onScroll));

		/**
		 * The last heading at or above the reading band, which is the one being read.
		 *
		 * One rule, asked of the page. An observer used to answer this by reporting whichever
		 * entry it happened to list first, which is an arbitrary heading whenever more than one
		 * crosses at once -- measured at 7,614px into this article, the rail marked the first
		 * entry while the reader was at the third.
		 */
		const readingAt = (): number => {
			const threshold = window.scrollY + window.innerHeight * 0.3;
			let found = -1;
			headings.forEach((heading, index) => {
				if (heading.getBoundingClientRect().top + window.scrollY <= threshold) found = index;
			});
			return found;
		};

		/**
		 * The scroll is what moves the mark, read once per frame.
		 *
		 * An `IntersectionObserver` was the trigger here and stopped being one: measured on a
		 * fresh load, it delivered a single callback at the top of the page and never fired again,
		 * so nothing marked the rail until the reader clicked an entry. Its whole purpose was to
		 * keep work off the scrolling thread, and the answer it triggered is a loop over this
		 * article's headings -- which is the work, and is a frame's worth of it either way.
		 */
		const follow = () => {
			if (spyFrame !== undefined) return;
			spyFrame = requestAnimationFrame(() => {
				spyFrame = undefined;
				if (isClickScrolling || window.scrollY <= TOP_DEAD_ZONE) return;
				const index = readingAt();
				if (index >= 0) activeIndex = index;
			});
		};
		window.addEventListener('scroll', follow, { passive: true });
		window.addEventListener('resize', follow, { passive: true });
		cleanups.push(() => {
			window.removeEventListener('scroll', follow);
			window.removeEventListener('resize', follow);
			if (spyFrame !== undefined) cancelAnimationFrame(spyFrame);
			spyFrame = undefined;
		});

		/**
		 * Where the reader already is, which on a client navigation they are not yet.
		 *
		 * A restored place is scrolled to after this runs, and a scroll the reader did not make
		 * may not raise an event -- so nothing would mark the rail until they moved. Rechecked on
		 * the next frames, bounded, so a restore that lands late is still met.
		 */
		const settle = () => {
			if (window.scrollY <= TOP_DEAD_ZONE) return false;
			const index = readingAt();
			if (index < 0) return false;
			activeIndex = index;
			return true;
		};
		if (!settle()) {
			let tries = 0;
			const again = () => {
				if (destroyedSpy || settle() || (tries += 1) > SETTLE_FRAMES) return;
				settleFrame = requestAnimationFrame(again);
			};
			settleFrame = requestAnimationFrame(again);
			cleanups.push(() => cancelAnimationFrame(settleFrame));
		}

		return () => {
			cancelAnimationFrame(raf);
			cancelInitialJump?.();
			for (const c of cleanups) c();
			if (phaseTimer) clearTimeout(phaseTimer);
			if (leaveTimer) clearTimeout(leaveTimer);
			stopIndicator();
		};
	});

	$effect(() => {
		if (!asideEl) return;
		const widths = barWidths;
		const active = activeIndex;
		const bars = asideEl.querySelectorAll<HTMLElement>('[data-toc-bar]');
		if (bars.length !== entries.length || bars.length === 0) return;

		if (!firstWidthSet) {
			firstWidthSet = true;
			// The mark the template can no longer draw. On a page opened partway down, the spy
			// settles an active entry from its own effect above -- which runs before this one, in
			// this same flush -- so the entry is already marked by the time the run that would
			// animate it is the one being skipped, and the bar would stay idle until the reader
			// next scrolled. Written rather than animated: a first paint has nothing to move from.
			const marked = bars[active];
			if (marked) marked.style.opacity = '0.8';
			return;
		}

		if (showText) return;

		for (let i = 0; i < entries.length; i++) {
			const bw = widths[i] ?? MAX_BAR_WIDTH / 2;
			const op = i === active ? 0.8 : 0.35;
			const bar = bars[i];
			if (bar === undefined) continue;
			animate(
				bar,
				{
					width: remFromDefaultPixels(bw),
					height: remFromDefaultPixels(BAR_HEIGHT),
					opacity: op,
				},
				{
					...BAR_SPRING,
					onComplete: () => {
						bar.style.width = remFromDefaultPixels(bw);
						bar.style.height = remFromDefaultPixels(BAR_HEIGHT);
					},
				},
			);
		}
	});

	$effect(() => {
		if (!asideEl) return;
		const show = showText;
		const widths = barWidths;
		const active = activeIndex;
		const bars = asideEl.querySelectorAll<HTMLElement>('[data-toc-bar]');
		const texts = asideEl.querySelectorAll<HTMLElement>('[data-toc-text]');
		if (bars.length !== entries.length || bars.length === 0) return;

		if (!firstShowSet) {
			firstShowSet = true;
			return;
		}

		for (let i = 0; i < entries.length; i++) {
			const bw = widths[i] ?? MAX_BAR_WIDTH / 2;
			const restOp = i === active ? 0.8 : 0.35;
			const bar = bars[i];
			const text = texts[i];
			if (bar === undefined || text === undefined) continue;
			const targetW = show ? 0 : bw;
			const targetH = show ? 0 : BAR_HEIGHT;
			animate(
				bar,
				{
					width: remFromDefaultPixels(targetW),
					height: remFromDefaultPixels(targetH),
					opacity: show ? 0 : restOp,
				},
				{
					...BAR_SPRING,
					onComplete: () => {
						bar.style.width = remFromDefaultPixels(targetW);
						bar.style.height = remFromDefaultPixels(targetH);
					},
				},
			);
			animate(
				text,
				{
					height: show ? 'auto' : 0,
					opacity: show ? 1 : 0,
				},
				TEXT_TWEEN,
			);
		}
	});

	$effect(() => {
		if (!asideEl || !indicatorEl) return;
		const show = showText;
		const active = activeIndex;
		const geometry = geometryVersion;
		const buttons = asideEl.querySelectorAll<HTMLElement>('[data-toc-button]');
		if (buttons.length !== entries.length || buttons.length === 0) return;

		if (!firstIndicatorSet) {
			firstIndicatorSet = true;
			prevGeometryVersion = geometry;
			prevShowText = show;
			return;
		}
		const geometryChanged = geometry !== prevGeometryVersion;
		prevGeometryVersion = geometry;
		/** This run is the hover opening the column, rather than one on a column already open. */
		const opening = show && !prevShowText;
		prevShowText = show;

		const visible = show && active >= 0 && active < buttons.length;

		// A reveal in flight is the rail opening, and the geometry it is reported through is the
		// geometry that reveal's own spring is already crossing. Re-placing on each of those
		// reports would drop the mark at the settled position with the column still on its way.
		if (indicatorRevealing && visible && !opening && active === prevIndicatorActive) return;

		stopIndicator();

		if (!visible) {
			indicatorEl.style.opacity = '0';
			prevIndicatorVisible = false;
			prevIndicatorActive = active;
			return;
		}

		/** One write, because the target is arithmetic and does not wait for a layout. */
		const place = () => {
			const target = OPEN(active);
			if (!indicatorEl || !target) return;
			indicatorEl.style.height = remFromMeasuredPixels(target.height);
			indicatorEl.style.transform = `translateY(${remFromMeasuredPixels(target.y)})`;
		};

		if (!prevIndicatorVisible) {
			// Opening, the mark comes out of the collapsed column with its entry and fades in as
			// the labels do; on a column already open -- the reader scrolling out of the top dead
			// zone under a held pointer -- there is nothing to come out of and nothing to arrive
			// with, so the open position is simply where it is.
			if (opening) {
				indicatorEl.style.opacity = '0';
				revealIndicator(active);
			} else {
				place();
				indicatorEl.style.opacity = `${INDICATOR_OPACITY}`;
			}
		} else if (geometryChanged && active === prevIndicatorActive) {
			place();
			indicatorEl.style.opacity = `${INDICATOR_OPACITY}`;
		} else {
			const target = OPEN(active);
			if (!target) return;
			const navRect = asideEl.getBoundingClientRect();
			const indicatorRect = indicatorEl.getBoundingClientRect();
			springIndicator({ y: indicatorRect.top - navRect.top, height: indicatorRect.height }, target);
		}
		prevIndicatorVisible = visible;
		prevIndicatorActive = active;
	});

	$effect(() => {
		if (!asideEl || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => {
			geometryVersion += 1;
		});
		observer.observe(asideEl);
		return () => observer.disconnect();
	});
</script>

{#if entries.length > 0}
	<!-- The rail box takes the pointer back: the strip around it is inert so the column of text
	     beside it stays reachable, and this is the part of the strip that is not. -->
	<nav
		bind:this={asideEl}
		use:followArticleEnd
		aria-label="Table of contents"
		onmouseenter={handleEnter}
		onmouseleave={handleLeave}
		class:revealed={showText}
		class="toc-nav pointer-events-auto relative w-full flex-col items-start overflow-visible {stylex.attrs(
			styles.nav,
		).class}"
	>
		<span
			bind:this={indicatorEl}
			class="pointer-events-none absolute w-0.5 {stylex.attrs(styles.indicator).class}"
			style="left: -0.5rem; top: 0; height: 0.75rem; opacity: 0"
		></span>
		{#each entries as entry, i (entry.slug)}
			<button
				data-toc-button
				type="button"
				aria-label={entry.text}
				aria-current={i === activeIndex ? 'location' : undefined}
				title={entry.text}
				onclick={() => jumpToSection(entry.el, i)}
				class="block max-w-full cursor-pointer py-0.75 text-left {stylex.attrs(
					surfaces.focusRingHost,
					styles.entry,
				).class}"
			>
				<!-- Bar and text each sit in a full-opacity ring host: the inner span carries
				the opacity animation, so drawing the focus ring on the wrapper keeps it crisp
				instead of inheriting the dimmed opacity. The collapsed/revealed state picks
				which wrapper shows the ring (see <style>). -->
				<span
					class:focus-ring-inner={!showText}
					class="toc-ring-bar block w-fit {stylex.attrs(
						!showText && surfaces.focusRingInner,
						styles.barRing,
					).class}"
				>
					<!-- Three answers, in the order they are known. The load's measurement, if it
					     has one. Otherwise a custom property, which the head script sets from what
					     this tab measured earlier in the sitting -- and which is only read on the
					     document the reader arrived in, so a value left over from another article
					     can never reach a navigation. Otherwise `2rem`, the resting shape a server
					     draws and the rail settles out of. See lib/client/measured-ground.ts. -->
					<!-- The opacity is idle here and never the entry being read: this attribute
					     compiles to a write of the whole `cssText`, so interpolating the active
					     entry would erase what the animation last put on this element, at every
					     handover. A server render has nobody reading, so idle is the honest first
					     paint and the only one this side owes; past that the property belongs to
					     the animation alone, see spec/styling/rail.md, "One property, one writer". -->
					<span
						data-toc-bar
						class="block {stylex.attrs(styles.bar).class}"
						style="width: {rail
							? remFromDefaultPixels(barWidths[i] ?? MAX_BAR_WIDTH / 2)
							: settled
								? `var(--toc-bar-${i}, 2rem)`
								: '2rem'}; height: 0.25rem; opacity: 0.35"
					></span>
				</span>
				<span
					class:focus-ring-inner={showText}
					class="toc-ring-text block w-fit max-w-full {stylex.attrs(
						showText && surfaces.focusRingInner,
					).class}"
				>
					<!-- Clamped to two lines within the rail's width. `line-clamp-2` is the four
					     declarations Tailwind writes as one utility -- the `display` among them -- and
					     `[line-clamp:2]` is the standard property beside it, which that utility does
					     not emit; measured in Chrome the standard one computes to nothing, so it is
					     carried across for the engines spec/compat.md floors at rather than for a
					     value that differs today. -->
					<!-- An entry that needs two lines gets two comparable lines. Left to fill and spill,
					     the break lands wherever the width runs out: `Independencia de la` over `UI` puts
					     nineteen characters above two, which reads as a mistake rather than as a wrapped
					     label. `balance` is for exactly this -- short, headline-shaped text, a couple of
					     lines at most -- and it evens out the label's own line lengths, so entries stay
					     independent of each other. Unsupported, the text simply fills. -->
					<span
						data-toc-text
						class="line-clamp-2 max-w-full text-balance whitespace-normal wrap-anywhere [line-clamp:2] {stylex.attrs(
							styles.label,
							i === activeIndex ? styles.labelActive : styles.labelIdle,
						).class}"
						style="height: 0; opacity: 0"
					>
						{entry.text}
					</span>
				</span>
			</button>
		{/each}
	</nav>
{/if}

<style>
	/* A script whose spaces mean something breaks at them first -- see spec/styling/rail.md, "Balance
	   evens the lines; it does not choose where the break may land, and for Han that is the part
	   that matters" and "Japanese is excluded, and the measurement is the argument". The floor is
	   written on the label and this override here, because the override is reached through `:lang`
	   rather than through a class on the element. See spec/todo.md. */
	[data-toc-text]:lang(zh),
	[data-toc-text]:lang(ko) {
		word-break: keep-all;
	}
</style>
