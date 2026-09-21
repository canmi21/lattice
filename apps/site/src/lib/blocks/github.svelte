<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { family, figures, line, radius, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the repository card. Every colour is the token variable `libs/tokens`
	 * already declares. See spec/architecture/css/authoring.md.
	 *
	 * The corner glyph's other opacity is in the block at the foot, gated on the card's hover and
	 * reaching a descendant this layer cannot see without a marker nobody owns yet (spec/todo.md).
	 * The opacity it rests at, and the motion between the two, are here. This comment may not
	 * write a tag in angle brackets; see the same file.
	 */
	const styles = stylex.create({
		/** The card itself, which is the link. Its box stays in the block below. */
		card: {
			borderRadius: radius.xl,
			color: 'inherit',
			// Reduced motion is the same suppression the card used to write as `transition: none`,
			// which is more than one longhand: the shorthand also returns the duration and the
			// curve to their initial values. Two properties in the list, so each of the other
			// lists is stated twice -- a transition's lists are read per property, and one value
			// against two properties is not the same computed style as two.
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
		},
		name: {
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.strong,
		},
		fullname: {
			color: 'var(--color-text-soft)',
			fontSize: text.px11,
		},
		/**
		 * The commit the card is pinned to. Its stack is the literal one the rule carried rather
		 * than `--font-mono`: a migration moves a declaration between layers and never changes
		 * how its value is arrived at.
		 */
		ref: {
			color: 'var(--color-text-soft)',
			fontFamily: family.monoSpelled,
			fontSize: text.px11,
		},
		description: {
			color: 'var(--color-text-soft)',
			fontSize: text.px13,
			lineHeight: line.base,
		},
		meta: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
		},
		/** The language's dot. Its fill is the language's colour and arrives inline. */
		languageDot: {
			borderRadius: '50%',
		},
		/**
		 * The three counts, in figures that do not shift width as they change.
		 *
		 * It was `tabular-nums` in the markup, which spec/architecture/css/layers.md names as a
		 * ramp member left in the frame; this is the migration it said the move belonged to. The
		 * utility composed the value out of five private Tailwind variables and this states it;
		 * the one it set, `--tw-numeric-spacing`, is registered `inherits: false`, so nothing
		 * below could have been reading it.
		 */
		figure: {
			fontVariantNumeric: figures.tabular,
		},
		/**
		 * The corner glyph's ink and the opacity it rests at. The other opacity is the scoped
		 * block's, because it is gated on an ancestor's hover.
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
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import Clock from '@lucide/svelte/icons/clock';
	import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
	import GitFork from '@lucide/svelte/icons/git-fork';
	import Scale from '@lucide/svelte/icons/scale';
	import Star from '@lucide/svelte/icons/star';
	import { URLS } from '@canmi/urls';
	import type { CardAlign, RepoRecord } from '@canmi/artifacts/types';
	import { langColor } from './tokei/tokei';
	import { compactCount, shortDate } from '$lib/format';

	let {
		repo,
		git_ref,
		title,
		align = 'center',
	}: {
		repo: RepoRecord;
		git_ref?: string;
		title?: string;
		align?: CardAlign;
	} = $props();

	const href = $derived(
		git_ref
			? `${URLS.external.github.web}/${repo.full_name}/tree/${git_ref}`
			: `${URLS.external.github.web}/${repo.full_name}`,
	);
	const displayName = $derived(title || repo.full_name.split('/').at(-1) || repo.full_name);
	const pushed = $derived(repo.pushed_at ? shortDate(repo.pushed_at) : undefined);

	/**
	 * Where the card sits in the column, as one utility rather than two conditional classes.
	 *
	 * A ternary rather than a pair of classes on one property, whose order inside one layer is not
	 * the author's to choose. See spec/architecture/css/migration.md.
	 */
	const alignment = $derived(align === 'center' ? 'mx-auto' : align === 'right' ? 'ms-auto' : '');

	function repositoryName(value: string): string {
		const name = value.split('/').at(-1) ?? value;
		return name
			.toLowerCase()
			.replace(/[-_]+/g, ' ')
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}
</script>

<!-- `repo-card` carries no rule of its own any more and is not dead: the corner glyph's reveal at
     the foot is gated on this element's hover, and a descendant selected through its parent is the
     one thing no class can express. -->
<a
	{href}
	target="_blank"
	rel="noopener"
	class="repo-card group focus-ring relative my-[1.8em] flex h-26 w-full max-w-[28rem] flex-col gap-[0.35rem] overflow-hidden px-3 py-[0.6rem] no-underline {alignment} {stylex.attrs(
		surfaces.interactive,
		styles.card,
	).class}"
