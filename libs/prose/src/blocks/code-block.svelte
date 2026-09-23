<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import {
		border,
		duration,
		easing,
		line,
		radius,
		text,
		transition,
		weight,
	} from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of a code block. Every colour is the token variable `libs/tokens` already
	 * declares. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot styles what no class reaches: Shiki's own preformatted element
	 * -- spelled out, per that file's "A comment in the module script cannot write a tag in angle
	 * brackets" -- and spans, plus the copy control's reveal, gated on an ancestor. Everything
	 * else it used to hold is geometry and is now in the markup.
	 */
	const styles = stylex.create({
		// Shared by the two titles, which differ only in whether the title is a control.
		titleFace: {
			borderColor: 'var(--color-border)',
			backgroundColor: 'var(--color-paper-hover)',
			fontWeight: weight.medium,
		},
		titleLabel: {
			color: 'var(--color-text)',
		},
		titleControl: {
			color: {
				default: 'var(--color-text)',
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
			// The whole of `transition.colors`, the three `--tw-gradient-*` variables included.
			// Nothing here sets a gradient and they animate nothing, but the measure of sameness
			// is the computed value and dropping them changes it. Whether the visual layer should
			// be naming another framework's private variables is in spec/todo/todo.md.
			transitionProperty: transition.colors,
			transitionDuration: '150ms',
			transitionTimingFunction: easing.inOut,
			// The ring belongs to the frame, which `focus-ring-within` draws around the whole
			// block; a second one on the title inside it would read as two controls.
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
		/** The divider under a title. The colour is the face's; this is only its edge. */
		divider: {
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
		},
		chevron: {
			color: 'var(--color-text-soft)',
			// Reduced motion is the same suppression the block used to write as `transition:
			// none`, which is four longhands rather than one: the shorthand also returns the
			// duration and the curve to their initial values.
			transitionProperty: {
				default: 'transform, translate, scale, rotate',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: easing.inOut,
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
		// Turning to face the other way is not a move, and that is no longer what decides it:
		// `transform` splits by site under spec/architecture/css/layers.md, and a rotation on one
		// element that belongs to no reused recipe is the frame's. Moving it is migration work.
		chevronFlipped: {
			rotate: '180deg',
		},
		scroll: {
			backgroundColor: 'var(--color-paper)',
			fontSize: text.px14,
			lineHeight: line.snug,
		},
		copy: {
			borderRadius: radius.sm,
			fontSize: text.px12,
			lineHeight: line.none,
			// unnamed: the only tracking on lowercase here, and one site is not a scale.
			letterSpacing: '0.05em',
			// A bare `:hover`, with no `(hover: hover)` around it, because a bare one is what the
			// rule this replaced was written as. Sameness first; see spec/architecture/css/migration.md.
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
				':focus-visible': 'var(--color-text-strong)',
			},
			transitionProperty: 'color',
			transitionDuration: '150ms',
		},
		// Two properties in the list, so the curve is stated twice: a transition's other lists
		// are read per property, and one value against two properties is not the same computed
		// style as two.
		copyIcon: {
			transitionProperty: {
				default: 'opacity, transform',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '120ms, 120ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'ease-out, ease-out',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
	});
</script>

<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import X from '@lucide/svelte/icons/x';
	import { animate } from 'motion';
	import { onDestroy, untrack } from 'svelte';
	import {
		animateHeight,
		prefersReducedMotion,
		type AnimationControl,
		type CollapsePhase,
	} from '@canmi/behavior/collapse';

	type Props = {
		label?: string;
		title?: string;
		collapsible?: boolean;
		default_expanded?: boolean;
		copyLabel: string;
		copiedLabel: string;
		copyFailedLabel: string;
		code?: string;
		html?: string;
	};
	let {
		label,
		title,
		collapsible,
		default_expanded = true,
		copyLabel,
		copiedLabel,
		copyFailedLabel,
		code,
		html,
	}: Props = $props();

	type CopyState = 'copied' | 'copying' | 'failed' | 'idle';

	const COPY_REVEAL_SPRING = {
		type: 'spring' as const,
		stiffness: 500,
		damping: 36,
		mass: 0.8,
	};
	const COPY_REVEAL_REM = 1.25;
	const COPY_SLIDE_REM = 0.375;
	const COPY_FEEDBACK_RESET_MS = 650;
	const instanceId = $props.id();
	const panelId = `${instanceId}-panel`;
	// This prop is an initial state, not a command that reopens a disclosure after interaction.
	const initiallyExpanded = untrack(() => !title || collapsible === false || default_expanded);
	let expanded = $state(initiallyExpanded);
	let phase = $state<CollapsePhase>(initiallyExpanded ? 'expanded' : 'collapsed');
	let collapseEl = $state<HTMLElement>();
	let collapseMotion: AnimationControl | undefined;
	let copyState = $state<CopyState>('idle');
	let copyContentEl = $state<HTMLElement>();
	let copyGlyphEl = $state<HTMLElement>();
	let copyRevealMotion: AnimationControl | undefined;
	let copyRevealProgress = 0;
	let resetAfterReveal = false;
	let copyPointerInside = false;
	let copyKeyboardFocused = false;
	let copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
	let destroyed = false;
	const canCollapse = $derived(Boolean(title) && (collapsible ?? true));
	const hasLanguageLabel = $derived(Boolean(label));
	const panelHidden = $derived(canCollapse && !expanded);
	const dividerVisible = $derived(!canCollapse || phase !== 'collapsed');
	const copyActionLabel = $derived(
		copyState === 'copied' ? copiedLabel : copyState === 'failed' ? copyFailedLabel : copyLabel,
	);
	const copyFeedback = $derived(
		copyState === 'copied' ? copiedLabel : copyState === 'failed' ? copyFailedLabel : '',
	);

	function settle(nextExpanded: boolean) {
		if (collapseEl) collapseEl.style.height = nextExpanded ? 'auto' : '0rem';
		phase = nextExpanded ? 'expanded' : 'collapsed';
		collapseMotion = undefined;
	}

	function setExpanded(nextExpanded: boolean) {
		if (!canCollapse || nextExpanded === expanded || !collapseEl) return;

		collapseMotion?.stop();
		collapseMotion = undefined;
		expanded = nextExpanded;
		phase = nextExpanded ? 'expanding' : 'collapsing';

		const targetHeight = nextExpanded ? collapseEl.scrollHeight : 0;
		collapseMotion = animateHeight(collapseEl, targetHeight, (finished) => {
			if (finished !== undefined && collapseMotion !== finished) return;
			settle(nextExpanded);
		});
	}

	function renderCopyReveal(progress: number) {
		copyRevealProgress = progress;
		if (copyContentEl) {
			copyContentEl.style.transform = hasLanguageLabel
				? `translateX(${COPY_REVEAL_REM * (1 - progress)}rem)`
				: 'none';
		}
		if (copyGlyphEl) {
			copyGlyphEl.style.opacity = String(progress);
			copyGlyphEl.style.transform = hasLanguageLabel
				? `translateX(${COPY_SLIDE_REM * (1 - progress)}rem)`
				: `scale(${0.82 + 0.18 * progress})`;
		}
	}

	function completeCopyReveal(target: number) {
		renderCopyReveal(target);
		copyRevealMotion = undefined;
		if (
			target === 0 &&
			resetAfterReveal &&
			!copyPointerInside &&
			!copyKeyboardFocused &&
			copyState !== 'copying'
		) {
			resetAfterReveal = false;
			copyState = 'idle';
		}
	}

	function setCopyReveal(revealed: boolean) {
		const target = revealed ? 1 : 0;
		copyRevealMotion?.stop();
		copyRevealMotion = undefined;
		if (prefersReducedMotion() || Math.abs(copyRevealProgress - target) < 0.001) {
			completeCopyReveal(target);
			return;
		}

		let control: AnimationControl;
		control = animate(copyRevealProgress, target, {
			...COPY_REVEAL_SPRING,
			onUpdate: renderCopyReveal,
			onComplete: () => {
				if (copyRevealMotion !== control) return;
				completeCopyReveal(target);
			},
		});
		copyRevealMotion = control;
	}

	function clearCopyFeedbackTimer() {
		if (!copyFeedbackTimer) return;
		clearTimeout(copyFeedbackTimer);
		copyFeedbackTimer = undefined;
	}

	function resetCopyFeedback() {
		if (copyPointerInside || copyKeyboardFocused || copyState === 'copying') return;
		resetAfterReveal = copyState !== 'idle';
		setCopyReveal(false);
	}

	function scheduleCopyReset() {
		clearCopyFeedbackTimer();
		if (copyState === 'idle') {
			setCopyReveal(false);
			return;
		}
		if (copyState === 'copying') return;

		copyFeedbackTimer = setTimeout(() => {
			copyFeedbackTimer = undefined;
			resetCopyFeedback();
		}, COPY_FEEDBACK_RESET_MS);
	}

	function enterCopy() {
		copyPointerInside = true;
		resetAfterReveal = false;
		clearCopyFeedbackTimer();
		setCopyReveal(true);
	}

	function leaveCopy() {
		copyPointerInside = false;
		if (!copyKeyboardFocused) scheduleCopyReset();
	}

	function focusCopy(event: FocusEvent) {
		copyKeyboardFocused = (event.currentTarget as HTMLElement).matches(':focus-visible');
		if (!copyKeyboardFocused) return;
		resetAfterReveal = false;
		clearCopyFeedbackTimer();
		setCopyReveal(true);
	}

	function keyCopy() {
		copyKeyboardFocused = true;
		resetAfterReveal = false;
		clearCopyFeedbackTimer();
		setCopyReveal(true);
	}

	function blurCopy() {
		copyKeyboardFocused = false;
		if (!copyPointerInside) scheduleCopyReset();
	}

	async function copySource() {
		if (code === undefined) return;
		clearCopyFeedbackTimer();
		resetAfterReveal = false;
		copyState = 'copying';
		setCopyReveal(true);
		try {
			await navigator.clipboard.writeText(code);
			if (destroyed) return;
			copyState = 'copied';
		} catch {
			if (destroyed) return;
			copyState = 'failed';
		}
		if (!copyPointerInside && !copyKeyboardFocused) scheduleCopyReset();
	}

	onDestroy(() => {
		destroyed = true;
		collapseMotion?.stop();
		copyRevealMotion?.stop();
		clearCopyFeedbackTimer();
	});
</script>

{#snippet codeAction()}
	{#if code !== undefined}
		<!-- The control's two shapes are written as ternaries rather than as a base utility and a
		     variant class over it: two utilities for one property in one layer are ordered by
		     something the author does not control. See spec/architecture/css/migration.md.
		     `code-copy-unlabelled` stays because the reveal's own halves below still read it. -->
		<button
			type="button"
			class="code-copy focus-ring absolute top-2 right-2 z-10 inline-flex h-6 min-w-6 cursor-pointer items-center overflow-hidden px-1 {hasLanguageLabel
				? 'justify-end'
				: 'justify-center'} {stylex.attrs(styles.copy).class}"
			class:code-copy-unlabelled={!hasLanguageLabel}
			data-copy-state={copyState}
			aria-label={copyActionLabel}
			onmouseenter={enterCopy}
			onmouseleave={leaveCopy}
			onfocus={focusCopy}
			onblur={blurCopy}
			onkeydown={keyCopy}
			onclick={copySource}
		>
			<span bind:this={copyContentEl} class="code-copy-content inline-flex items-center">
				{#if label}<span class="code-copy-label" aria-hidden="true">{label}</span>{/if}
				<span
					class="code-copy-mask inline-flex shrink-0 overflow-hidden {hasLanguageLabel
						? 'w-5'
						: 'w-3.5'}"
					aria-hidden="true"
				>
					<span
						bind:this={copyGlyphEl}
						class="code-copy-glyph grid w-3.5 flex-[0_0_0.875rem] {hasLanguageLabel
							? 'ml-1.5'
							: 'ml-0'}"
					>
						<span
							class="code-copy-icon code-copy-request col-start-1 row-start-1 grid place-items-center {stylex.attrs(
								styles.copyIcon,
							).class}"
						>
							<Copy class="size-3.5" />
						</span>
						<span
							class="code-copy-icon code-copy-success col-start-1 row-start-1 grid place-items-center {stylex.attrs(
								styles.copyIcon,
							).class}"
						>
							<Check class="size-3.5" />
						</span>
						<span
							class="code-copy-icon code-copy-failure col-start-1 row-start-1 grid place-items-center {stylex.attrs(
								styles.copyIcon,
							).class}"
						>
							<X class="size-3.5" />
						</span>
					</span>
				</span>
			</span>
		</button>
		<span class="sr-only" aria-live="polite">{copyFeedback}</span>
	{/if}
{/snippet}

