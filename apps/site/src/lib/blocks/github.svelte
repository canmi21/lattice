<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { family, radius, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the repository card. Every colour is the token variable `libs/tokens`
	 * already declares. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot holds geometry, plus the corner glyph's reveal: gated on the
	 * card's hover but reaching a descendant the visual layer cannot see without a marker nobody
	 * owns yet (spec/todo.md). See spec/architecture/css/authoring.md, "A comment in the module
	 * script cannot write a tag in angle brackets".
	 */
	const styles = stylex.create({
		/** The card itself, which is the link. Its box stays in the block below. */
		card: {
			borderRadius: radius.xl,
			color: 'inherit',
			textDecoration: 'none',
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
			fontSize: '0.78125rem',
			lineHeight: 1.45,
		},
		meta: {
			color: 'var(--color-text-soft)',
			fontSize: '0.71875rem',
		},
		/** The language's dot. Its fill is the language's colour and arrives inline. */
		languageDot: {
			borderRadius: '50%',
		},
		corner: {
			color: 'var(--color-text-soft)',
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
	import type { CardAlign, RepoRecord } from '$lib/content/types';
	import { langColor } from './tokei/tokei';
	import { compactCount, shortDate } from '$lib/format';

	let {
		repo,
		gitRef,
		title,
		align = 'center',
	}: {
		repo: RepoRecord;
		gitRef?: string;
		title?: string;
		align?: CardAlign;
	} = $props();

	const href = $derived(
		gitRef
			? `${URLS.external.github.web}/${repo.full_name}/tree/${gitRef}`
			: `${URLS.external.github.web}/${repo.full_name}`,
	);
	const displayName = $derived(title || repo.full_name.split('/').at(-1) || repo.full_name);
	const pushed = $derived(repo.pushed_at ? shortDate(repo.pushed_at) : undefined);

	function repositoryName(value: string): string {
		const name = value.split('/').at(-1) ?? value;
		return name
			.toLowerCase()
			.replace(/[-_]+/g, ' ')
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}
</script>

<a
	{href}
	target="_blank"
	rel="noopener"
	class:card-center={align === 'center'}
	class:card-right={align === 'right'}
	class="repo-card group focus-ring {stylex.attrs(surfaces.interactive, styles.card).class}"
>
	<div class="header">
		<span class="name {stylex.attrs(styles.name).class}"
			>{title || repositoryName(displayName)}</span
		>
		<span class="fullname {stylex.attrs(styles.fullname).class}">{repo.full_name}</span>
	</div>

	{#if gitRef}
		<span class="ref {stylex.attrs(styles.ref).class}">
			<GitCommitHorizontal class="size-3" strokeWidth={2} aria-hidden="true" />
			{gitRef.slice(0, 7)}
		</span>
	{/if}

	{#if repo.description}
		<p class="description {stylex.attrs(styles.description).class}">{repo.description}</p>
	{/if}

	<div class="meta {stylex.attrs(styles.meta).class}">
		{#if repo.language}
			<span class="meta-item">
				<span
					class="language-dot {stylex.attrs(styles.languageDot).class}"
					style="background-color: {langColor(repo.language)}"
					aria-hidden="true"
				></span>
				{repo.language}
			</span>
		{/if}
		<span class="meta-item">
			<Star class="size-3.5" strokeWidth={2} aria-hidden="true" />
			<span class="tabular-nums">{compactCount(repo.stars)}</span>
			<span class="sr-only">stars</span>
		</span>
		<span class="meta-item">
			<GitFork class="size-3.5" strokeWidth={2} aria-hidden="true" />
			<span class="tabular-nums">{compactCount(repo.forks)}</span>
			<span class="sr-only">forks</span>
		</span>
		{#if repo.license && repo.license !== 'NOASSERTION'}
			<span class="meta-item">
				<Scale class="size-3.5" strokeWidth={2} aria-hidden="true" />
				{repo.license}
			</span>
		{/if}
		<span class="meta-item">
			<CircleDot class="size-3.5" strokeWidth={2} aria-hidden="true" />
			<span class="tabular-nums">{compactCount(repo.open_issues)}</span>
			<span class="sr-only">open issues</span>
		</span>
		{#if pushed}
			<span class="meta-item">
				<Clock class="size-3.5" strokeWidth={2} aria-hidden="true" />
				{pushed}
			</span>
		{/if}
	</div>

	<span class="corner {stylex.attrs(styles.corner).class}" aria-hidden="true">
		<ArrowUpRight class="size-4" strokeWidth={2} />
	</span>
</a>

<style>
	.repo-card {
		position: relative;
		display: flex;
		width: 100%;
		max-width: 28rem;
		height: 6.5rem;
		margin-block: 1.8em;
		flex-direction: column;
		gap: 0.35rem;
		overflow: hidden;
		padding: 0.6rem 0.75rem;
	}

	.card-center {
		margin-inline: auto;
	}

	.card-right {
		margin-inline-start: auto;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.fullname {
		margin-inline-start: 0.4rem;
	}

	.ref {
		position: absolute;
		top: 0.5rem;
		right: 0.6rem;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}

	.description {
		display: -webkit-box;
		flex: 1;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		margin: 0;
	}

	.meta {
		display: flex;
		margin-top: auto;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	/* `white-space` is the width being reserved rather than how the text looks: an icon and the
	   number beside it are one item and stay on one line. Layout, for the reason the newsletter's
	   ghost label is. See spec/architecture/css/layers.md. */
	.meta-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		white-space: nowrap;
	}

	.language-dot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		flex-shrink: 0;
	}

	/* The corner glyph's reveal stays whole here rather than half of it in the visual layer: the
	   offsets are placement, and the opacity it rests at has its other value behind the card's
	   own hover, one level up. That is an ancestor, and an ancestor is what the visual layer
	   cannot see without a marker nobody owns yet. The transition between the two goes with them.
	   See spec/todo.md. */
	.corner {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		opacity: 0;
		transition: opacity 200ms ease-out;
	}

	.repo-card:hover .corner,
	.repo-card:focus-visible .corner {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.corner {
			transition: none;
		}
	}
</style>
