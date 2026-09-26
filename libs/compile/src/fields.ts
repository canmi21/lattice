/**
 * Reading the fields a block is written with -- a crop, a code fence's meta, a quadrant's axes, a
 * card's alignment -- into what the compiled block carries, and refusing what cannot be. Each
 * throws with the source file named rather than guessing. `compile.ts` calls these per block.
 */
import type { DirectiveAttrs } from './inline.ts';
import type { Resolved } from './assets.ts';
import type {
	Block,
	CardAlign,
	CargoView,
	QuadrantDirection,
	QuadrantItem,
	QuadrantPosition,
	TokeiView,
	ArticleMeta,
} from '@canmi/artifacts/types';
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive';
import type { Image as MdImage, RootContent } from 'mdast';

export const QUADRANT_DIRECTIONS = ['top', 'right', 'bottom', 'left'] as const;
export const QUADRANT_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/**
 * A block's source exactly as the article holds it, which is how a diagram is found.
 *
 * The offsets move between views -- everything before this block was translated to a different
 * length -- but the bytes do not, because a fence and a directive are neither of them translated.
 * So the same block yields the same string in all nine views, which is what lets one record serve
 * them all. A node without a position is a node this compiler constructed, and there is none here.
 */
export function blockSource(raw: string, node: RootContent): string {
	const { start, end } = node.position ?? {};
	if (start?.offset === undefined || end?.offset === undefined) return '';
	return raw.slice(start.offset, end.offset);
}

export function diagramMarkdown(
	title: string,
	description: string | undefined,
	url: string,
): string {
	return `> [diagram: ${description ?? title} — ${url}]`;
}

export function imageOf(node: RootContent): MdImage | null {
	if (node.type !== 'paragraph' || node.children.length !== 1) return null;
	const only = node.children[0];
	return only?.type === 'image' ? only : null;
}

/**
 * What an image is described as, preferring what the article said.
 *
 * The manifest's description belongs to the picture and is written once, so a directive that
 * says nothing still gets one -- including articles written before any description existed.
 * Writing `alt` overrides it for one page's context, and `alt=""` means decorative.
 *
 * Markdown images had a second rule here, because `![](x)` parses to an empty alt meaning only
 * "unwritten" and cannot express "decorative" at all. They all go through the directive now.
 */
export function altFor(written: string | null | undefined, resolved: Resolved | null): string {
	if (written != null) return written;
	return resolved?.description ?? '';
}

/** Widescreen, because the reason to crop at all is usually to make a row of images agree. */
export const DEFAULT_CROP = '16 / 9';

/** Everything `object-position` is allowed to be here. Centred unless told otherwise. */
export const ALIGNMENTS = ['center', 'top', 'bottom', 'left', 'right'] as const;

/**
 * `W:H` as a CSS `aspect-ratio`.
 *
 * Malformed input throws rather than falling back. A silent default would render a crop
 * nobody asked for, and a typo in a ratio is invisible in a way a missing image is not --
 * the page still looks deliberate.
 */
export function cropRatio(
	value: string | null | undefined,
	url: string,
	directive: string,
): string {
	if (value == null) return DEFAULT_CROP;
	const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value.trim());
	if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
		throw new Error(
			`::${directive} ratio must be W:H with positive numbers, got "${value}": ${url}`,
		);
	}
	return `${match[1]} / ${match[2]}`;
}

export function cropAlign(
	value: string | null | undefined,
	url: string,
	directive: string,
): string | undefined {
	if (value == null) return undefined;
	const wanted = value.trim().toLowerCase();
	if (!(ALIGNMENTS as readonly string[]).includes(wanted)) {
		throw new Error(
			`::${directive} align must be one of ${ALIGNMENTS.join(', ')}, got "${value}": ${url}`,
		);
	}
	return wanted === 'center' ? undefined : wanted;
}

/**
 * A reference nothing answered for, which fails the compile rather than becoming a URL.
 *
 * The fallback published the authored reference under the CDN's origin, which is a guaranteed
 * 404 in a feed and reads as a working link wherever it is inspected. `local check` reports a
 * missing asset and exits zero because a report may not be a gate; a compile is not a report.
 * See spec/architecture/data.md, "Missing assets are reported, never fatal".
 */
export function unresolved(reference: string, source: string): never {
	throw new Error(`${source}: "${reference}" names no published asset -- import it first`);
}

/**
 * The frontmatter keys `local i18n` translates.
 *
 * A copy. The authority is `TRANSLATABLE_FRONTMATTER` in apps/local/src/i18n/segment.rs; it is
 * repeated because a site-only CI build has no Rust toolchain to ask -- see
 * spec/architecture/data.md -- and held to the original by a test rather than by memory.
 *
 * What drift costs: a key Rust translates and this list omits gets translated with the
 * translator's note left in it, and the marker reaches the page as text.
 */
export const TRANSLATABLE_FRONTMATTER = ['title', 'subtitle', 'description'] as const;