{#snippet source()}
	{#if html}
		{@html html}
	{:else if code}
		<pre><code>{code}</code></pre>
	{/if}
{/snippet}

<div class="codeblock relative">
	{#if title}
		<div
			class="code-frame focus-ring-within overflow-hidden {stylex.attrs(surfaces.blockFrame).class}"
		>
			{#if canCollapse}
				<!-- The whole row is the control, so the hand covers all of it rather than the
				     chevron alone. -->
				<button
					type="button"
					class="code-title flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left {stylex.attrs(
						surfaces.uiText,
						styles.titleFace,
						styles.titleControl,
						dividerVisible && styles.divider,
					).class}"
					aria-expanded={expanded}
					aria-controls={panelId}
					onclick={() => setExpanded(!expanded)}
				>
					<span>{title}</span>
					<span
						class="code-chevron shrink-0 {stylex.attrs(
							styles.chevron,
							expanded && styles.chevronFlipped,
						).class}"
					>
						<ChevronDown class="size-3.5" aria-hidden="true" />
					</span>
				</button>
			{:else}
				<div
					class="px-4 py-2.5 {stylex.attrs(
						surfaces.uiText,
						styles.titleFace,
						styles.titleLabel,
						styles.divider,
					).class}"
				>
					{title}
				</div>
			{/if}

			<!-- The height is the script's, written inline while it animates; these two say what the
			     box is at each end of that. A component varying on its own data attribute has no
			     StyleX spelling (spec/architecture/css/authoring.md) but the frame has one, and a
			     class reaches this element, so the frame is where they go. -->
			<div
				bind:this={collapseEl}
				class="overflow-hidden data-[phase=collapsed]:h-0 data-[phase=collapsing]:[will-change:height] data-[phase=expanding]:[will-change:height]"
				data-phase={canCollapse ? phase : 'expanded'}
			>
				<div id={panelId} class="code-panel relative" aria-hidden={panelHidden} inert={panelHidden}>
					{@render codeAction()}
					<div class="code-scroll overflow-x-auto p-4 pr-16 {stylex.attrs(styles.scroll).class}">
						{@render source()}
					</div>
					<!-- Both edges, each as wide as the padding it starts over: at rest they cover the
					     scroller's own gutters and veil nothing, and each begins to do its work
					     exactly as the code starts passing under it. `from-transparent` is
					     transparent black and still cannot grey the ramp, because gradient stops
					     interpolate premultiplied; `from-paper/0` computes to the same colour.
					     Flush with the panel: here the border and corner are the frame's own. -->
					<span
						aria-hidden="true"
						class="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-l from-transparent to-paper"
					></span>
					<span
						aria-hidden="true"
						class="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-r from-transparent to-paper"
					></span>
				</div>
			</div>
		</div>
	{:else}
		<div class="code-panel relative">
			{@render codeAction()}
			<!-- Shiki tags its <pre> with tabindex=0 so keyboard users can focus and scroll the
			code, so focus lands on the inner code area, not this box. The ring is redirected
			out to this bordered box via :has (see <style>) so it wraps the whole code block. -->
			<div
				class="code-scroll focus-ring-within overflow-x-auto p-4 pr-16 {stylex.attrs(
					surfaces.blockFrame,
					styles.scroll,
				).class}"
			>
				{@render source()}
			</div>
			<!-- The same pair, stepped inside the hairline and given the frame's corner, because
			     here both are the scroller's own and a flush rectangle would paint over each. -->
			<span
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-px left-px w-4 rounded-l-xl bg-linear-to-l from-transparent to-paper"
			></span>
			<span
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-px right-px w-4 rounded-r-xl bg-linear-to-r from-transparent to-paper"
			></span>
		</div>
	{/if}
