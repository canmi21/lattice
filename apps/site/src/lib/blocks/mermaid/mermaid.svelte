<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, family, line, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a Mermaid diagram's frame. Every colour is the token variable
	 * `libs/tokens` already declares. See spec/architecture/css/authoring.md.
	 *
	 * Nothing here reaches the diagram: Mermaid writes the SVG, and its own palette stays a
	 * component-local mirror in palette.css (see spec/styling/blocks.md).
	 */
	const styles = stylex.create({
		/** The scrolling area inside it, which repeats the frame's corner so the clip agrees. */
		stage: {
			borderRadius: radius.xl,
		},
		/**
		 * The sketch shown while the diagram is being drawn.
		 *
		 * Only the blur is here. Its opacity is the resting end of `mermaid-breathe`, which reads
		 * that value as the animation's implicit start, so the two mean nothing apart -- and the
		 * keyframe cannot leave the block that names it. See spec/todo.md.
		 */
		placeholder: {
			filter: 'blur(0.3rem)',
		},
		loadingLabel: {
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			lineHeight: line.none,
			color: 'var(--color-text-soft)',
		},
		/** One of the sketch's two boxes. Which end it sits at is the block's. */
		node: {
			borderWidth: border.hairlineRem,
			borderStyle: 'solid',
			borderColor: 'var(--color-border-strong)',
			borderRadius: radius.lg,
			backgroundColor: 'var(--color-paper)',
		},
		/** The line between them, drawn as one edge. */
		path: {
			borderBlockStartWidth: '0.125rem',
			borderBlockStartStyle: 'solid',
			borderBlockStartColor: 'var(--color-border-strong)',
		},
		/** The diagram source, shown instead when Mermaid could not draw it. */
		source: {
			fontFamily: family.monoTheme,
			fontSize: text.px13,
			lineHeight: line.snug,
			color: 'var(--color-text-soft)',
			// The ring belongs to the stage, which `focus-ring-within` draws around the whole box;
			// a second one on the source inside it would read as two controls.
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
	});
</script>

<script lang="ts">
	import './palette.css';
	import { renderMermaid } from './mermaid';

	let {
		source,
		ratio,
		loadingLabel,
		description,
	}: {
		source: string;
		ratio?: number;
		loadingLabel: string;
		/** What the diagram says, from `cms diagram`. Absent until one has been run. */
		description?: string;
	} = $props();
	let root = $state<HTMLElement>();
	let svg = $state('');
	let failed = $state(false);

	$effect(() => {
		const host = root;
		const definition = source;
		if (!host) return;

		let current = true;
		svg = '';
		failed = false;
		void renderMermaid(definition, host).then(
			(result) => {
				if (current) svg = result.svg;
			},
			(error: unknown) => {
				if (!current) return;
				failed = true;
				console.error('Could not render Mermaid diagram', error);
			},
		);

		return () => {
			current = false;
		};
	});
</script>

<div
	bind:this={root}
	class="mermaid-block overflow-hidden {stylex.attrs(surfaces.blockFrame).class}"
>
	<!-- The stage is shorter when the diagram declares a ratio, because the ratio already reserves
	     the height. Written as a ternary rather than two classes on one property, whose order
	     inside one layer is not the author's to choose. See spec/architecture/css/migration.md. -->
	<div
		class="focus-ring-within relative grid items-center overflow-x-auto p-5 {ratio === undefined
			? 'min-h-[13rem]'
			: 'min-h-[8rem]'} {stylex.attrs(styles.stage).class}"
		aria-busy={!svg && !failed}
	>
		{#if svg}
			<!-- Labelled as one picture rather than left as loose text. Mermaid's output is a
			     graph of `text` nodes in draw order, which reads as a word list; the description
			     says what the graph shows. Without one the nodes stay readable, which is worse
			     than a description and better than nothing.

			     Mermaid sanitises tracked diagram source in strict mode before returning this SVG.
			     Stated rather than suppressed; see spec/lint-format.md. -->
			<div
				class="mermaid-result min-w-[30rem]"
				role={description ? 'img' : undefined}
				aria-label={description}
			>
				{@html svg}
			</div>
		{:else if failed}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (the source fallback can overflow
			     horizontally and therefore needs to be reachable by a keyboard) -->
			<pre tabindex="0" class="m-0 min-w-max {stylex.attrs(styles.source).class}"><code
					>{source}</code
				></pre>
		{:else}
			<div
				class={ratio === undefined ? undefined : 'relative min-w-[30rem]'}
				style:aspect-ratio={ratio}
				role="status"
			>
				<div
					class="mermaid-placeholder absolute inset-5 {stylex.attrs(styles.placeholder).class}"
					aria-hidden="true"
				>
					<span
						class="absolute top-1/2 right-[calc(12%+5.5rem)] left-[calc(12%+5.5rem)] {stylex.attrs(
							styles.path,
						).class}"
					></span>
					<span
						class="absolute top-1/2 left-[12%] h-11 w-22 -translate-y-1/2 {stylex.attrs(styles.node)
							.class}"
					></span>
					<span
						class="absolute top-1/2 right-[12%] h-11 w-22 -translate-y-1/2 {stylex.attrs(
							styles.node,
						).class}"
					></span>
				</div>
				<span
					class="absolute inset-0 z-1 grid place-items-center {stylex.attrs(styles.loadingLabel)
						.class}">{loadingLabel}</span
				>
			</div>
		{/if}
	</div>
</div>

<style>
	/* The opacity is here because the keyframe below reads it as its own start, and the keyframe
	   is here because Svelte rewrites its name and no other layer can spell it. So is this rule:
	   the two mean nothing apart. Its placement moved to the markup. See
	   spec/architecture/css/layers.md and spec/todo.md. */
	.mermaid-placeholder {
		opacity: 0.48;
		animation: mermaid-breathe 1.6s ease-in-out infinite alternate;
	}

	/* Here for the same reason: a keyframe Svelte renames, which no other layer can spell. */
	.mermaid-result {
		animation: mermaid-reveal 260ms var(--ease-spring) both;
	}

	.mermaid-result :global(svg) {
		display: block;
		max-inline-size: 100%;
		height: auto;
		margin-inline: auto;
	}

	@keyframes mermaid-breathe {
		to {
			opacity: 0.72;
		}
	}

	@keyframes mermaid-reveal {
		from {
			opacity: 0;
			filter: blur(0.25rem);
			transform: translateY(0.25rem);
		}
		to {
			opacity: 1;
			filter: blur(0);
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mermaid-placeholder,
		.mermaid-result {
			animation: none;
		}
	}
</style>
