<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, family, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the quadrant figure. Every colour is the token variable `libs/tokens`
	 * already declares. See spec/architecture/css.md.
	 *
	 * The block at the foot is the figure's geometry, including the two axis arrowheads: see
	 * spec/todo.md, "An arrowhead is a shape made of borders, and the test cannot cut it in half".
	 */
	const styles = stylex.create({
		/** The plotting ground. The ink is set once here and inherits into everything below. */
		stage: {
			color: 'var(--color-text)',
		},
		/** The four words naming the directions. */
		axisLabel: {
			fontFamily: family.monoTheme,
			fontSize: text.px10,
			lineHeight: 1.25,
			color: 'var(--color-text-soft)',
			whiteSpace: 'nowrap',
		},
		// Visual under the rule in spec/architecture/css.md: it moves nothing, it says what the
		// element is to a pointer.
		verticalAxis: {
			pointerEvents: 'none',
		},
		/**
		 * The vertical axis, which is a border on a span with no width.
		 *
		 * Written as the logical edge it was written as, and StyleX rewrites it to the physical
		 * one: `border-inline-start` reaches the stylesheet as `border-left`. The site is
		 * horizontal and left to right, so the two resolve to the same computed value.
		 */
		verticalRule: {
			borderInlineStartWidth: border.hairlineRem,
			borderInlineStartStyle: 'solid',
			borderInlineStartColor: 'var(--color-border-strong)',
		},
		/** The horizontal axis, drawn the same way along the other edge. */
		horizontalAxis: {
			borderBlockStartWidth: border.hairlineRem,
			borderBlockStartStyle: 'solid',
			borderBlockStartColor: 'var(--color-border-strong)',
			pointerEvents: 'none',
		},
		/** One plotted item's card. */
		box: {
			borderWidth: border.hairlineRem,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			borderRadius: radius.md,
			backgroundColor: 'var(--color-paper-hover)',
		},
		itemTitle: {
			fontSize: text.px13,
			lineHeight: 1.2,
		},
		itemNote: {
			fontFamily: family.monoTheme,
			fontSize: text.px10,
			lineHeight: 1.25,
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import type { QuadrantDirection, QuadrantItem, QuadrantPosition } from '$lib/content/types';

	let {
		title,
		description,
		reading,
		axes,
		items,
	}: {
		title: string;
		description?: string;
		/** What the figure reads as, from `cms diagram`, in this view's language. */
		reading?: string;
		axes: Record<QuadrantDirection, string>;
		items: QuadrantItem[];
	} = $props();

	const positions: QuadrantPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
	const figureId = $props.id();
	const titleId = `${figureId}-title`;
	const descriptionId = `${figureId}-description`;

	function sentence(value: string): string {
		return /[.!?]$/u.test(value) ? value : `${value}.`;
	}

	function describeItem(item: QuadrantItem): string {
		const [vertical, horizontal] = item.at.split('-') as ['top' | 'bottom', 'left' | 'right'];
		return `${axes[vertical]} and ${axes[horizontal]} region: ${item.title}${item.note ? `, ${item.note}` : ''}`;
	}

	function visualAxis(value: string): string {
		return value.replaceAll('-', '\u2011');
	}

	/**
	 * The figure said in sentences, for a figure nobody has described yet.
	 *
	 * Only a fallback. Its joining words are written here in English while the labels it joins are
	 * the author's and stay in the source language -- a directive is not translated -- so in a
	 * German view this is an English sentence with English nouns in it, which is not a smaller
	 * version of a description. What replaces it is `reading`: prose about the figure, derived
	 * once and carried into every locale. See spec/i18n.md.
	 */
	let assembled = $derived(
		[
			description,
			`The horizontal axis runs from ${axes.left} to ${axes.right}; the vertical axis runs from ${axes.bottom} to ${axes.top}`,
			...(items.length > 0 ? items.map(describeItem) : ['No items are plotted']),
		]
			.filter((part): part is string => Boolean(part))
			.map((part) => sentence(part))
			.join(' '),
	);
</script>

<!-- The figure is named by the derived reading, not by its title, and falls back to the title
     plus the assembled sentences when no reading exists yet. See spec/styling.md, "The picture
     and the control that opens it are siblings". -->
<figure
	class="quadrant-block overflow-hidden {stylex.attrs(surfaces.blockFrame).class}"
	role="img"
	aria-label={reading}
	aria-labelledby={reading ? undefined : titleId}
	aria-describedby={reading ? undefined : descriptionId}
>
	{#if !reading}
		<figcaption class="sr-only">
			<span id={titleId}>{title}</span>
			<span id={descriptionId}>{assembled}</span>
		</figcaption>
	{/if}
	<div class="quadrant-scroll overflow-x-auto">
		<div class="quadrant-stage {stylex.attrs(styles.stage).class}" aria-hidden="true">
			<div class="quadrant-plot">
				<div class="vertical-axis {stylex.attrs(styles.verticalAxis).class}">
					<span class="axis-label axis-top {stylex.attrs(styles.axisLabel).class}"
						>{visualAxis(axes.top)}</span
					>
					<span class="vertical-rule {stylex.attrs(styles.verticalRule).class}"></span>
					<span class="axis-label axis-bottom {stylex.attrs(styles.axisLabel).class}"
						>{visualAxis(axes.bottom)}</span
					>
				</div>
				<div class="horizontal-axis {stylex.attrs(styles.horizontalAxis).class}">
					<span class="axis-label axis-left {stylex.attrs(styles.axisLabel).class}"
						>{visualAxis(axes.left)}</span
					>
					<span class="axis-label axis-right {stylex.attrs(styles.axisLabel).class}"
						>{visualAxis(axes.right)}</span
					>
				</div>

				<div class="quadrant-grid">
					{#each positions as position}
						{@const quadrantItems = items.filter((item) => item.at === position)}
						<div class="quadrant-cell" data-position={position}>
							{#each quadrantItems as item}
								<div class="quadrant-box {stylex.attrs(styles.box).class}">
									<div class="quadrant-item">
										<span class="quadrant-title {stylex.attrs(surfaces.heading, styles.itemTitle).class}"
											>{item.title}</span
										>
										{#if item.note}<span class="quadrant-note {stylex.attrs(styles.itemNote).class}"
												>{item.note}</span
											>{/if}
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</figure>

<style>
	.quadrant-stage {
		position: relative;
		inline-size: min(100%, 45rem);
		min-inline-size: 36rem;
		margin-inline: auto;
		aspect-ratio: 38 / 21;
	}

	.quadrant-plot {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		min-inline-size: 20rem;
		max-inline-size: calc(100% - 5rem);
		min-block-size: 12rem;
		max-block-size: calc(100% - 4rem);
		translate: -50% -50%;
	}

	.vertical-axis {
		z-index: 1;
		position: relative;
		grid-area: 1 / 1;
		justify-self: center;
		inline-size: 0;
	}

	.vertical-rule {
		position: absolute;
		inset-block: 0;
		left: 0;
	}

	.vertical-rule::before {
		position: absolute;
		top: -0.5rem;
		left: 50%;
		width: 0;
		height: 0;
		translate: -50% 0;
		border-inline: 0.3125rem solid transparent;
		border-block-end: 0.5625rem solid var(--color-border-strong);
		content: '';
	}

	.axis-top,
	.axis-bottom {
		position: absolute;
		left: 50%;
		translate: -50% 0;
	}

	.axis-top {
		bottom: calc(100% + 1rem);
	}

	.axis-bottom {
		top: calc(100% + 0.75rem);
	}

	.horizontal-axis {
		z-index: 1;
		position: relative;
		display: grid;
		grid-area: 1 / 1;
		align-self: center;
	}

	.horizontal-axis::after {
		position: absolute;
		top: 50%;
		right: -0.5rem;
		width: 0;
		height: 0;
		translate: 0 -50%;
		border-block: 0.3125rem solid transparent;
		border-inline-start: 0.5625rem solid var(--color-border-strong);
		content: '';
	}

	.axis-left,
	.axis-right {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
	}

	.axis-left {
		right: calc(100% + 0.75rem);
	}

	.axis-right {
		left: calc(100% + 1rem);
	}

	.quadrant-grid {
		display: grid;
		grid-area: 1 / 1;
		grid-template: repeat(2, minmax(0, 1fr)) / repeat(2, minmax(0, 1fr));
		inline-size: max-content;
	}

	.quadrant-cell {
		display: flex;
		min-inline-size: 0;
		max-inline-size: 16rem;
		flex-wrap: wrap;
		gap: 0.625rem;
		padding: 1.25rem;
	}

	.quadrant-cell[data-position^='top'] {
		flex-wrap: wrap-reverse;
		align-content: flex-start;
		align-items: flex-end;
	}

	.quadrant-cell[data-position^='bottom'] {
		align-content: flex-start;
		align-items: flex-start;
	}

	.quadrant-cell[data-position$='left'] {
		flex-direction: row-reverse;
		justify-content: flex-start;
	}

	.quadrant-cell[data-position$='right'] {
		justify-content: flex-start;
	}

	.quadrant-box {
		display: flex;
		inline-size: max-content;
		max-inline-size: 11rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		padding: 0.625rem 1rem;
		text-align: center;
	}

	.quadrant-item {
		display: grid;
		gap: 0.35rem;
		max-inline-size: 13rem;
	}
</style>
