/**
 * Fetching what the reader is about to ask for, a moment before they ask.
 *
 * Everything here is a guess, so everything here is silent: a warm that fails changes nothing,
 * because the real request is still to come and it is the one whose answer is drawn. What it buys
 * is that after hydration a navigation inside this site is the router's, so opening an article is
 * two fetches the browser could have started while the pointer was still travelling.
 *
 * What is warmed depends on what the device can tell us. A pointer that hovers names one article
 * at a time and is worth following precisely; a touch screen names nothing until it is too late,
 * so the homepage warms the list it is showing and no images. See spec/engagement.md.
 */
import { browser } from '$app/environment';
import { warmReads } from '$lib/engagement/reads.svelte';
import type { LocaleCode } from '$lib/locale';
import { publishedView } from '$lib/published';

const HOVERS = '(hover: hover) and (pointer: fine)';

/**
 * Whether this device has a pointer that can rest on something.
 *
 * Answered on first ask rather than set by an effect, and that is the whole of why it is written
 * this way. Two components want it, and whichever effect ran second used to see the other's
 * default: the homepage read `false` before the layout had asked the platform, and warmed its
 * whole list on a desktop -- the one device that branch exists to spare.
 */
let hoverable = $state<boolean | undefined>(undefined);

export function pointerCanHover(): boolean {
	if (!browser) return false;
	hoverable ??= window.matchMedia(HOVERS).matches;
	return hoverable;
}

/**
 * Keep it current, because a tablet gains and loses a trackpad without reloading the page.
 *
 * Call once, from the layout. Returns the teardown an effect wants.
 */
export function followPointerKind(): () => void {
	const query = window.matchMedia(HOVERS);
	hoverable = query.matches;
	const follow = (event: MediaQueryListEvent) => {
		hoverable = event.matches;
	};
	query.addEventListener('change', follow);
	return () => query.removeEventListener('change', follow);
}

/** One warm per article per view, so a pointer crossing a row twice costs one request. */
const started = new Set<string>();

/**
 * The first picture in an article, and only the first.
 *
 * A reader opening an article sees one image before they scroll, and the rest are a download they
 * have not asked for. `srcset` is left to the browser: handing it the whole set lets it pick the
 * width it would have picked anyway, so the warm and the render agree instead of racing.
 */
function warmFirstImage(blocks: readonly { type: string; [key: string]: unknown }[]): void {
	const first = blocks.find((block) => block.type === 'image');
	if (!first || typeof first.src !== 'string') return;
	const picture = new Image();
	if (typeof first.srcset === 'string') picture.srcset = first.srcset;
	picture.src = first.src;
}

/**
 * Warm one article in one view.
 *
 * `withImage` is the pointer's half: a device that hovers has named this article and nothing else,
 * so its first picture is worth the bytes. A touch device warming its whole list is not making
 * that claim about any one of them.
 */
export async function warmArticle(
	slug: string,
	locale: LocaleCode,
	{ withImage = false } = {},
): Promise<void> {
	if (!browser) return;
	const key = `${locale}:${slug}`;
	if (started.has(key)) return;
	started.add(key);

	void warmReads(slug);
	try {
		const found = await publishedView(fetch, slug, locale);
		if (found && withImage) warmFirstImage(found.view.body.blocks);
	} catch {
		// The navigation will ask again, and it is the one the reader is waiting on.
	}
}

/**
 * Which article a link points at, as the identity everything downstream asks with.
 *
 * A document has an extension and an article does not -- the same test `hooks.server.ts` makes.
 * The last segment is the slug, and a name with no hyphen is one of this site's own routes. See
 * spec/locale/addressing.md and spec/architecture/artifacts.md.
 */
function articleAt(anchor: HTMLAnchorElement): string | undefined {
	if (anchor.target === '_blank' || anchor.hasAttribute('download')) return undefined;
	const here = new URL(anchor.href, window.location.href);
	if (here.origin !== window.location.origin) return undefined;
	const path = here.pathname.replace(/^\/+|\/+$/g, '');
	if (path === '' || path.includes('.') || path.startsWith('licenses')) return undefined;
	if (path === window.location.pathname.replace(/^\/+|\/+$/g, '')) return undefined;
	const slug = path.split('/').at(-1) ?? '';
	return slug.includes('-') ? slug : undefined;
}

/**
 * Follow the pointer across the whole document and warm whatever it rests on.
 *
 * One delegated listener rather than an attachment per link, because the links that matter are not
 * all components: a card is one, and so is every `<a>` inside an article's prose. Delegation
 * reaches both without the prose having to be parsed for them.
 *
 * Call once, from the layout. Returns the teardown an effect wants.
 */
export function warmWhatThePointerRests(locale: () => LocaleCode): () => void {
	const enter = (event: PointerEvent) => {
		if (!pointerCanHover()) return;
		const anchor = (event.target as Element | null)?.closest?.('a');
		if (!(anchor instanceof HTMLAnchorElement)) return;
		const slug = articleAt(anchor);
		if (slug) void warmArticle(slug, locale(), { withImage: true });
	};
	document.addEventListener('pointerover', enter, { passive: true });
	return () => document.removeEventListener('pointerover', enter);
}

/**
 * What a device with no pointer warms instead: every article the page is listing, in this view.
 *
 * No images. A list of ten first pictures is megabytes spent on a guess about which row a thumb
 * will reach, and a phone is the device least able to afford being wrong.
 */
export function warmListed(slugs: readonly string[], locale: LocaleCode): void {
	if (!browser || pointerCanHover()) return;
	for (const slug of slugs) void warmArticle(slug, locale);
}
