/**
 * A published article's blocks, as the HTML a feed reader gets.
 *
 * This is the whole of what separates the feed from the page: both are lowerings of the same
 * article, and a block carries strictly more than the feed says of it -- a heading's slug and
 * depth, a diagram's source and its description, a clip's poster and where it plays. So the feed
 * is a projection of `content/{hash}.json` and needs nothing the bucket does not already hold,
 * which is why it is assembled at request time rather than published as a tenth object.
 *
 * It lives beside the schemas rather than in the compiler because both sides need it: the
 * compiler to keep emitting the same bytes, and the Worker to build a document out of objects it
 * fetched. See spec/architecture/artifacts.md, "Which objects exist".
 */
import type { LocaleCode } from '@canmi/locales';
import { URLS } from '@canmi/urls';
import type { Block, QuadrantDirection, QuadrantItem } from './types.ts';

/** Where the two absolute links a feed writes are rooted. */
export type FeedBases = {
	/** The site's own origin, for an `::article` card pointing at another article here. */
	site: string;
	/**
	 * Where a bare resource id is resolved, already ending in a slash.
	 *
	 * A feed cannot pick a width and has nothing to resolve a rid with, so it names the id
	 * itself and lets the alias layer answer with the largest rendition that resource declares.
	 * That is what `ill.li/{rid}` is for from outside, and it is stable across a re-encode in a
	 * way a baked address never was. See spec/architecture/resource.md, "A bare id means
	 * whatever the resource says it means".
	 */
	resources: string;
	/** The article's own URL, named by everything a feed cannot show in place. */
	url: string;
	/**
	 * The view this document is, written into every link that stays on the site.
	 *
	 * Spelled out even for `mw`, where the bare address would do on a page. A bare URL negotiates
	 * from the reader's cookie, and nothing in a feed will correct that afterwards -- so a card
	 * showing a Japanese title has to name the Japanese view, and one in the source feed has to
	 * name the source. See spec/locale/views.md.
	 */
	locale: LocaleCode;
};

/** Exported because a feed body is not only blocks: see the site's translation notice. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * What a feed says about a drawing it cannot show.
 *
 * The title is the fence's own when it has one and the article's otherwise, which in this corpus
 * means the article's: no fence carries meta. So a described diagram says what it draws, and an
 * undescribed one says only that it is there, which is all it ever said.
 */
function diagram(title: string, description: string | undefined, url: string): string {
	return `<p><em>[Diagram: ${escapeHtml(description ?? title)} — view at ${url}]</em></p>`;
}

function region(item: QuadrantItem, axes: Record<QuadrantDirection, string>): string {
	const [vertical, horizontal] = item.at.split('-') as ['top' | 'bottom', 'left' | 'right'];
	return `${axes[vertical]} / ${axes[horizontal]}`;
}

/**
 * Name the view on every link that stays on this site.
 *
 * Prose is the page's own HTML, and a page links the bare address because its router carries the
 * view across. A feed has no router, so a bare link resolves against whatever the reader's cookie
 * holds. Left alone: an outside address, a bare fragment, and one that already names a language.
 * See spec/locale/views.md.
 */
function pinView(html: string, { site, locale }: FeedBases): string {
	return html.replaceAll(/href="([^"]*)"/g, (whole, href: string) => {
		const internal = href.startsWith(`${site}/`) || href === site || href.startsWith('/');
		if (!internal || /[?&]lang=/.test(href)) return whole;
		const hash = href.indexOf('#');
		const address = hash === -1 ? href : href.slice(0, hash);
		const fragment = hash === -1 ? '' : href.slice(hash);
		return `href="${address}${address.includes('?') ? '&' : '?'}lang=${locale}${fragment}"`;
	});
}

/**
 * One block as feed HTML, or nothing where the feed has nothing to say.
 *
 * A pending embed is the only `nothing`, and it is the reason a placeholder carries `pending` at
 * all: what it would say is that `cms embed` has not run, which is a fact about this repository
 * rather than about the article.
 */
