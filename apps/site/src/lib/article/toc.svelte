<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
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
			whiteSpace: 'normal',
			overflowWrap: 'anywhere',
			// An entry that needs two lines gets two comparable lines. Left to fill and spill, the
			// break lands wherever the width runs out: `Independencia de la` over `UI` puts nineteen
			// characters above two, which reads as a mistake rather than as a wrapped label. This is
			// what `balance` is for -- short, headline-shaped text, a couple of lines at most -- and
			// it is the label's own line lengths it evens out, so entries stay independent of each
			// other. Where it is unsupported the text simply fills, which is today's behaviour.
			textWrap: 'balance',
		},
		labelActive: {
			color: 'var(--color-text-strong)',
		},
		labelIdle: {
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';
	import { animate, frame as motionFrame } from 'motion';
	import {
		DEFAULT_PIXELS_PER_REM,
		remFromDefaultPixels,
		remFromMeasuredPixels,
	} from '$lib/client/units';
	import type { TocEntry } from '@canmi/artifacts/types';
	import { railEndOffset } from './rail';
	import { scheduleInitialHashJump } from './toc';

	let { toc }: { toc: TocEntry[] } = $props();

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
	type Entry = { el?: HTMLHeadingElement; slug: string; width: number; text: string };
	type HydratedEntries = { source: TocEntry[]; entries: Entry[] };
	type IndicatorGeometry = { y: number; height: number };
	type AnimationControl = { stop: () => void };

	let hydratedEntries = $state.raw<HydratedEntries>();
	/** The widest label as the rail will draw it, which is the widest a bar may be. */
	let labelCeiling = $state(0);
	const entries = $derived(
		hydratedEntries?.source === toc
			? hydratedEntries.entries
			: toc.map<Entry>(({ slug, text }) => ({ slug, width: 0, text })),
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
	let prevGeometryVersion = 0;
	let isClickScrolling = false;
	let phaseTimer: ReturnType<typeof setTimeout> | undefined;
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	let trackingToken = 0;
	let trackingRAF: number | undefined;
	let indicatorAnimation: AnimationControl | undefined;
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
		for (const marker of clone.querySelectorAll('.note-marker')) marker.remove();
		return clone.textContent?.trim() ?? '';
	}

	function fontOf(el: HTMLElement): string {
		const cs = getComputedStyle(el);
		return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
	}

	/** How wide a label may be before it wraps: the shell's cap, which is where the text lives. */
	function expandedLabelWidth(): number {
		const shell = asideEl?.parentElement;
		if (!shell) return Number.POSITIVE_INFINITY;
		const cap = Number.parseFloat(getComputedStyle(shell).maxWidth);
		return Number.isFinite(cap) && cap > 0 ? cap : shell.getBoundingClientRect().width;
	}

	/**
	 * How the rail will lay this entry out: how many lines it takes, and how wide it draws.
	 *
	 * See spec/styling/rail.md, "An entry that wraps contributes half its width per line", for why a
	 * wrapping heading must not report its single-line width. Measured in the label's own font
	 * rather than the heading's, since the two are not proportional and the wrap happens here.
	 */
	function labelMetrics(
		text: string,
		label: HTMLElement | undefined,
		available: number,
	): { lines: number; drawn: number } {
		if (!label || !Number.isFinite(available) || available <= 0) return { lines: 1, drawn: 0 };
		const width = measureNaturalWidth(prepareWithSegments(text, fontOf(label)));
		return {
			lines: Math.min(2, Math.max(1, Math.ceil(width / available))),
			// What the label actually occupies: it cannot exceed the rail, which is where it wraps.
			drawn: Math.min(width, available),
		};
	}

	/**
	 * A stable number for a string, so a tie is broken the same way on every render.
	 *
	 * FNV-1a, which is a few lines and has no other requirement here than that two headings that
	 * differ anywhere land on different numbers. Nothing depends on it being hard to reverse.
	 */
	function textHash(text: string): number {
		let hash = 2166136261;
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}

	/**
	 * Bar widths, in tenths of the longest heading.
	 *
	 * See spec/styling/rail.md, "Collapsed, the bars are a thumbnail of the list", for why a tenth is
	 * the right grain and why the scale is the longest heading rather than the shortest-to-longest
	 * spread.
	 */
	function steppedBars(widths: number[], texts: string[], ceiling: number): number[] {
		if (widths.length === 0) return [];
		// A bar may never be wider than the widest label -- see spec/styling/rail.md, "A bar may never
		// be wider than the widest label".
		const longest = Math.min(MAX_BAR_WIDTH, ceiling > 0 ? ceiling : MAX_BAR_WIDTH);
		const max = Math.max(...widths);
		if (max < 1) return widths.map(() => longest / 2);

		const steps = widths.map((w) => Math.min(STEPS, Math.max(1, Math.round((w / max) * STEPS))));

		// Bring the peaks down until no entry stands more than `MAX_ADJACENT_STEP` above a
		// neighbour. Two passes, forward and back, make the constraint hold both ways. Down
		// rather than up, and only ever toward a neighbour, never levelled with it -- see
		// spec/styling/rail.md, "No entry stands more than three steps above a neighbour, and the
		// outlier comes down".
		const flatten = (from: number[]): number[] => {
			const out: number[] = [];
			for (const step of from) {
				const previous = out.at(-1);
				out.push(previous === undefined ? step : Math.min(step, previous + MAX_ADJACENT_STEP));
			}
			return out;
		};
		const shaved = flatten(flatten(steps).reverse()).reverse();

		// The other half of the same idea: two neighbours on the same step are separated by one,
		// toward whichever side they were already nearer. Both constraints run in one pass --
		// applied separately, the second would undo the first. See spec/styling/rail.md, "Two
		// neighbours on the same step are separated by one step", including the tie-break rule.
		const settled: number[] = [];
		shaved.forEach((step, index) => {
			const previous = settled.at(-1);
			if (previous === undefined) {
				settled.push(step);
				return;
			}
			const held = Math.min(
				previous + MAX_ADJACENT_STEP,
				Math.max(previous - MAX_ADJACENT_STEP, step),
			);
			if (Math.abs(held - previous) >= MIN_ADJACENT_STEP) {
				settled.push(held);
				return;
			}
			// Moved just far enough to be a second mark rather than a repeat of the first. The
			// separation is the point, not the distance: these two headings are the same length,
			// and a bigger push would say they are not.
			const down = Math.max(1, previous - MIN_ADJACENT_STEP);
			const up = Math.min(STEPS, previous + MIN_ADJACENT_STEP);
			// At either end of the scale one of the two directions is not a move at all -- from
			// the tenth step, "up" is the tenth step. Whichever side still has somewhere to go
			// takes it, and only a genuine choice between two of them consults the text.
			const canGoDown = previous - down >= MIN_ADJACENT_STEP;
			const canGoUp = up - previous >= MIN_ADJACENT_STEP;
			if (!canGoDown && !canGoUp) {
				settled.push(held);
				return;
			}
			if (canGoDown !== canGoUp) {
				settled.push(canGoDown ? down : up);
				return;
			}
			const toDown = Math.abs(step - down);
			const toUp = Math.abs(step - up);
			if (toDown !== toUp) {
				settled.push(toDown < toUp ? down : up);
				return;
			}
			settled.push(textHash(texts[index] ?? '') % 2 === 0 ? down : up);
		});

		// Finally, slide the whole column down if nothing in it reaches the low end of the scale.
		// A shift, not a rescale: every difference above was chosen against the two rules, and
		// rescaling would quietly undo them. Moving all of the steps by one amount changes none of
		// them.
		const lowest = Math.min(...settled);
		const excess = Math.max(0, lowest - RESTING_STEP);

		return settled.map((step) => ((step - excess) / STEPS) * longest);
	}

	function indicatorGeometry(button: HTMLElement): IndicatorGeometry {
		const label = button.querySelector<HTMLElement>('[data-toc-text]');
		const lineHeight = label ? parseFloat(getComputedStyle(label).lineHeight) : 0;
		const measuredLines = label && lineHeight > 0 ? Math.round(label.scrollHeight / lineHeight) : 1;
		const lines = Math.min(2, Math.max(1, measuredLines));
		const height = toScaledPixels(INDICATOR_HEIGHT, rootFontPixels()) + lineHeight * (lines - 1);
		const center = button.offsetTop + button.offsetHeight / 2;
		return { y: center - height / 2, height };
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

	const barWidths = $derived(
		steppedBars(
			entries.map((e) => e.width),
			entries.map((e) => e.text),
			labelCeiling,
		),
	);
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

		const raf = requestAnimationFrame(() => {
			const measured: Entry[] = [];
			const labels = asideEl?.querySelectorAll<HTMLElement>('[data-toc-text]');
			const available = expandedLabelWidth();
			let widest = 0;
			for (const [index, el] of headings.entries()) {
				const text = headingText(el);
				const prepared = prepareWithSegments(text, fontOf(el));
				const w = measureNaturalWidth(prepared);
				const { lines, drawn } = labelMetrics(text, labels?.[index], available);
				widest = Math.max(widest, drawn);
				measured.push({ el, slug: el.id, width: w / lines, text });
			}
			labelCeiling = widest;
			hydratedEntries = { source, entries: measured };
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

		const observer = new IntersectionObserver(
			(ixs) => {
				if (isClickScrolling) return;
				if (window.scrollY <= TOP_DEAD_ZONE) return;
				for (const ix of ixs) {
					if (ix.isIntersecting) {
						const idx = headings.indexOf(ix.target as HTMLHeadingElement);
						if (idx >= 0) {
							activeIndex = idx;
							break;
						}
					}
				}
			},
			{ rootMargin: '0% 0% -70% 0%', threshold: 0 },
		);
		for (const h of headings) observer.observe(h);
		cleanups.push(() => observer.disconnect());

		if (window.scrollY > TOP_DEAD_ZONE) {
			const threshold = window.scrollY + window.innerHeight * 0.3;
			let initialIdx = -1;
			headings.forEach((heading, i) => {
				const top = heading.getBoundingClientRect().top + window.scrollY;
				if (top <= threshold) initialIdx = i;
			});
			if (initialIdx >= 0) activeIndex = initialIdx;
		}

		return () => {
			cancelAnimationFrame(raf);
			cancelInitialJump?.();
			for (const c of cleanups) c();
			if (phaseTimer) clearTimeout(phaseTimer);
			if (leaveTimer) clearTimeout(leaveTimer);
			indicatorAnimation?.stop();
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
			return;
		}
		const geometryChanged = geometry !== prevGeometryVersion;
		prevGeometryVersion = geometry;

		trackingToken++;
		if (trackingRAF !== undefined) {
			cancelAnimationFrame(trackingRAF);
			trackingRAF = undefined;
		}
		indicatorAnimation?.stop();
		indicatorAnimation = undefined;

		const visible = show && active >= 0 && active < buttons.length;
		if (!visible) {
			indicatorEl.style.opacity = '0';
			prevIndicatorVisible = false;
			prevIndicatorActive = active;
			return;
		}

		if (!prevIndicatorVisible || (geometryChanged && active === prevIndicatorActive)) {
			const setLivePos = () => {
				if (!asideEl || !indicatorEl) return;
				const btn = asideEl.querySelectorAll<HTMLElement>('[data-toc-button]')[active];
				if (!btn) return;
				const target = indicatorGeometry(btn);
				indicatorEl.style.height = remFromMeasuredPixels(target.height);
				indicatorEl.style.transform = `translateY(${remFromMeasuredPixels(target.y)})`;
			};
			setLivePos();
			indicatorEl.style.opacity = '0.8';

			if (!prevIndicatorVisible) {
				const myToken = trackingToken;
				const start = performance.now();
				const tick = () => {
					if (myToken !== trackingToken) return;
					setLivePos();
					if (performance.now() - start < 200) {
						trackingRAF = requestAnimationFrame(tick);
					} else {
						trackingRAF = undefined;
					}
				};
				trackingRAF = requestAnimationFrame(tick);
			}
		} else {
			const activeButton = buttons[active];
			if (activeButton === undefined) return;
			const target = indicatorGeometry(activeButton);
			const indicator = indicatorEl;
			const navRect = asideEl.getBoundingClientRect();
			const indicatorRect = indicator.getBoundingClientRect();
			const startHeight = indicatorRect.height;
			const startCenter = indicatorRect.top - navRect.top + startHeight / 2;
			const targetCenter = target.y + target.height / 2;
			indicatorAnimation = animate(0, 1, {
				...BAR_SPRING,
				onUpdate: (progress) => {
					const height = startHeight + (target.height - startHeight) * progress;
					const center = startCenter + (targetCenter - startCenter) * progress;
					indicator.style.height = remFromMeasuredPixels(height);
					indicator.style.transform = `translateY(${remFromMeasuredPixels(center - height / 2)})`;
				},
				onComplete: () => {
					indicator.style.height = remFromMeasuredPixels(target.height);
					indicator.style.transform = `translateY(${remFromMeasuredPixels(target.y)})`;
					indicatorAnimation = undefined;
				},
			});
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
		class="toc-nav pointer-events-auto relative w-full flex-col items-start overflow-visible"
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
				class="block max-w-full cursor-pointer py-0.75 text-left {stylex.attrs(styles.entry).class}"
			>
				<!-- Bar and text each sit in a full-opacity ring host: the inner span carries
				the opacity animation, so drawing the focus ring on the wrapper keeps it crisp
				instead of inheriting the dimmed opacity. The collapsed/revealed state picks
				which wrapper shows the ring (see <style>). -->
				<span
					class:focus-ring-inner={!showText}
					class="toc-ring-bar block w-fit {stylex.attrs(styles.barRing).class}"
				>
					<span
						data-toc-bar
						class="block {stylex.attrs(styles.bar).class}"
						style="width: 2rem; height: 0.25rem; opacity: 0.35"
					></span>
				</span>
				<span class:focus-ring-inner={showText} class="toc-ring-text block w-fit max-w-full">
					<span
						data-toc-text
						class={stylex.attrs(
							styles.label,
							i === activeIndex ? styles.labelActive : styles.labelIdle,
						).class}
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
	/* Horizontal placement belongs to the rail box in utilities.css. Vertical centring is the
	   box's `align-items`; this offset rides on top of it near the end of an article. */
	.toc-nav {
		transform: translateY(var(--toc-end-offset, 0rem));
	}

	/* The clamp to two lines, and the width it clamps within. Tailwind writes `line-clamp-2` as
	   these four declarations together and one of them is a `display`, so the set stays where the
	   member that cannot move is; spec/todo.md is already holding the question of a compound
	   utility that straddles the boundary. What the label looks like is the visual layer's and
	   sits at the head of this file. See spec/architecture/css/layers.md. */
	[data-toc-text] {
		display: -webkit-box;
		max-width: 100%;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	/* A script whose spaces mean something breaks at them first -- see spec/styling/rail.md, "Balance
	   evens the lines; it does not choose where the break may land, and for Han that is the part
	   that matters" and "Japanese is excluded, and the measurement is the argument". The floor
	   and this override sit in two layers because the override is reached through `:lang` and
	   the visual layer reaches an element only through a class on it. See spec/todo.md. */
	[data-toc-text]:lang(zh),
	[data-toc-text]:lang(ko) {
		word-break: keep-all;
	}
</style>