</div>

<style>
	/* The width is what makes the scroller's own end padding real. Shiki's pre is a block and
	   takes the content width, so a long line overflows the pre rather than widening it -- and a
	   scrollable area grown by a descendant's overflow does not get the padding, leaving `pr-16`
	   buying nothing the moment a block scrolls, with code running under the copy control and
	   under the fade. Sizing the pre to its own content puts the reserved column back. */
	.codeblock :global(pre) {
		background: transparent;
		margin: 0;
		padding: 0;
		inline-size: max-content;
		min-inline-size: 100%;
	}

	/* The code still scrolls and no longer draws a bar for it: the fade at the right edge is the
	   affordance instead, and a bar under the last line was a second one that also moved the
	   block's height on platforms reserving room for it. The two halves mean nothing apart --
	   one engine reads only the property, the other only the pseudo-element, which no class can
	   reach -- so they stay together here. See spec/architecture/css/layers.md. */
	.code-scroll {
		scrollbar-width: none;
	}

	.code-scroll::-webkit-scrollbar {
		display: none;
	}

	/* Shiki's <pre> takes focus, while the shared within utility draws on this box. The title
	   suppresses its own outline from the visual layer, which cannot reach in here: this element
	   is Shiki's rather than the component's. See spec/architecture/css/authoring.md. */
	.codeblock :global(pre:focus-visible) {
		outline: none;
	}

	/* The copy control's reveal, and only that: the four values `renderCopyReveal(0)` writes
	   inline the moment the script runs, plus the two the copy state swaps. The set stays whole
	   because each member's other value is behind a class or an attribute on the button above,
	   which is an ancestor the visual layer cannot see without a marker nobody owns yet. The
	   control's geometry went to the markup. See spec/architecture/css/migration.md, "The test
	   applies to a declaration, and stops applying to a member of a set", and spec/todo/todo.md. */
	.code-copy-content {
		transform: translateX(1.25rem);
	}

	.code-copy-unlabelled .code-copy-content {
		transform: none;
	}

	.code-copy-glyph {
		opacity: 0;
		transform: translateX(0.375rem);
	}

	.code-copy-unlabelled .code-copy-glyph {
		transform: scale(0.82);
	}

	.code-copy-icon {
		opacity: 0;
		transform: scale(0.82);
	}

	.code-copy[data-copy-state='idle'] .code-copy-request,
	.code-copy[data-copy-state='copying'] .code-copy-request,
	.code-copy[data-copy-state='copied'] .code-copy-success,
	.code-copy[data-copy-state='failed'] .code-copy-failure {
		opacity: 1;
		transform: scale(1);
	}

	.codeblock :global(.shiki),
	.codeblock :global(.shiki span) {
		color: var(--shiki-light);
	}

	:global(.dark) .codeblock :global(.shiki),
	:global(.dark) .codeblock :global(.shiki span),
	:global([data-theme='dark']) .codeblock :global(.shiki),
	:global([data-theme='dark']) .codeblock :global(.shiki span) {
		color: var(--shiki-dark);
	}
</style>
