<script module lang="ts">
	import type { ViewMeta } from '@canmi/artifacts';
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { remFromDefaultPixels, remFromMeasuredPixels } from '$lib/client/units';
	import ArticleCard from './card.svelte';
	import { thumbnails, type Bar } from './thumbnail';

	let {
		articles,
		heading,
		shapes,
	}: {
		articles: {
			meta: ViewMeta;
			published: string;
			path: string;
			paragraphs: string[];
		}[];
		heading: string;
		/**
		 * Every thumbnail's bars, when the load already worked them out.
		 *
		 * Absent means the server drew this, which cannot measure text -- so the cards carry
		 * their default shape and the effect below settles them. Present means a browser
		 * measured before this rendered, and there is nothing to settle: the cards are already
		 * right and nothing animates. See spec/styling/first-paint.md.
		 */
		shapes?: Bar[][];
	} = $props();

	/** The shapes as the markup writes them, so a card can take them straight. */
	const drawn = $derived(
		shapes?.map((bars) =>
			bars.map(({ width, gap }) => ({
				width: remFromDefaultPixels(width),
				marginTop: remFromDefaultPixels(gap),
			})),
		),
	);

	// Bar widths map straight into the range taken from the first frame's bars:
	// shortest (12) to longest (32), no quantization. The title stays within the
	// first half so it reads as a short heading.
	const BODY_MIN = 12;
	const BODY_MAX = 32;
	const TITLE_MIN = 11; // compressed title range so short titles aren't tiny stubs
	const TITLE_MAX = 16; // capped at half the body max
	const TITLE_GAP = 8; // title-to-body gap; reused as the single body separator
	const LINE_GAP = 4; // the body's other two gaps
	// The first frame is the ideal-looking shape; the body only leans toward real
	// proportions by BLEND, so icons stay pretty while differing a little.
	const IDEAL_BODY = [32, 24, 20, 12];
	const BLEND = 0.35;
	const SPRING = { type: 'spring' as const, stiffness: 320, damping: 30 };
	const GAP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
	const GAP_MS = 560;

	let listEl = $state<HTMLElement>();

	function lerp(min: number, max: number, t: number): number {
		return min + Math.min(1, Math.max(0, t)) * (max - min);
	}

	// Deterministic per-article pick of which body gap (1, 2 or 3) is the separator,
	// so the split varies between articles but is stable for a given one.
	function separatorGap(seed: string): number {
		let h = 0;
		for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
		return 1 + (h % 3);
	}

	function fontOf(el: Element): string {
		const cs = getComputedStyle(el);
		return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
	}

	// Up to four clauses from the leading paragraphs, split on sentence punctuation.
	function clauses(paragraphs: string[]): string[] {
		const out: string[] = [];
		for (const p of paragraphs) {
			out.push(
				...p
					.split(/[。．.!?！？，,;；\n]+/)
					.map((s) => s.trim())
					.filter((s) => s.length >= 2),
			);
			if (out.length >= 4) break;
		}
		return out.slice(0, 4);
	}

	// Titles are normalized list-wide (so they vary against each other) into the
	// title half-range. Each article's body is normalized against its own shortest
	// and longest clause, spanning the full body range. Mirrors the ToC: the markup
	// ships a baked first frame and we spring each bar to the computed shape.
	$effect(() => {
		// Nothing to settle when the shapes came with the page. See the prop above.
		if (shapes || !listEl) return;
		const icons = listEl.querySelectorAll<HTMLElement>('[data-article-icon]');
		if (icons.length !== articles.length || icons.length === 0) return;

		const raf = requestAnimationFrame(() => {
			const target = thumbnails(articles, fontOf(listEl?.querySelector('p') ?? document.body));
			icons.forEach((icon, index) => {
				const bars = icon.querySelectorAll<HTMLElement>('[data-icon-bar]');
				const shape = target[index];
				if (bars.length !== 5 || shape === undefined) return;

				bars.forEach((bar, line) => {
					const to = shape[line];
					if (to === undefined) return;
					// Width springs via motion; marginTop is animated with the native WAAPI because
					// motion only snaps layout props (it tweens width but jumps margin). Set the
					// final margin as the base, then tween to it.
					animate(
						bar,
						{ width: remFromDefaultPixels(to.width) },
						{ ...SPRING, onComplete: () => (bar.style.width = remFromDefaultPixels(to.width)) },
					);
					const from = Number.parseFloat(getComputedStyle(bar).marginTop) || 0;
					const gap = remFromDefaultPixels(to.gap);
					bar.style.marginTop = gap;
					bar.animate([{ marginTop: remFromMeasuredPixels(from) }, { marginTop: gap }], {
						duration: GAP_MS,
						easing: GAP_EASE,
					});
				});
			});
		});
		return () => cancelAnimationFrame(raf);
	});
</script>

<!-- Labelled by the heading rather than by a copy of its text, which is how the newsletter
     section does it and one fewer place the same string is written. The id is also what a caller
     needs to reach this heading from outside. -->
<section bind:this={listEl} aria-labelledby="writing-heading" class="mt-16">
	<!-- The heading is a sentence, and the home page around it has selection switched off. -->
	<h2 id="writing-heading" class="select-text mb-3 {stylex.attrs(surfaces.heading).class}">
		{heading}
	</h2>
	<div>
		{#each articles as article, index (article.path)}
			<ArticleCard
				title={article.meta.title}
				subtitle={article.meta.subtitle}
				short_title={article.meta.short.title}
				short_subtitle={article.meta.short.subtitle}
				published={article.published}
				path={article.path}
				bars={drawn?.[index]}
				{index}
			/>
		{/each}
	</div>
</section>
