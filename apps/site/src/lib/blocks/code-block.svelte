<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, duration, easing, leading, line, radius, text, transition, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a code block. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The scoped block at the foot of this file is not a leftover of the migration. Shiki writes
	 * the preformatted element and the spans inside it, and a style reaches an element only
	 * through a class on that element, so nothing that styles Shiki's markup can be said here.
	 * What stays beside it is geometry, and the resting frame of the copy control's reveal,
	 * which is gated by a variant class and a copy state that both sit on an ancestor of what
	 * they style.
	 *
	 * Nothing in this block may write a tag in angle brackets, in a comment or anywhere else.
	 * Measured with the style element's own name: oxfmt then deletes the whole instance script
	 * below, silently and with a zero exit status.
	 */
	const styles = stylex.create({
		// Shared by the two titles, which differ only in whether the title is a control.
		titleFace: {
			borderColor: 'var(--color-border)',
			backgroundColor: 'var(--color-paper-hover)',
			fontSize: text.px14,
			// The line as a length rather than as the ratio `text-sm` writes it, `calc(1.25 /
			// 0.875)`, which is the same 1.25rem and cannot be written that way here: StyleX
			// evaluates a calc and keeps five decimals, and 1.42857 against 14px lands at
			// 19.99998, which Chrome floors to the 1/64px below. Measured: the title lost
			// 0.0156px of height and every element under it on the page moved with it.
			lineHeight: leading.px20,
			fontWeight: weight.medium,
		},
		titleLabel: {
			color: 'var(--color-text)',
		},
		titleControl: {
			// Visual under the rule in spec/architecture/css.md: it moves nothing, it says what
			// the element is to a pointer.
			cursor: 'pointer',
			color: {
				default: 'var(--color-text)',
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
			// The whole of `transition-colors`, the three `--tw-gradient-*` variables included.
			// Nothing here sets a gradient and they animate nothing, but the measure of sameness
			// is the computed value and dropping them changes it. Whether the visual layer should
			// be naming another framework's private variables is in spec/todo.md.
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
			transitionDuration: { default: duration.base, '@media (prefers-reduced-motion: reduce)': '0s' },
			transitionTimingFunction: {
				default: easing.inOut,
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
		// Turning to face the other way is not a move: the box is where it was, and the glyph is
		// the disclosure's state rather than its position. See spec/architecture/css.md.
		chevronFlipped: {
			rotate: '180deg',
		},
		scroll: {
			backgroundColor: 'var(--color-paper)',
			fontSize: text.px14,
			lineHeight: line.snug,
		},
		copy: {
			cursor: 'pointer',
			borderRadius: radius.sm,
			fontSize: text.px12,
			lineHeight: 1,
			letterSpacing: '0.05em',
			// A bare `:hover`, with no `(hover: hover)` around it, because a bare one is what the
			// rule this replaced was written as. Sameness first; see spec/architecture/css.md.
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
	} from '$lib/client/collapse';

	type Props = {
		label?: string;
		title?: string;
		collapsible?: boolean;
		defaultExpanded?: boolean;
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
		defaultExpanded = true,
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
	const initiallyExpanded = untrack(() => !title || collapsible === false || defaultExpanded);
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
		<button
			type="button"
			class="code-copy focus-ring {stylex.attrs(styles.copy).class}"
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
			<span bind:this={copyContentEl} class="code-copy-content">
				{#if label}<span class="code-copy-label" aria-hidden="true">{label}</span>{/if}
				<span class="code-copy-mask" aria-hidden="true">
					<span bind:this={copyGlyphEl} class="code-copy-glyph">
						<span class="code-copy-icon code-copy-request {stylex.attrs(styles.copyIcon).class}">
							<Copy class="size-3.5" />
						</span>
						<span class="code-copy-icon code-copy-success {stylex.attrs(styles.copyIcon).class}">
							<Check class="size-3.5" />
						</span>
						<span class="code-copy-icon code-copy-failure {stylex.attrs(styles.copyIcon).class}">
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
		<div class="code-frame focus-ring-within overflow-hidden {stylex.attrs(surfaces.blockFrame).class}">
			{#if canCollapse}
				<button
					type="button"
					class="code-title flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left {stylex.attrs(
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
					class="px-4 py-2.5 {stylex.attrs(styles.titleFace, styles.titleLabel, styles.divider)
						.class}"
				>
					{title}
				</div>
			{/if}

			<div
				bind:this={collapseEl}
				class="code-collapse"
				data-phase={canCollapse ? phase : 'expanded'}
			>
				<div id={panelId} class="code-panel relative" aria-hidden={panelHidden} inert={panelHidden}>
					{@render codeAction()}
					<div class="code-scroll overflow-x-auto p-4 pr-16 {stylex.attrs(styles.scroll).class}">
						{@render source()}
					</div>
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
		</div>
	{/if}
</div>

<style>
	.codeblock :global(pre) {
		background: transparent;
		margin: 0;
		padding: 0;
	}

	/* Shiki's <pre> takes focus, while the shared within utility draws on this box. The title
	   suppresses its own outline from the visual layer, which cannot reach in here: this element
	   is Shiki's rather than the component's. See spec/architecture/css.md. */
	.codeblock :global(pre:focus-visible) {
		outline: none;
	}

	/* The copy control and the collapse, in geometry only: where each part is and how large.
	   What they look like is the visual layer's and sits at the head of this file. See
	   spec/architecture/css.md. */
	.code-copy {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 10;
		display: inline-flex;
		height: 1.5rem;
		min-width: 1.5rem;
		align-items: center;
		justify-content: flex-end;
		overflow: hidden;
		padding-inline: 0.25rem;
	}

	.code-copy-unlabelled {
		justify-content: center;
	}

	/* The reveal's resting frame, and the same values `renderCopyReveal(0)` writes inline the
	   moment the script runs. It stays whole here rather than half of it in the visual layer:
	   the offsets are placement, and what is not -- the opacities, the icons' scale -- has its
	   other value behind a class on the button above, the unlabelled variant or the copy state.
	   That is an ancestor, and an ancestor is what the visual layer cannot see without a marker
	   nobody owns yet. See spec/todo.md. */
	.code-copy-content {
		display: inline-flex;
		align-items: center;
		transform: translateX(1.25rem);
	}

	.code-copy-unlabelled .code-copy-content {
		transform: none;
	}

	.code-copy-mask {
		display: inline-flex;
		width: 1.25rem;
		flex-shrink: 0;
		overflow: hidden;
	}

	.code-copy-glyph {
		display: grid;
		width: 0.875rem;
		flex: 0 0 0.875rem;
		margin-left: 0.375rem;
		opacity: 0;
		transform: translateX(0.375rem);
	}

	.code-copy-unlabelled .code-copy-glyph {
		margin-left: 0;
		transform: scale(0.82);
	}

	.code-copy-unlabelled .code-copy-mask {
		width: 0.875rem;
	}

	.code-copy-icon {
		grid-area: 1 / 1;
		display: grid;
		place-items: center;
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

	.code-collapse {
		overflow: hidden;
	}

	.code-collapse[data-phase='collapsed'] {
		height: 0;
	}

	.code-collapse[data-phase='collapsing'],
	.code-collapse[data-phase='expanding'] {
		will-change: height;
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
