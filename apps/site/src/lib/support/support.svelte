<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { figures, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the support row. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * What is left in the block at the foot of this file is the reveal's geometry -- the masks, the
	 * grid the fallback stacks in, the widths the script animates -- and the states the pill's own
	 * `data-expanded` gates, which a layer reaching an element through a class on that element
	 * cannot see. See spec/todo/todo.md.
	 */
	const styles = stylex.create({
		/** One pill: the like, the favour and the sponsor all wear this. */
		action: {
			borderRadius: '624.9375rem',
			fontWeight: weight.medium,
			color: 'var(--color-text-strong)',
			// Three properties in the list, so every other list matches: a transition's lists are
			// read per property, and one value against three is not the same computed style as three.
			//
			// Reduced motion is the same suppression the row used to write as `transition: none` --
			// four longhands rather than one, since the shorthand also returns duration, curve and
			// delay to their initial values.
			transitionProperty: {
				default: 'background-color, border-color, color',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '200ms, 200ms, 200ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'ease, ease, ease',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
			transitionDelay: {
				default: '0s, 0s, 0s',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
		},
		/**
		 * The like pill's figures: tabular, so a changing count does not resize the pill and shift
		 * its neighbours. See spec/styling/prose.md, "A number's treatment follows the role it plays".
		 */
		likeFigures: {
			fontVariantNumeric: figures.tabular,
		},
		/** The short label, shown until the pill opens. */
		shortCopy: {
			opacity: 1,
			// Reduced motion is the same suppression the block used to write as `transition: none`,
			// which is four longhands rather than one: the shorthand also returns the duration, the
			// curve and the delay to their initial values.
			transitionProperty: {
				default: 'opacity',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '120ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: 'ease',
			transitionDelay: {
				default: '80ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
		},
		/**
		 * The full label, which is what the pill widens to show.
		 *
		 * Only its resting end is here. What it opens to is written against `data-expanded` on the
		 * pill above it, which is an ancestor, and the width it opens within is the block's.
		 *
		 * The third of its resting values is neither: `max-w-0` is in the markup, because a
		 * maximum width takes its value from no scale this repository keeps. Its other value is
		 * in that same ancestor rule, which outranks the frame, so the two still meet.
		 */
		longCopy: {
			opacity: 0,
			transitionProperty: {
				default: 'opacity',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '140ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: 'ease',
			transitionDelay: '0s',
		},
	});
</script>

<script lang="ts">
	import Coffee from '@lucide/svelte/icons/coffee';
	import Heart from '@lucide/svelte/icons/heart';
	import Star from '@lucide/svelte/icons/star';
	import { animate } from 'motion';
	import { reader, tab } from '$lib/client/state';
	import { remFromMeasuredPixels } from '$lib/client/units';
	import { page } from '$app/state';
	import {
		createLikedQuery,
		createLikeMutation,
		createStatsQuery,
	} from '$lib/engagement/engagement.svelte';
	import { PUBLIC_LANGUAGE, type LocaleCode } from '$lib/locale';
	import * as m from '@canmi/messages';
	import { intlLocale } from '$lib/format';

	/**
	 * Expanding answers to whether the pointer can hover, not to how wide the window is -- a tap
	 * synthesises `mouseenter`, and a width guard was open on the one device class, an iPad, it was
	 * meant to catch. Queried live rather than once, so a tablet given a trackpad finds the other
	 * answer. See spec/styling/controls.md, "The reveal answers to whether the pointer can hover, not
	 * to how wide the window is".
	 */
	const HOVERS = '(hover: hover)';

	const WIDTH_SPRING = { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.85 };
	type AnimationControl = { stop: () => void };
	type CopyGeometry = {
		shortWidth: number;
		longWidth: number;
		prefix?: { mask: HTMLElement; width: number };
		suffix?: { mask: HTMLElement; width: number };
	};

	let {
		locale,
		sourcePreferenceHref,
		repositoryHref,
		onsponsor,
	}: {
		locale: LocaleCode;
		sourcePreferenceHref: string;
		repositoryHref: string;
		/** Becomes an `<a>` once there is somewhere to send people; see libs/urls. */
		onsponsor?: () => void;
	} = $props();

	/**
	 * Which favour this row asks for, in the one slot that asks for one. Two stores decide it --
	 * see spec/styling/controls.md, "Compact action rails reveal detail on demand" -- and share this
	 * one key, `PREFERRED`, across the `reader` and `tab` records in `client/state.ts` so the two
	 * never drift. Both short forms are a six-letter brand name, so what moves is the label and
	 * not the row.
	 */
	const PREFERRED = 'support.preferred';
	let asksForStar = $state(false);

	$effect(() => {
		try {
			const thisTab = tab.recall(sessionStorage, PREFERRED, false);
			asksForStar = !thisTab && reader.recall(localStorage, PREFERRED, false);
		} catch {
			// Private browsing, or storage the reader has turned off. The default already stands.
		}
	});

	const favourLabel = $derived(
		asksForStar ? m['support.github']({}, { locale }) : m['support.google']({}, { locale }),
	);
	const favourShort = $derived(
		asksForStar
			? m['support.github-short']({}, { locale })
			: m['support.google-short']({}, { locale }),
	);

	/** Both stores, because each answers a different question about the same click. */
	function recordPreferred() {
		reader.remember(localStorage, PREFERRED, true);
		// The same name in the other record, because the two answer different questions about one
		// click: the reader has a preference, and this tab has already acted on it. It used to be
		// a loose `sessionStorage` key, which is the scatter `state.ts` exists to prevent.
		tab.remember(sessionStorage, PREFERRED, true);
	}

	/**
	 * The count comes from the page, the mark comes from the browser.
	 *
	 * Rendered on the server, so the number is in the HTML and the reader is not shown a zero that
	 * corrects itself. Whether they have already liked cannot be: it is keyed by their address, and
	 * a page cached for one reader would tell the next one they had clicked something. So the heart
	 * is unmarked until the browser has asked. See spec/engagement.md.
	 */
	const stats = createStatsQuery(() => page.data.stats);
	const mark = createLikedQuery();
	const like = createLikeMutation();
	const liked = $derived(mark.data?.liked ?? false);
	const actionAnimations = new WeakMap<HTMLElement, AnimationControl>();
	const actionChromeWidths = new WeakMap<HTMLElement, number>();

	const count = $derived(stats.data?.like_count ?? 0);
	const numberLocale = $derived(intlLocale(locale));
	const numberFormat = $derived(new Intl.NumberFormat(numberLocale));
	const formattedCount = $derived(numberFormat.format(count));

	function toggle() {
		if (!like.isPending) like.mutate(!liked);
	}

	function splitCopy(short: string, long: string) {
		const start = long.indexOf(short);
		if (start === -1) return undefined;
		return {
			prefix: long.slice(0, start),
			shared: short,
			suffix: long.slice(start + short.length),
		};
	}

	function measureCopy(action: HTMLElement): CopyGeometry | undefined {
		const shared = action.querySelector<HTMLElement>('.shared');
		if (shared) {
			const prefixMask = action.querySelector<HTMLElement>('.prefix-mask');
			const prefixText = prefixMask?.firstElementChild as HTMLElement | undefined;
			const suffixMask = action.querySelector<HTMLElement>('.suffix-mask');
			const suffixText = suffixMask?.firstElementChild as HTMLElement | undefined;
			const shortWidth = shared.scrollWidth;
			const prefixWidth = prefixText?.scrollWidth ?? 0;
			const suffixWidth = suffixText?.scrollWidth ?? 0;
			return {
				shortWidth,
				longWidth: prefixWidth + shortWidth + suffixWidth,
				prefix: prefixMask ? { mask: prefixMask, width: prefixWidth } : undefined,
				suffix: suffixMask ? { mask: suffixMask, width: suffixWidth } : undefined,
			};
		}

		const short = action.querySelector<HTMLElement>('.short');
		const long = action.querySelector<HTMLElement>('.long');
		if (!short || !long) return undefined;
		return { shortWidth: short.scrollWidth, longWidth: long.scrollWidth };
	}

	function revealCopy(width: number, chromeWidth: number, geometry: CopyGeometry) {
		const distance = geometry.longWidth - geometry.shortWidth;
		if (distance <= 0) return;
		const progress = Math.max(0, (width - chromeWidth - geometry.shortWidth) / distance);
		if (geometry.prefix) {
			geometry.prefix.mask.style.width = remFromMeasuredPixels(geometry.prefix.width * progress);
		}
		if (geometry.suffix) {
			geometry.suffix.mask.style.width = remFromMeasuredPixels(geometry.suffix.width * progress);
		}
	}

	function setExpanded(action: HTMLElement, expanded: boolean) {
		const geometry = measureCopy(action);
		if (!geometry) return;

		const currentWidth = action.getBoundingClientRect().width;
		let chromeWidth = actionChromeWidths.get(action);
		if (chromeWidth === undefined) {
			chromeWidth = currentWidth - geometry.shortWidth;
			actionChromeWidths.set(action, chromeWidth);
		}

		const targetWidth = chromeWidth + (expanded ? geometry.longWidth : geometry.shortWidth);
		actionAnimations.get(action)?.stop();
		actionAnimations.delete(action);
		action.style.width = remFromMeasuredPixels(currentWidth);
		action.dataset.expanded = String(expanded);

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			action.style.width = expanded ? remFromMeasuredPixels(targetWidth) : '';
			revealCopy(targetWidth, chromeWidth, geometry);
			return;
		}

		let control: AnimationControl;
		control = animate(currentWidth, targetWidth, {
			...WIDTH_SPRING,
			onUpdate: (width) => {
				action.style.width = remFromMeasuredPixels(width);
				revealCopy(width, chromeWidth, geometry);
			},
			onComplete: () => {
				if (actionAnimations.get(action) !== control) return;
				actionAnimations.delete(action);
				if (!expanded) action.style.width = '';
			},
		});
		actionAnimations.set(action, control);
	}

	function expand(event: MouseEvent) {
		// Only the pointer path is guarded. Keyboard focus arrives through `expandFromFocus`, and
		// `:focus-visible` is never what a tap produces, so it carries none of the risk above --
		// a tablet with a keyboard still gets the full label on Tab. Collapsing is never guarded
		// either: whatever opened a pill has to be able to put it back.
		if (!window.matchMedia(HOVERS).matches) return;
		setExpanded(event.currentTarget as HTMLElement, true);
	}

	function expandFromFocus(event: FocusEvent) {
		const action = event.currentTarget as HTMLElement;
		if (action.matches(':focus-visible')) setExpanded(action, true);
	}

	function collapse(event: MouseEvent | FocusEvent) {
		setExpanded(event.currentTarget as HTMLElement, false);
	}
</script>

{#snippet copy(short: string, long: string)}
	{@const parts = splitCopy(short, long)}
	{#if parts}
		<!-- Each of the three runs preserves its spaces, because the label was split at one: the
		     prefix ends on a space and the suffix opens on one, and a collapsed space is a run that
		     measures narrower than it draws. -->
		<span class="inline-flex flex-none items-center" aria-hidden="true">
			<span class="prefix-mask reveal-mask flex-none overflow-hidden"
				><span class="block w-max whitespace-pre">{parts.prefix}</span></span
			>
			<span class="shared block w-max whitespace-pre">{parts.shared}</span>
			<span class="suffix-mask reveal-mask flex-none overflow-hidden"
				><span class="block w-max whitespace-pre">{parts.suffix}</span></span
			>
		</span>
	{:else}
		<span class="inline-grid flex-none" aria-hidden="true">
			<span
				class="short col-start-1 row-start-1 justify-self-start whitespace-nowrap {stylex.attrs(
					styles.shortCopy,
				).class}">{short}</span
			>
			<span
				class="long col-start-1 row-start-1 max-w-0 justify-self-start overflow-hidden whitespace-nowrap {stylex.attrs(
					styles.longCopy,
				).class}">{long}</span
			>
		</span>
	{/if}
{/snippet}

<section aria-labelledby="support-heading" class="mt-16">
	<h2 id="support-heading" class={stylex.attrs(surfaces.heading).class}>
		{m['support.heading']({}, { locale })}
	</h2>

	<!-- Two of the three are buttons and the third is a link, so without the hand said on each the
	     row draws two arrows and one hand for three controls that do the same kind of thing. -->
	<div class="mt-3 flex flex-wrap items-center gap-1.5">
		<button
			type="button"
			aria-pressed={liked}
			aria-label={m['support.like']({ count: formattedCount }, { locale })}
			data-liked={liked}
			data-expanded="false"
			onclick={toggle}
			disabled={like.isPending}
			aria-busy={like.isPending}
			onmouseenter={expand}
			onmouseleave={collapse}
			onfocus={expandFromFocus}
			onblur={collapse}
			class="action like focus-ring inline-flex h-9 shrink-0 cursor-pointer items-center overflow-hidden px-3 {stylex.attrs(
				surfaces.interactive,
				styles.action,
				styles.likeFigures,
			).class}"
		>
			<Heart class="icon" fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
			{@render copy(formattedCount, m['support.like']({ count: formattedCount }, { locale }))}
		</button>

		<!-- One slot, two favours. The star is right for either: it is the mark Google's preference
		     list and GitHub's repositories both use, so the pill keeps its shape and only its
		     words change. -->
		<a
			href={asksForStar ? repositoryHref : sourcePreferenceHref}
			target="_blank"
			rel="noopener"
			aria-label={`${favourLabel} (${m['support.new-tab']({}, { locale })})`}
			data-expanded="false"
			onclick={() => {
				if (!asksForStar) recordPreferred();
			}}
			onmouseenter={expand}
			onmouseleave={collapse}
			onfocus={expandFromFocus}
			onblur={collapse}
			class="action focus-ring inline-flex h-9 shrink-0 cursor-pointer items-center overflow-hidden px-3 {stylex.attrs(
				surfaces.interactive,
				styles.action,
			).class}"
		>
			<Star class="icon" aria-hidden="true" />
			{@render copy(favourShort, favourLabel)}
		</a>

		<button
			type="button"
			onclick={() => onsponsor?.()}
			aria-label={m['support.sponsor']({}, { locale })}
			data-expanded="false"
			onmouseenter={expand}
			onmouseleave={collapse}
			onfocus={expandFromFocus}
			onblur={collapse}
			class="action focus-ring inline-flex h-9 shrink-0 cursor-pointer items-center overflow-hidden px-3 {stylex.attrs(
				surfaces.interactive,
				styles.action,
			).class}"
		>
			<Coffee class="icon" aria-hidden="true" />
			{@render copy(
				m['support.sponsor-short']({}, { locale }),
				m['support.sponsor']({}, { locale }),
			)}
		</button>
	</div>
</section>

<style>
	/* The glyph inside the pill, which the icon component renders and no class here reaches. The
	   pill's own geometry is in the markup, and `action` stays because the rules below reach into
	   it. See spec/architecture/css/layers.md. */
	.action :global(.icon) {
		width: 1rem;
		height: 1rem;
		margin-inline-end: 0.5rem;
		flex-shrink: 0;
	}

	/* The resting end of a width `revealCopy` writes inline as the pill opens, so the two mean
	   nothing apart and this stays where the script can be read against it. The mask's own box
	   went to the markup. See spec/architecture/css/migration.md, "The test applies to a
	   declaration, and stops applying to a member of a set". */
	.reveal-mask {
		width: 0;
	}

	:global(.action[data-expanded='true']) .short {
		opacity: 0;
		transition-delay: 0ms;
	}

	:global(.action[data-expanded='true']) .long {
		max-width: 14rem;
		opacity: 1;
		transition-delay: 80ms;
	}

	.like[data-liked='true']:is(:hover, :focus-visible) {
		border-color: transparent;
		background: var(--color-ink);
		color: var(--color-page);
	}
</style>
