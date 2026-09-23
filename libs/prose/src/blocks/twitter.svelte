<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { figures, line, radius, text, weight } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of a tweet card. Every colour is the token variable `libs/tokens` already
	 * declares. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot keeps the corner arrow's other opacity and nothing else: it
	 * lives in `.tweet-card:hover .corner`, an ancestor selector this layer cannot write. The
	 * opacity the arrow rests at, and the motion between the two, are here. The card's geometry
	 * is in the markup.
	 */
	const styles = stylex.create({
		/**
		 * The card itself. `:hover` is bare, with no `(hover: hover)` around it, because a bare
		 * one is what the rule this replaced was written as; the two conditions carry the same
		 * value, so neither ranks above the other. Sameness first; see
		 * spec/architecture/css/migration.md.
		 */
		card: {
			borderRadius: radius.xl,
			color: 'inherit',
			// Two properties in the list, so the duration and the curve are stated twice: a
			// transition's other lists are read per property, and one value against two
			// properties is not the same computed style as two. The delay is stated for the
			// same reason -- the shorthand this replaced set it to `0s, 0s`, and the initial
			// value is a list of one.
			transitionProperty: {
				default: 'background-color, border-color',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '150ms, 150ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'ease-out, ease-out',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
			transitionDelay: { default: '0s, 0s', '@media (prefers-reduced-motion: reduce)': '0s' },
		},
		/** The handle and the date above the text. */
		header: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
		},
		author: {
			color: 'var(--color-text-strong)',
			fontSize: text.px13,
			fontWeight: weight.strong,
		},
		/** The tweet. */
		text: {
			color: 'var(--color-text)',
			fontSize: text.px14,
			lineHeight: line.base,
		},
		metrics: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
		},
		/** The three glyphs, which take the row's ink rather than naming one of their own. */
		actionIcon: {
			fill: 'currentColor',
		},
		count: {
			fontVariantNumeric: figures.tabular,
		},
		/**
		 * The corner arrow's ink and the opacity it rests at. Its other opacity is in the scoped
		 * block, for the reason above.
		 *
		 * One property in the list, so the delay and the behaviour are left out: their initial
		 * values are already the one-item lists the shorthand this replaced computed to. Reduced
		 * motion is that shorthand's `none` as longhands, which is more than the property alone.
		 */
		corner: {
			color: 'var(--color-text-soft)',
			opacity: 0,
			transitionProperty: {
				default: 'opacity',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '200ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'ease-out',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
	});
</script>

<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { URLS } from '@canmi/urls';
	import type { TweetRecord } from '@canmi/artifacts/types';
	import { compactCount, shortDate } from '@canmi/locales/format';
	import SocialIcon from '../icons.svelte';

	let { tweet }: { tweet: TweetRecord } = $props();

	const href = $derived(`${URLS.external.social.twitter}/${tweet.author}/status/${tweet.id}`);
	const date = $derived(shortDate(tweet.created));
</script>

<a
	{href}
	target="_blank"
	rel="noopener"
	class="tweet-card group focus-ring relative my-[1.8em] flex w-full max-w-[28rem] flex-col gap-[0.7rem] p-3 no-underline {stylex.attrs(
		surfaces.interactive,
		styles.card,
	).class}"
>
	<header class="flex items-center gap-[0.35rem] {stylex.attrs(styles.header).class}">
		<SocialIcon name="twitter" class="size-4" />
		<span class="author {stylex.attrs(styles.author).class}">@{tweet.author}</span>
		<span aria-hidden="true" class="mx-[0.05rem]">·</span>
		<time datetime={tweet.created}>{date}</time>
	</header>

	<!-- The line breaks are the author's, so they are kept rather than collapsed. -->
	<p class="m-0 whitespace-pre-wrap {stylex.attrs(styles.text).class}">{tweet.text}</p>

	<footer class="flex items-center gap-[0.9rem] {stylex.attrs(styles.metrics).class}">
		<span class="flex items-center gap-1">
			<svg
				class="size-3.5 flex-none {stylex.attrs(styles.actionIcon).class}"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01Zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756Z"
				/>
			</svg>
			<span class={stylex.attrs(styles.count).class}>{compactCount(tweet.replies)}</span>
			<span class="sr-only"> replies</span>
		</span>
		<span class="flex items-center gap-1">
			<svg
				class="size-3.5 flex-none {stylex.attrs(styles.actionIcon).class}"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					d="M4.5 3.88 8.932 8.02 7.568 9.48 5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88ZM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2Z"
				/>
			</svg>
			<span class={stylex.attrs(styles.count).class}>{compactCount(tweet.reposts)}</span>
			<span class="sr-only"> reposts</span>
		</span>
		<span class="flex items-center gap-1">
			<svg
				class="size-3.5 flex-none {stylex.attrs(styles.actionIcon).class}"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91Zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67Z"
				/>
			</svg>
			<span class={stylex.attrs(styles.count).class}>{compactCount(tweet.likes)}</span>
			<span class="sr-only"> likes</span>
		</span>
	</footer>

	<span class="corner absolute {stylex.attrs(styles.corner).class}" aria-hidden="true">
		<ArrowUpRight class="size-4" strokeWidth={2} />
	</span>
</a>

<style>
	/* Two offsets the enumeration cannot answer for: it derives the `inset` family as
	   `inset-right` and `inset-bottom`, which are not spellings CSS has, so the longhands it
	   plainly means to own fall through it. They stay here until the table can be asked. See
	   spec/architecture/css/layers.md. */
	.corner {
		right: 0.75rem;
		bottom: 0.75rem;
	}

	/* The arrow's other opacity, gated on the card's own hover and reaching a descendant: an
	   ancestor is what no class can express. `tweet-card` stays because this rule names it. */
	.tweet-card:hover .corner,
	.tweet-card:focus-visible .corner {
		opacity: 1;
	}
</style>
