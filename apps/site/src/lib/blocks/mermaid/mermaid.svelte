<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, family, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a Mermaid diagram's frame. Every colour is the token variable
	 * `libs/tokens` already declares. See spec/architecture/css.md.
	 *
	 * Nothing here reaches the diagram: Mermaid writes the SVG, and its own palette stays a
	 * component-local mirror in palette.css (see spec/styling.md). The scoped block at the foot
	 * holds the frame's geometry, the two keyframes -- unnameable outside it, since Svelte
	 * rewrites a keyframe's name -- and the resting opacity one of them interpolates from.
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
			lineHeight: 1,
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
			lineHeight: 1.4,
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

<div bind:this={root} class="mermaid-block overflow-hidden {stylex.attrs(surfaces.blockFrame).class}">
	<div
		class="mermaid-stage focus-ring-within relative overflow-x-auto p-5 {stylex.attrs(styles.stage)
			.class}"
		class:mermaid-intrinsic-stage={ratio !== undefined}
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
				class="mermaid-result"
				role={description ? 'img' : undefined}
				aria-label={description}
			>
				{@html svg}
			</div>
		{:else if failed}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (the source fallback can overflow
			     horizontally and therefore needs to be reachable by a keyboard) -->
			<pre tabindex="0" class={stylex.attrs(styles.source).class}><code>{source}</code></pre>
		{:else}
			<div
				class="mermaid-loading"
				class:mermaid-intrinsic={ratio !== undefined}
				style:aspect-ratio={ratio}
				role="status"
			>
				<div
					class="mermaid-placeholder {stylex.attrs(styles.placeholder).class}"
					aria-hidden="true"
				>
					<span class="mermaid-path {stylex.attrs(styles.path).class}"></span>
					<span class="mermaid-node mermaid-node-start {stylex.attrs(styles.node).class}"></span>
					<span class="mermaid-node mermaid-node-end {stylex.attrs(styles.node).class}"></span>
				</div>
				<span class="mermaid-loading-label {stylex.attrs(styles.loadingLabel).class}"
					>{loadingLabel}</span
				>
			</div>
		{/if}
	</div>
</div>

<style>
	.mermaid-stage {
		display: grid;
		min-block-size: 13rem;
		align-items: center;
	}

	.mermaid-stage.mermaid-intrinsic-stage {
		min-block-size: 8rem;
	}

	/* The opacity is here because the keyframe below reads it as its own start, and the keyframe
	   is here because Svelte rewrites its name and no other layer can spell it. See
	   spec/architecture/css.md and spec/todo.md. */
	.mermaid-placeholder {
		position: absolute;
		inset: 1.25rem;
		opacity: 0.48;
		animation: mermaid-breathe 1.6s ease-in-out infinite alternate;
	}

	.mermaid-loading.mermaid-intrinsic {
		position: relative;
		min-inline-size: 30rem;
	}

	.mermaid-loading-label {
		position: absolute;
		z-index: 1;
		display: grid;
		inset: 0;
		place-items: center;
	}

	/* The translate is placement: it is what centres the box on the line, and the box moves if
	   it goes. See spec/architecture/css.md. */
	.mermaid-node {
		position: absolute;
		top: 50%;
		width: 5.5rem;
		height: 2.75rem;
		translate: 0 -50%;
	}

	.mermaid-node-start {
		left: 12%;
	}

	.mermaid-node-end {
		right: 12%;
	}

	.mermaid-path {
		position: absolute;
		top: 50%;
		left: calc(12% + 5.5rem);
		right: calc(12% + 5.5rem);
	}

	.mermaid-result {
		min-inline-size: 30rem;
		animation: mermaid-reveal 260ms var(--ease-spring) both;
	}

	.mermaid-result :global(svg) {
		display: block;
		max-inline-size: 100%;
		height: auto;
		margin-inline: auto;
	}

	pre {
		min-inline-size: max-content;
		margin: 0;
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
