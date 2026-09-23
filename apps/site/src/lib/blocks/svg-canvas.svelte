<script lang="ts">
	import '@canmi/svg-canvas/style.css';
	import Preview from '$lib/components/preview.svelte';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	let {
		svg,
		locale,
		description,
	}: {
		svg: string;
		locale: LocaleCode;
		/** What the drawing says, from `local diagram`. Absent until one has been run. */
		description?: string;
	} = $props();

	// Safe boundary: certain HTML start tags inside SVG foreign content (span, div, p, b,
	// comments...) make the browser's HTML parser close the outer <svg> and resume HTML parsing,
	// so embedded HTML-looking markup would truncate the diagram and spill into the page. This
	// translates such markup instead of dropping it -- escaping angle brackets so it renders as
	// the literal text the author typed -- since real SVG elements sit outside this breakout set
	// (per the HTML standard), and <foreignObject> is left intact as a valid HTML integration point.
	const BREAKOUT_TAG =
		/<\/?(?:b|big|blockquote|body|br|center|code|dd|div|dl|dt|em|embed|h[1-6]|head|hr|i|img|li|listing|menu|meta|nobr|ol|p|pre|ruby|s|small|span|strong|strike|sub|sup|table|tt|u|ul|font)\b[^>]*>/gi;
	const COMMENT = /<!--[\s\S]*?-->/g;
	const FOREIGN_OBJECT = /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi;

	// An inline handler in a diagram can only call a global; this app defines none, so it is a
	// ReferenceError waiting for a click -- `sendPrompt` did exactly that, nine nodes throwing in
	// one article until Sentry caught it. Dropped rather than escaped: a breakout tag is markup
	// meant to be SEEN, so it is translated; a handler is markup meant to RUN, so there is no
	// text worth preserving. Scoped to start tags only, so a diagram may print `onclick=` as
	// ordinary label prose.
	const START_TAG = /<[a-z][^>]*>/gi;
	const EVENT_HANDLER = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

	const escapeAngles = (part: string) => part.replace(/</g, '&lt;').replace(/>/g, '&gt;');

	function translate(part: string): string {
		return part.replace(COMMENT, escapeAngles).replace(BREAKOUT_TAG, escapeAngles);
	}

	const disarm = (raw: string) => raw.replace(START_TAG, (tag) => tag.replace(EVENT_HANDLER, ''));

	function contain(raw: string): string {
		// Before the split, so a handler is stripped inside <foreignObject> too -- that subtree is
		// left intact for the parser's sake, which is a reason to keep its markup, not its code.
		const source = disarm(raw);
		let out = '';
		let last = 0;
		for (const kept of source.matchAll(FOREIGN_OBJECT)) {
			out += translate(source.slice(last, kept.index)) + kept[0];
			last = kept.index + kept[0].length;
		}
		return out + translate(source.slice(last));
	}

	const safe = $derived(contain(svg));

	/**
	 * The size the author drew the diagram at, read off the root `viewBox`.
	 *
	 * Only its ratio is read, and only to decide which pair of window edges the enlarged diagram
	 * reaches. The size itself is the window's to choose.
	 *
	 * The root tag, not the first `viewBox` in the string -- every one of these diagrams also
	 * carries a `<marker>` with a `viewBox` of its own, and that one is 10 units square.
	 */
	const DRAWN =
		/<svg\b[^>]*?\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

	const drawn = $derived.by(() => {
		const found = DRAWN.exec(svg);
		if (!found) return undefined;
		const width = Number(found[1]);
		const height = Number(found[2]);
		return width > 0 && height > 0 ? { width, height } : undefined;
	});
</script>

<!-- The whole drawn area is the control, because there is nothing else in it to press: the
     handlers a diagram may have carried are stripped above, so a node's hover is decoration and
     the press belongs to the diagram as a whole. See spec/styling/blocks.md. -->
<Preview
	label={m['diagram.enlarge']({}, { locale })}
	title={m['diagram.title']({}, { locale })}
	closeLabel={m['diagram.close']({}, { locale })}
	width={drawn?.width}
	height={drawn?.height}
	{description}
>
	<!-- Authored SVG from the tracked corpus, wrapped by contain() above; not reader input.
	     Stated rather than suppressed; see spec/lint-format.md. -->
	{#snippet inline()}
		<div class="svg-canvas" role={description ? 'img' : undefined} aria-label={description}>
			{@html safe}
		</div>
	{/snippet}
	<!-- The same wrapped source, drawn a second time at size. Both copies carry the diagram's own
	     `<marker id="arrow">`, and a duplicate id resolves to the first in the document: every one
	     of these markers is the same arrowhead, which is what makes that harmless rather than
	     lucky. -->
	{#snippet enlarged()}
		<div class="svg-canvas" role={description ? 'img' : undefined} aria-label={description}>
			{@html safe}
		</div>
	{/snippet}
</Preview>
