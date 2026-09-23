<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { duration, easing, weight } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of a link card. Every colour the token layer names is read as that name.
	 * The title/arrow colour and the cover's hover brightness and blend mode are exceptions, not
	 * the token layer's or not expressible here -- see spec/todo/todo.md. See
	 * spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot holds the other half of the focus treatment: it recolours the
	 * cover's own border, which `Picture` renders, so there is no element of ours to put a class on.
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
		 * visual layer should be naming another framework's private variables is in spec/todo/todo.md.
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
	import { DEV as dev } from 'esm-env';
	import { pageUrls } from '@canmi/urls';
	import { ICON_EXTENSION, objectUrl, toned, type ParsedResource } from '@canmi/artifacts';
	import Picture, { type Source } from '../components/picture.svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import * as m from '@canmi/messages';
	import type { LocaleCode } from '@canmi/locales';

	/**
	 * What this card is, plus everything its cover is -- which it takes as `Source` rather than
	 * listing again, and forwards untouched.
	 *
	 * `::linkcard{favicon=...}` is not here and never was reachable: the compiler drops it, so no
	 * prop could receive it. See spec/architecture/data.md for where the collector sends it.
	 */
	type Props = Source & {
		/** The view being rendered. Passed rather than read: see spec/locale/addressing.md. */
		locale: LocaleCode;
		url: string;
		title: string;
		/**
		 * The site's mark as the corpus currently holds it, resolved by the page.
		 *
		 * The record and not an address: what the resource holds changes on somebody else's
		 * schedule, so it is looked up per render and never compiled into the article. Absent for
		 * a site nothing has collected a mark for, and the card then draws none.
		 */
		icon?: ParsedResource;
		tone?: 'light' | 'dark';
		/** What the cover shows, from the manifest. See the markup for where it goes. */
		description?: string;
	};
	let { locale, url, title, icon, tone, description, ...cover }: Props = $props();

	const describedBy = $props.id();

	// The CDN, because what the record names is a content id: the resolution that could not happen
	// at build time already happened, in the load, and what is left is an object address. A named
	// tone is that tone or nothing -- see `toned` in libs/artifacts for why nothing is the right
	// answer rather than the other file.
	const cdnUrl = pageUrls(dev).cdn;
	const domain = $derived(new URL(url).hostname);
	const mark = $derived(icon?.layers.icon ? toned(icon.layers.icon, tone) : undefined);
	const faviconExtension = $derived(mark && ICON_EXTENSION[mark.mime]);
	// Nothing rather than a guessed extension: `/object` forms a key from the name it is given and
	// corrects nothing, so a spelling this side invented is a 404 wearing an icon's clothes.
	const faviconSrc = $derived(
		mark && faviconExtension ? objectUrl(cdnUrl, mark.content, faviconExtension) : undefined,
	);

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
	The cover keeps `alt=""` deliberately, and the name below carries the domain and the new-tab
	warning instead. See spec/architecture/media.md, "A link's name says where it goes; everything
	else is a description".
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
		<!-- No element at all for a site nothing has collected a mark for: a broken image is a
		     worse answer than none, and the name beside it already says where the link goes. -->
		{#if faviconSrc}
			<img src={faviconSrc} alt="" aria-hidden="true" loading="lazy" class="h-4 w-4 shrink-0" />
		{/if}
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
	renders the image and nothing of ours is on it. See spec/architecture/css/authoring.md. */
	a:focus-visible .card-media :global(img) {
		border-color: var(--color-accent);
	}
</style>
