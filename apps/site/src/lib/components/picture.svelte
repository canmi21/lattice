<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border } from '$lib/vocabulary.stylex.ts';

	/**
	 * Everything the build resolved about one image: which bytes, how large they are, and how this
	 * site frames them. Declared here because every caller forwards it verbatim and none reads it
	 * -- written out again per caller it drifts, as two already had for the same field. `alt` is
	 * not in it: what an image is called depends on where it is used, so a cover inside a link
	 * takes `alt=""` there instead. See the link card's own note.
	 */
	export type Source = {
		src: string;
		width?: number;
		height?: number;
		preview?: string;
		srcset?: string;
		/** A CSS aspect-ratio to crop to, e.g. `16 / 9`. Absent means show the whole image. */
		crop?: string;
		/** `object-position` within that crop. Absent means centred. */
		align?: string;
	};

	/**
	 * The frame a picture wears in the column, which the enlarged view does not. Radius, width,
	 * style and colour are the border family, and the family is the vocabulary's by property --
	 * see spec/architecture/css/layers.md, "What each layer owns, by name" -- so the utilities
	 * that drew this in the markup are here. 1rem is Tailwind's `--radius-2xl` and stays a
	 * literal: the radius ladder names five steps and this is not one of them.
	 */
	const styles = stylex.create({
		framed: {
			borderRadius: '1rem',
			borderWidth: border.doublePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
		},
	});
</script>

<script lang="ts">
	import Preview from '$lib/components/preview.svelte';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '@canmi/messages';

	let {
		src,
		alt = '',
		width,
		height,
		preview,
		srcset,
		crop,
		align,
		locale,
		enlarges = false,
		eager = false,
		el = $bindable(),
	}: Source & {
		alt?: string;
		/**
		 * Whether pressing it opens the enlarged view.
		 *
		 * Off by default, and the default is the one that matters: a cover inside a link card is
		 * already inside an anchor, and a button there would be both invalid markup and a second
		 * answer to a press that already has one. A picture in an article body has no other
		 * answer, so it takes this one. See spec/styling/blocks.md.
		 */
		enlarges?: boolean;
		/**
		 * Whether this picture is one the reader is waiting for.
		 *
		 * Set on the first few media in an article and on nothing else. See `article/body.svelte`
		 * for which, and why the count is of media rather than of images.
		 */
		eager?: boolean;
		/** Needed only to name the control, so only a picture that has one asks for it. */
		locale?: LocaleCode;
		el?: HTMLImageElement;
	} = $props();

	// The two CDN groups a srcset moves between: a stored object, and that object converted.
	const OBJECT = '/object/';
	const DERIVE = '/derive/';

	// Sized against the article column, which is what actually bounds these.
	const SIZES = '(max-width: 48rem) 100vw, 48rem';
	// And against the window, in the view whose whole point is that the column is not the bound.
	const FULL_SIZES = '100vw';

	/**
	 * The same pictures, asked for in a format a browser that cannot read AVIF can.
	 *
	 * `/object` hands back what is stored and nothing else, so a fallback cannot be a different
	 * extension on the same address: it names `/derive/{cid}.avif.{to}`, which states the source
	 * in full and asks for one conversion. Changing the extension alone used to work and now
	 * 404s, which is the trade for a lookup that never probes. See spec/architecture/delivery.md.
	 */
	function asFormat(set: string | undefined, extension: string): string | undefined {
		// Both halves or neither. Moving the prefix without adding the second extension names
		// `/derive/{cid}.png`, which states one extension where that route needs two and is a 400
		// -- and a flat-colour original is stored as PNG, so the miss is real rather than
		// hypothetical. A source that is not AVIF has nothing to convert from here anyway.
		if (!set?.includes('.avif ')) return undefined;
		// Only ever fetched by a browser without AVIF, and held at the edge under a name carrying
		// a hash, so the conversion is paid once per colo rather than once per reader.
		return set.replaceAll(OBJECT, DERIVE).replaceAll('.avif ', `.avif.${extension} `);
	}

	const webp = $derived(asFormat(srcset, 'webp'));
	const jpeg = $derived(asFormat(srcset, 'jpeg'));

	// Cropping is done here rather than by storing another object: a variant per ratio and
	// alignment would multiply the bucket, and would make a content id mean "this image as
	// shown here" rather than "this image". The cost is that the hidden part is still
	// downloaded, which is the cheaper of the two.
	const style = $derived(
		[
			preview && `background-image:url(${preview})`,
			preview && 'background-size:cover',
			preview && 'background-position:center',
			crop && `aspect-ratio:${crop}`,
			align && `object-position:${align}`,
		]
			.filter(Boolean)
			.join(';') || undefined,
	);

	// The `img` is what a browser understanding none of the sources falls back to, so it names
	// the widest-supported format rather than the best one. `src` is already an address by the
	// time it arrives -- resolved in the page's load for a picture, in the build for a card's
	// cover -- so there is nothing left here to join to an origin.
	const largestJpeg = $derived(jpeg?.split(', ').pop()?.split(' ')[0] ?? src);
</script>

<!-- `block`, because `picture` is inline in the browser's own stylesheet and a non-replaced
     inline box discards its vertical margins. The article column spaces its blocks with a
     `margin-block-end` on each of them, so an inline one silently kept the gap above it -- which
     belongs to the paragraph before -- and lost the gap below. See spec/styling/lengths.md. -->
{#snippet frame(sizes: string, framing: string | undefined, shaped: boolean)}
	<picture class="block">
		{#if srcset}
			<source type="image/avif" {srcset} {sizes} />
			<source type="image/webp" srcset={webp} {sizes} />
		{/if}
		<img
			bind:this={el}
			src={largestJpeg}
			srcset={jpeg}
			sizes={srcset ? sizes : undefined}
			{alt}
			{width}
			{height}
			loading={eager ? 'eager' : 'lazy'}
			fetchpriority={eager ? 'high' : undefined}
			decoding="async"
			crossorigin="anonymous"
			class="block w-full object-cover {stylex.attrs(shaped && styles.framed).class ?? ''}"
			style={framing}
		/>
	</picture>
{/snippet}

{#if enlarges && locale}
	<Preview
		label={m['image.enlarge']({}, { locale })}
		title={m['image.title']({}, { locale })}
		closeLabel={m['image.close']({}, { locale })}
		{width}
		{height}
		radius="1rem"
	>
		{#snippet inline()}
			{@render frame(SIZES, style, true)}
		{/snippet}
		<!-- Whole, unframed, and asking for a source sized to the window. The crop is how this site
		     shows the picture in a column of prose; the view that exists to get past the column has
		     no business keeping it, and a `sizes` that still named the column would enlarge a
		     source chosen for a sixth of the pixels. -->
		{#snippet enlarged()}
			{@render frame(FULL_SIZES, undefined, false)}
		{/snippet}
	</Preview>
{:else}
	{@render frame(SIZES, style, true)}
{/if}
