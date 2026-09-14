<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { duration, easing, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a link card. Every colour the token layer names is read as that name.
	 * Two colours here are not the token layer's -- the title and the arrow are black or white
	 * against the cover, and `libs/tokens` declares neither -- so they stay in the markup; the
	 * reason is in spec/todo.md. See spec/architecture/css.md.
	 *
	 * So does the brightness the cover takes under a pointer, which is a `group-hover:` and
	 * cannot be split from the `group` on the anchor above it, and the arrow's blend mode, which
	 * is carried only when no tone is given: `stylex.attrs()` omits `class` altogether when every
	 * style handed to it is switched off, and merging that into an attribute writes the word
	 * `undefined`. Both are in spec/todo.md.
	 *
	 * The scoped block at the foot of this file holds the other half of the focus treatment. It
	 * recolours the cover's own border, and `Picture` renders that image, so there is no element
	 * of ours to put a class on.
	 */
	const styles = stylex.create({
		/**
		 * The focus ring, drawn in nothing so the cover's border can be the ring instead. The
		 * recolour that actually draws it is the rule at the foot of this file.
		 */
		link: {
			outlineWidth: { default: null, ':focus-visible': '0.125rem' },
			outlineStyle: { default: null, ':focus-visible': 'solid' },
			outlineColor: { default: null, ':focus-visible': 'transparent' },
		},
		/**
		 * The cover's fade. Unqualified `transition` is twenty-three properties in Tailwind 4.3 --
		 * the three `--tw-gradient-*` variables and the four discrete ones included -- and only
		 * `filter` is ever animated here. Nothing sets the rest and they interpolate nothing, but
		 * the measure of sameness is the computed value and dropping them changes it. Whether the
		 * visual layer should be naming another framework's private variables is in spec/todo.md.
		 */
		media: {
			transitionProperty:
				'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events',
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		/** The title over the cover. */
		title: {
			fontWeight: weight.medium,
		},
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { pageUrls } from '@canmi/urls';
	import Picture, { type Source } from '$lib/components/picture.svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import * as m from '$lib/paraglide/messages';
	import type { LocaleCode } from '$lib/locale';

	/**
	 * What this card is, plus everything its cover is -- which it takes as `Source` rather than
	 * listing again, and forwards untouched.
	 *
	 * `::linkcard{favicon=...}` is not here and never was reachable. That attribute is an
	 * instruction to `cms favicon`, which resolves it into the domain's own slot under
	 * `data/public/favicon`; the compiler drops it, so no block ever carried it and no prop could
	 * receive it. By the time a page renders the answer is already at `/favicon/{domain}`, and
	 * reading the attribute again would send the browser to somebody else's origin for a copy
	 * this site holds.
	 */
	type Props = Source & {
		/** The view being rendered. Passed rather than read: see spec/locale.md. */
		locale: LocaleCode;
		url: string;
		title: string;
		tone?: 'light' | 'dark';
		/** What the cover shows, from the manifest. See the markup for where it goes. */
		description?: string;
	};
	let { locale, url, title, tone, description, ...cover }: Props = $props();

	const describedBy = $props.id();

	const cdnUrl = pageUrls(dev).cdn;
	const domain = $derived(new URL(url).hostname);
	const faviconSrc = $derived(`${cdnUrl}/favicon/${domain}${tone ? `?tone=${tone}` : ''}`);

	let imgEl = $state<HTMLImageElement | undefined>();
	let hoverTint = $state<'black' | 'white' | null>(null);

	function computeHoverTint(img: HTMLImageElement): 'black' | 'white' | null {
		const size = 32;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		try {
			ctx.drawImage(img, 0, 0, size, size);
			const { data } = ctx.getImageData(0, 0, size, size);
			const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
			for (let i = 0; i < data.length; i += 4) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				const a = data[i + 3];
				if (r === undefined || g === undefined || b === undefined || a === undefined) continue;
				if (a < 128) continue;
				const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
				const entry = buckets.get(key);
				if (entry) {
					entry.r += r;
					entry.g += g;
					entry.b += b;
					entry.count++;
				} else {
					buckets.set(key, { r, g, b, count: 1 });
				}
			}
			let max: { r: number; g: number; b: number; count: number } | null = null;
			for (const v of buckets.values()) {
				if (!max || v.count > max.count) max = v;
			}
			if (!max) return null;
			const r = max.r / max.count;
			const g = max.g / max.count;
			const b = max.b / max.count;
			const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			return luminance > 0.5 ? 'black' : 'white';
		} catch {
			return null;
		}
	}

	$effect(() => {
		const el = imgEl;
		if (!el) return;
		const handle = () => {
			hoverTint = computeHoverTint(el);
		};
		if (el.complete && el.naturalWidth > 0) {
			handle();
		} else {
			el.addEventListener('load', handle, { once: true });
			return () => el.removeEventListener('load', handle);
		}
	});
</script>

<!--
	The cover keeps `alt=""` deliberately, and this is the one decision here worth arguing.

	Everything inside an anchor becomes part of the link's accessible name. Putting an
	800-character description there would make the link announce as the whole screenshot before
	saying where it goes, and a reader tabbing through links would have to sit through it every
	time. A link's name should identify its destination and stop.

	So the description is offered as a *description* instead: `aria-describedby` points at the
	hidden text below, which a screen reader announces after the name and lets the reader skip.
	The content is available without being in the way.

	The name itself gains the domain and the new-tab warning. "Hexo: A fast, simple & powerful
	blog framework" never said it went to hexo.io -- the favicon carries that visually and is
	`aria-hidden`, so without this the destination was sighted-only.
-->
<a
	href={url}
	target="_blank"
	rel="noopener"
	aria-describedby={description ? describedBy : undefined}
	class="group relative isolate block {stylex.attrs(styles.link).class}"
>
	<div
		class="card-media {stylex.attrs(styles.media).class} {hoverTint === 'black'
			? 'group-hover:brightness-90'
			: hoverTint === 'white'
				? 'group-hover:brightness-110'
				: ''}"
	>
		<Picture {...cover} alt="" bind:el={imgEl} />
	</div>
	<div class="absolute right-12 bottom-3 left-3 flex items-center gap-2">
		<img src={faviconSrc} alt="" aria-hidden="true" loading="lazy" class="h-4 w-4 shrink-0" />
		<span
			class="truncate {stylex.attrs(surfaces.uiText, styles.title).class} {tone === 'dark'
				? 'text-black'
				: 'text-white'}"
		>
			{title}
		</span>
		<span class="sr-only">, {domain}, {m['support.new-tab']({}, { locale })}</span>
	</div>
	<ArrowUpRight
		aria-hidden="true"
		class="absolute right-3 bottom-3 h-4 w-4 {tone === 'dark' ? 'text-black' : 'text-white'} {tone
			? ''
			: 'mix-blend-difference'}"
	/>
</a>
{#if description}
	<!-- Outside the anchor on purpose: inside, it would join the name it is meant to follow. -->
	<span id={describedBy} class="sr-only">{description}</span>
{/if}

<style>
	/* The card image already carries a 0.125rem border, so the focus ring lands right on
	top of it: drop the box-shadow ring and recolor that border to the accent, so the
	0.125rem ring overlaps the border exactly with no gap.

	The ring's own half of that is a StyleX style at the head of this file, which is where a
	declaration on an element the component renders belongs. This half stays because `Picture`
	renders the image and nothing of ours is on it. See spec/architecture/css.md. */
	a:focus-visible .card-media :global(img) {
		border-color: var(--color-accent);
	}
</style>