export function blockFeedHtml(block: Block, bases: FeedBases): string | undefined {
	switch (block.type) {
		case 'prose':
			return pinView(block.html, bases);
		case 'heading': {
			const marks = (block.notes ?? []).map((number) => `<sup>${number}</sup>`).join('');
			return `<h${block.depth} id="${block.slug}">${escapeHtml(block.text)}${marks}</h${block.depth}>`;
		}
		case 'code':
			return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
		case 'mermaid':
			// A feed reader cannot run Mermaid, so a described diagram is read out and an
			// undescribed one is handed over as the fence it was written as.
			return block.description
				? diagram('diagram', block.description, bases.url)
				: `<pre><code class="language-mermaid">${escapeHtml(block.source)}</code></pre>`;
		case 'tokei':
			return `<pre>${escapeHtml(block.source)}</pre>`;
		case 'svgCanvas':
			return diagram(block.title, block.description, bases.url);
		case 'quadrant': {
			const entries = block.items.map((item) => {
				const note = item.note ? ` — ${escapeHtml(item.note)}` : '';
				return `<li><strong>${escapeHtml(item.title)}</strong>${note} <small>(${escapeHtml(region(item, block.axes))})</small></li>`;
			});
			const caption = block.description ? ` — ${escapeHtml(block.description)}` : '';
			return `<figure><figcaption><strong>${escapeHtml(block.title)}</strong>${caption}</figcaption><ul>${entries.join('')}</ul></figure>`;
		}
		case 'linkcard':
			return `<p><a href="${block.url}">${escapeHtml(block.title)}</a></p>`;
		case 'article':
			return `<p><a href="${bases.site}/${block.path}?lang=${bases.locale}">${escapeHtml(block.title)}</a> — ${escapeHtml(block.subtitle)}</p>`;
		case 'image':
			return `<p><img src="${bases.resources}${block.resources.picture}" alt="${escapeHtml(block.alt)}" /></p>`;
		case 'video': {
			// Neither a still nor a sentence is the clip, so the feed gets both: the poster it can
			// show, and where the thing itself plays.
			const poster = block.poster
				? `<img src="${block.poster}" alt="${escapeHtml(block.description ?? '')}" /> `
				: '';
			return `<p>${poster}<em>[Video — watch at ${bases.url}]</em></p>`;
		}
		case 'cargo':
			return `<p><em>[crate: ${escapeHtml(block.crate.name)} ${escapeHtml(block.crate.version)}]</em></p>`;
		case 'github':
			return `<p><em>[repository: ${escapeHtml(block.repo.full_name)}]</em></p>`;
		case 'twitter': {
			const { tweet } = block;
			const href = `${URLS.external.social.twitter}/${tweet.author}/status/${tweet.id}`;
			return (
				`<blockquote><p>${escapeHtml(tweet.text).replaceAll('\n', '<br />')}</p>` +
				`<footer><a href="${href}">@${escapeHtml(tweet.author)} on Twitter</a></footer>` +
				'</blockquote>'
			);
		}
		case 'footnotes':
			// Only what the note says. The phrase is already beside its marker in the body, and a
			// definition repeating the word it hangs off would read it twice.
			return `<ol>${block.notes
				.map(
					({ number, phrase, text }) =>
						`<li id="note-${number}"><strong>${escapeHtml(phrase)}</strong> ${escapeHtml(text)}</li>`,
				)
				.join('')}</ol>`;
		case 'placeholder':
			// A stub the author wrote is shown as written; an embed nothing has fetched is not,
			// because what it would show is this repository's state and not the article's.
			return block.pending
				? undefined
				: `<pre>::${escapeHtml(block.kind)}${Object.entries(block.meta)
						.map(([key, value]) => `\n${key} = "${escapeHtml(value)}"`)
						.join('')}</pre>`;
	}
}

/** The whole body, one block to a line, in the order the article was written. */
export function feedHtml(blocks: readonly Block[], bases: FeedBases): string {
	const lines: string[] = [];
	for (const block of blocks) {
		const html = blockFeedHtml(block, bases);
		if (html !== undefined) lines.push(html);
	}
	return lines.join('\n');
}