>
	<div class="flex items-center gap-2">
		<span class={stylex.attrs(styles.name).class}>{title || repositoryName(displayName)}</span>
		<span class="ms-[0.4rem] {stylex.attrs(styles.fullname).class}">{repo.full_name}</span>
	</div>

	{#if git_ref}
		<span
			class="absolute top-2 right-[0.6rem] inline-flex items-center gap-[0.2rem] {stylex.attrs(
				styles.ref,
			).class}"
		>
			<GitCommitHorizontal class="size-3" strokeWidth={2} aria-hidden="true" />
			{git_ref.slice(0, 7)}
		</span>
	{/if}

	{#if repo.description}
		<!-- The standard `line-clamp` is written beside the utility because the utility does not
		     write it: `line-clamp-2` emits `-webkit-line-clamp` alone. Measured in Chrome the two
		     agree -- the standard property computes to nothing there -- so this is carried across
		     for the engines compat.md floors at rather than for a value that differs today. -->
		<p class="m-0 line-clamp-2 flex-1 [line-clamp:2] {stylex.attrs(styles.description).class}">
			{repo.description}
		</p>
	{/if}

	<div class="mt-auto flex flex-wrap items-center gap-[0.6rem] {stylex.attrs(styles.meta).class}">
		{#if repo.language}
			<span class="inline-flex items-center gap-1 whitespace-nowrap">
				<span
					class="inline-block size-[0.6rem] shrink-0 {stylex.attrs(styles.languageDot).class}"
					style="background-color: {langColor(repo.language)}"
					aria-hidden="true"
				></span>
				{repo.language}
			</span>
		{/if}
		<span class="inline-flex items-center gap-1 whitespace-nowrap">
			<Star class="size-3.5" strokeWidth={2} aria-hidden="true" />
			<span class={stylex.attrs(styles.figure).class}>{compactCount(repo.stars)}</span>
			<span class="sr-only">stars</span>
		</span>
		<span class="inline-flex items-center gap-1 whitespace-nowrap">
			<GitFork class="size-3.5" strokeWidth={2} aria-hidden="true" />
			<span class={stylex.attrs(styles.figure).class}>{compactCount(repo.forks)}</span>
			<span class="sr-only">forks</span>
		</span>
		{#if repo.license && repo.license !== 'NOASSERTION'}
			<span class="inline-flex items-center gap-1 whitespace-nowrap">
				<Scale class="size-3.5" strokeWidth={2} aria-hidden="true" />
				{repo.license}
			</span>
		{/if}
		<span class="inline-flex items-center gap-1 whitespace-nowrap">
			<CircleDot class="size-3.5" strokeWidth={2} aria-hidden="true" />
			<span class={stylex.attrs(styles.figure).class}>{compactCount(repo.open_issues)}</span>
			<span class="sr-only">open issues</span>
		</span>
		{#if pushed}
			<span class="inline-flex items-center gap-1 whitespace-nowrap">
				<Clock class="size-3.5" strokeWidth={2} aria-hidden="true" />
				{pushed}
			</span>
		{/if}
	</div>

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

	/* The glyph's other opacity, gated on the card's own hover one level up. That is an ancestor,
	   and an ancestor is what the visual layer cannot see without a marker nobody owns yet. See
	   spec/todo.md. */
	.repo-card:hover .corner,
	.repo-card:focus-visible .corner {
		opacity: 1;
	}
</style>
