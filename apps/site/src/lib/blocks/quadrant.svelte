<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, family, line, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the quadrant figure. Every colour is the token variable `libs/tokens`
	 * already declares. See spec/architecture/css/authoring.md.
	 *
	 * The figure's geometry is the frame, written on the elements in the markup. What is left in
	 * the block at the foot is the two axis arrowheads alone, which are pseudo-elements no class
	 * reaches: spec/todo/css.md, "An arrowhead is a shape made of borders, and the test cannot cut
	 * it in half".
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
			lineHeight: line.tight,
			color: 'var(--color-text-soft)',
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
			// The tight step, up from 1.2 so the block's three lines are one value.
			lineHeight: line.tight,
		},
		itemNote: {
			fontFamily: family.monoTheme,
			fontSize: text.px10,
			lineHeight: line.tight,
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import type { QuadrantDirection, QuadrantItem, QuadrantPosition } from '@canmi/artifacts/types';

	let {
		title,
		description,
		reading,
		axes,
		items,
	}: {
		title: string;
		description?: string;
		/** What the figure reads as, from `local diagram`, in this view's language. */
		reading?: string;
		axes: Record<QuadrantDirection, string>;
		items: QuadrantItem[];
	} = $props();

	const positions: QuadrantPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
	const figureId = $props.id();
	const titleId = `${figureId}-title`;
	const descriptionId = `${figureId}-description`;

	/**
	 * The half of a region's flow that its name decides: items anchor at the corner nearest the
	 * cross, so the vertical half says how they stack and the horizontal half which way they run.
	 *
	 * Branches rather than a pair of utilities on one property, whose order inside one layer is
	 * not the author's to choose. See spec/architecture/css/migration.md.
	 */
	function cellFlow(position: QuadrantPosition): string {
		const stack = position.startsWith('top')
			? 'flex-wrap-reverse items-end'
			: 'flex-wrap items-start';
		return `${stack} ${position.endsWith('left') ? 'flex-row-reverse' : 'flex-row'}`;
	}

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
	 * once and carried into every locale. See spec/i18n/request.md.
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
     plus the assembled sentences when no reading exists yet. See spec/styling/blocks.md, "The
     picture and the control that opens it are siblings". -->
<figure
	class="overflow-hidden {stylex.attrs(surfaces.blockFrame).class}"
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
	<div class="overflow-x-auto">
		<div
			class="relative mx-auto aspect-[38/21] w-[min(100%,45rem)] min-w-[36rem] {stylex.attrs(
				styles.stage,
			).class}"
			aria-hidden="true"
		>
			<div
				class="absolute top-1/2 left-1/2 grid max-h-[calc(100%-4rem)] min-h-[12rem] max-w-[calc(100%-5rem)] min-w-[20rem] -translate-x-1/2 -translate-y-1/2"
			>
				<div
					class="pointer-events-none relative z-1 col-start-1 row-start-1 w-0 justify-self-center"
				>
					<span
						class="absolute bottom-[calc(100%+1rem)] left-1/2 -translate-x-1/2 whitespace-nowrap {stylex.attrs(
							styles.axisLabel,
						).class}">{visualAxis(axes.top)}</span
					>
					<span
						class="vertical-rule absolute inset-y-0 left-0 {stylex.attrs(styles.verticalRule)
							.class}"
					></span>
					<span
						class="absolute top-[calc(100%+0.75rem)] left-1/2 -translate-x-1/2 whitespace-nowrap {stylex.attrs(
							styles.axisLabel,
						).class}">{visualAxis(axes.bottom)}</span
					>
				</div>
				<div
					class="horizontal-axis pointer-events-none relative z-1 col-start-1 row-start-1 grid self-center {stylex.attrs(
						styles.horizontalAxis,
					).class}"
				>
					<span
						class="absolute top-1/2 right-[calc(100%+0.75rem)] -translate-y-1/2 whitespace-nowrap {stylex.attrs(
							styles.axisLabel,
						).class}">{visualAxis(axes.left)}</span
					>
					<span
						class="absolute top-1/2 left-[calc(100%+1rem)] -translate-y-1/2 whitespace-nowrap {stylex.attrs(
							styles.axisLabel,
						).class}">{visualAxis(axes.right)}</span
					>
				</div>

				<div class="col-start-1 row-start-1 grid w-max grid-cols-2 grid-rows-2">
					{#each positions as position}
						{@const quadrantItems = items.filter((item) => item.at === position)}
						<div
							class="flex max-w-[16rem] min-w-0 content-start justify-start gap-2.5 p-5 {cellFlow(
								position,
							)}"
							data-position={position}
						>
							{#each quadrantItems as item}
								<div
									class="flex w-max max-w-[11rem] flex-col items-center justify-center gap-2.5 px-4 py-2.5 text-center {stylex.attrs(
										styles.box,
									).class}"
								>
									<div class="grid max-w-[13rem] gap-[0.35rem]">
										<span class={stylex.attrs(surfaces.heading, styles.itemTitle).class}
											>{item.title}</span
										>
										{#if item.note}<span class={stylex.attrs(styles.itemNote).class}
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
	/* The two arrowheads, each a triangle drawn out of borders on a pseudo-element. They are the
	whole of what is left here: a class reaches every other element in this figure, so everything
	else is the frame in the markup or the vocabulary above. See spec/architecture/css/layers.md. */
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
</style>