export function codeMeta(value: string | null | undefined): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const match of value?.matchAll(/(\w+)(?:="([^"]*)")?/g) ?? []) {
		fields[match[1]!] = match[2] ?? 'true';
	}
	return fields;
}

export function codePresentation(
	value: string | null | undefined,
	source: string,
): { title?: string; collapsible?: boolean; default_expanded?: boolean } {
	const props = codeMeta(value);
	const title = props.title?.trim() || undefined;
	const rawCollapsible = props.collapsible;
	const rawDefault = props.default;

	if (rawCollapsible !== undefined && rawCollapsible !== 'true' && rawCollapsible !== 'false') {
		throw new Error(`${source}: code fence collapsible must be true or false`);
	}
	if (rawDefault !== undefined && rawDefault !== 'expanded' && rawDefault !== 'collapsed') {
		throw new Error(`${source}: code fence default must be expanded or collapsed`);
	}
	if (!title && (rawCollapsible !== undefined || rawDefault !== undefined)) {
		throw new Error(`${source}: a collapsible code fence needs a title`);
	}

	if (!title) return {};
	const collapsible = rawCollapsible !== 'false';
	const default_expanded = rawDefault !== 'collapsed';
	if (!collapsible && !default_expanded) {
		throw new Error(`${source}: a code fence cannot be fixed open and default collapsed`);
	}
	return { title, collapsible, default_expanded };
}

export function mermaidRatio(value: string | null | undefined, source: string): number | undefined {
	const raw = codeMeta(value).ratio;
	if (raw === undefined) return undefined;
	if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) {
		throw new Error(`${source}: Mermaid ratio must be a positive decimal`);
	}
	const ratio = Number(raw);
	if (!Number.isFinite(ratio) || ratio <= 0) {
		throw new Error(`${source}: Mermaid ratio must be a positive decimal`);
	}
	return ratio;
}

export function requiredDirectiveAttribute(
	attrs: DirectiveAttrs,
	name: string,
	directive: string,
	source: string,
): string {
	const value = attrs[name]?.trim();
	if (!value) throw new Error(`${source}: ${directive} requires a non-empty ${name} attribute`);
	return value;
}

export function quadrantBlock(
	node: ContainerDirective,
	source: string,
): Extract<Block, { type: 'quadrant' }> {
	const attrs = (node.attributes ?? {}) as DirectiveAttrs;
	const title = requiredDirectiveAttribute(attrs, 'title', 'quadrant', source);
	const description = attrs.description?.trim() || undefined;
	const axes = Object.fromEntries(
		QUADRANT_DIRECTIONS.map((direction) => [
			direction,
			requiredDirectiveAttribute(attrs, direction, 'quadrant', source),
		]),
	) as Record<QuadrantDirection, string>;
	const items: QuadrantItem[] = [];

	for (const child of node.children) {
		if (child.type !== 'leafDirective' || child.name !== 'quadrant-item') {
			throw new Error(`${source}: quadrant may contain only quadrant-item directives`);
		}
		const item = child as LeafDirective;
		const itemAttrs = (item.attributes ?? {}) as DirectiveAttrs;
		const at = requiredDirectiveAttribute(itemAttrs, 'at', 'quadrant-item', source);
		if (!QUADRANT_POSITIONS.includes(at as QuadrantPosition)) {
			throw new Error(
				`${source}: quadrant-item at must be one of ${QUADRANT_POSITIONS.join(', ')}`,
			);
		}
		const itemTitle = requiredDirectiveAttribute(itemAttrs, 'title', 'quadrant-item', source);
		const note = itemAttrs.note?.trim() || undefined;
		items.push({ at: at as QuadrantPosition, title: itemTitle, ...(note ? { note } : {}) });
	}
	return {
		type: 'quadrant',
		title,
		...(description ? { description } : {}),
		axes,
		items,
	};
}

export function quadrantRegion(
	item: QuadrantItem,
	axes: Record<QuadrantDirection, string>,
): string {
	const [vertical, horizontal] = item.at.split('-') as ['top' | 'bottom', 'left' | 'right'];
	return `${axes[vertical]} / ${axes[horizontal]}`;
}

export function cargoView(value: string | null | undefined): CargoView {
	return value === 'table' ? 'table' : 'treemap';
}

export function tokeiView(value: string | null | undefined): TokeiView {
	return value === 'bar' || value === 'table' ? value : 'treemap';
}

export function cardAlign(value: string | null | undefined): CardAlign {
	return value === 'left' || value === 'right' ? value : 'center';
}

export function assertFrontmatterHasNoTranslatorNotes(
	meta: Partial<ArticleMeta> | Record<string, string>,
	file: string,
): void {
	for (const key of TRANSLATABLE_FRONTMATTER) {
		const value = meta[key];
		if (typeof value === 'string' && value.includes(':tn')) {
			throw new Error(`${file}: translator's notes are not allowed in frontmatter ${key}`);
		}
	}
}
