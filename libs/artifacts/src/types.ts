import type { LocaleCode } from '@canmi/locales';

/** Which of the three things a text track is. WebVTT's own vocabulary, not ours. */
export type CaptionKind = 'captions' | 'subtitles' | 'descriptions';

export type VideoRung = { src: string; type: string; width: number; height: number };

/** One published text track, described by what the record says it is rather than by a label. */
export type VideoTrack = { src: string; kind: CaptionKind; language: string };

export type ArticleMeta = {
	title: string;
	subtitle: string;
	description: string;
	/** The source view's public BCP-47 language tag. */
	lang: string;
	created: string;
	lastmod: string;
	/**
	 * Written but not published. Absent means published, so an article says nothing to stay
	 * ordinary and one word to be held back.
	 *
	 * A production build drops these before compiling them, so a draft has no page, no sitemap
	 * entry, no feed item and no search record. Every other build keeps them, which is what makes
	 * a draft previewable. See spec/drafts.md.
	 */
	draft?: boolean;
};

// One markdown source compiles to several targets; only the custom blocks below
// need bespoke per-target output. `block` drives page rendering, `feed` is
// self-contained HTML for RSS, `markdown` is LLM-friendly (/llms.txt), `text` is
// plain text where advanced expressions collapse to empty.
export type Block =
	| { type: 'prose'; html: string }
	| {
			type: 'heading';
			depth: number;
			slug: string;
			text: string;
			/** Note numbers written into this heading. Absent from `text`, and so from the ToC. */
			notes?: number[];
	  }
	| {
			type: 'code';
			lang: string;
			label?: string;
			title?: string;
			collapsible?: boolean;
			default_expanded?: boolean;
			html: string;
			code: string;
	  }
	| { type: 'mermaid'; source: string; ratio?: number; description?: string }
	| {
			type: 'quadrant';
			title: string;
			description?: string;
			/**
			 * What the figure reads as, from `cms diagram`. Absent until one has been run.
			 *
			 * Not `description`, which is one line the author wrote to sit under the title. This
			 * is the whole figure said in prose, and it is translated, which is what the
			 * assembled-from-labels fallback never was.
			 */
			reading?: string;
			axes: Record<QuadrantDirection, string>;
			items: QuadrantItem[];
	  }
	| {
			type: 'svgCanvas';
			svg: string;
			title: string;
			/** What the drawing says, from `cms diagram`. Absent until one has been run. */
			description?: string;
	  }
	| { type: 'tokei'; source: string; title: string; view: TokeiView }
	| { type: 'cargo'; crate: CrateRecord; view: CargoView }
	| { type: 'twitter'; tweet: TweetRecord }
	| {
			type: 'github';
			repo: RepoRecord;
			git_ref?: string;
			title?: string;
			align: CardAlign;
	  }
	| {
			type: 'linkcard';
			src: string;
			url: string;
			title: string;
			/**
			 * The site's mark, by rid, and never an address.
			 *
			 * An icon belongs to somebody else's site and is redrawn on their schedule, so what
			 * this resource currently holds is a fact about the corpus at the moment somebody
			 * asks -- not something a compiled article may carry. The whole key is absent for a
			 * site nothing has collected a mark for, and the role is spelled out so a page reads
			 * one name on every block: see `namedResources`, and spec/architecture/resource.md.
			 */
			resources?: { icon: string };
			/** Which of that resource's files to draw. Selected at render time, not here. */
			tone?: 'light' | 'dark';
			width?: number;
			height?: number;
			preview?: string;
			srcset?: string;
			/** The cover's crop, defaulted like `::image`'s. See the `image` variant below. */
			crop?: string;
			/** `object-position` for that crop. Absent means centred. */
			align?: string;
			/** What the cover shows. Offered as the link's description, never as its name. */
			description?: string;
	  }
	| ({ type: 'article'; path: string } & ArticleReference)
	| { type: 'footnotes'; notes: ArticleNote[] }
	| {
			type: 'placeholder';
			kind: string;
			meta: Record<string, string>;
			/**
			 * An embed named but not yet fetched, as opposed to a stub the author wrote.
			 *
			 * The two had one shape and meant different things, which a consumer could not tell
			 * apart: `::cargo` whose record `cms embed` has not filled in still says which crate
			 * the article meant, while `::placeholder` is the author asking for a gap. The feed is
			 * where it showed -- one of them belongs in a document a reader subscribes to and the
			 * other does not.
			 */
			pending?: true;
	  }
	| {
			type: 'image';
			/**
			 * The picture, by rid, and nothing derived from what it currently holds.
			 *
			 * Its ladder, its placeholder and its intrinsic box all move when the picture is
			 * encoded again, on nobody's schedule but the corpus's, so they are resolved per
			 * render and this names what they are resolved from. What is left is what the
			 * article itself decided. See spec/architecture/resource.md, "A rid is resolved
			 * three times".
			 */
			resources: { picture: string };
			/**
			 * What the picture is called here, which is the article's to say.
			 *
			 * Baked, unlike the ladder above, because it changes on **this** repository's
			 * schedule: `cms alt` writes it into a file beside the article, per locale, and a
			 * view carries the one it is written in rather than nine it is not.
			 */
			alt: string;
			/**
			 * A ratio to crop the displayed image to, as `16 / 9` ready for CSS.
			 *
			 * Cropping is presentation, so it is done by the browser with `object-fit` rather
			 * than by producing another object. A stored variant per ratio and alignment would
			 * multiply the bucket and, worse, make a content id mean "this image as shown here"
			 * instead of "this image".
			 */
			crop?: string;
			/** `object-position` for that crop. Absent means centred. */
			align?: string;
	  }
	| {
			type: 'video';
			/**
			 * The reference the article wrote, extension and all.
			 *
			 * Kept beside the resolved fields for the reason an image keeps it: an article can name
			 * a clip nothing has imported yet, and that should cost a fallback rather than a build.
			 */
			src: string;
			/** Every published rung, smallest first. Absent for a reference nothing resolved. */
			rungs?: VideoRung[];
			/** The original's dimensions, which reserve the box before anything is fetched. */
			width?: number;
			height?: number;
			/** The poster image asset's own rendition, which is what `<video poster>` names. */
			poster?: string;
			/**
			 * What every sample of this clip is multiplied by, so two clips play at one level.
			 *
			 * Computed in the build from the loudness and true peak apps/cms measured. `1` for a
			 * clip nothing has measured, which plays as it always did. See `assets.ts`.
			 */
			gain?: number;
			/** The poster's placeholder, painted under it while it arrives. */
			preview?: string;
			captions?: VideoTrack[];
			/** What the clip shows. Offered as a description, never as the element's name. */
			description?: string;
			/** Where the clip came from, which is what the unsupported-format notice links to. */
			source?: { url: string; label?: string };
	  };

/**
 * What an `::article` card shows of the article it points at, in the view's own locale.
 *
 * The card reads these off the target rather than off the directive, so retitling an article
 * retitles every card naming it and each translated view names it in its own language.
 */
export type ArticleReference = {
	title: string;
	subtitle: string;
	created: string;
	/** What a phone card shows instead, where the row clips. Falls back to the full form for a
	 *  view the CMS has not written one for. See spec/i18n/prose.md. */
	short_title: string;
	short_subtitle: string;
};

/**
 * One `:fn` note: the words it explains, the number it was given, and what it says.
 *
 * The phrase is carried so the collected note can name what it is about instead of asking a
 * reader to hold the sentence they left in their head while they read it.
 *
 * Two notes with the same words are two notes. There is no label to say otherwise, and a reader
 * who meets the same explanation twice was told it twice on purpose.
 */
export type ArticleNote = { number: number; phrase: string; text: string };

export type TocEntry = { slug: string; text: string; depth: number };

export type CardAlign = 'left' | 'center' | 'right';
export type CargoView = 'treemap' | 'table';
export type TokeiView = 'treemap' | 'bar' | 'table';
export type QuadrantDirection = 'top' | 'right' | 'bottom' | 'left';
export type QuadrantPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type QuadrantItem = { at: QuadrantPosition; title: string; note?: string };

export type Compiled = {
	meta: ArticleMeta;
	toc: TocEntry[];
	blocks: Block[];
	markdown: string;
	text: string;
};

export type ArticleView = Pick<Compiled, 'meta' | 'toc' | 'blocks' | 'text'> & {
	code: LocaleCode;
	/**
	 * How long the article is in this view, in words.
	 *
	 * Body prose and what is inside it. Not `text`, which is every readable string on the page --
	 * a picture's description, a linkcard's title, a diagram's caption, an embedded post -- and
	 * which this used to be measured from, in characters, making a 9,102-character article read
	 * as 14,870. Those are components; a reader asking how long an article is does not mean them.
	 */
	words: number;
	language_tag: string;
	canonical: string;
	/** False when this locale is showing the complete source article as a safe fallback. */
	translation_available: boolean;
	/** The title and subtitle a phone card shows instead of `meta`'s, where the row clips. Falls
	 *  back to the full form for a view the CMS has not written one for. See spec/i18n/prose.md. */
	short: { title: string; subtitle: string };
	/**
	 * The title the article page shows on a phone: `meta.title` where it fits the column, and
	 * `short.title` where it does not. Decided here rather than in the browser -- the answer is a
	 * property of the string, so it cannot change between renders, and computing it at runtime
	 * would mean the first frame guessing. See spec/styling/phone.md.
	 */
	phone_title: string;
	/**
	 * What the article is about, withholding what it concludes. Written by `cms summary` into a
	 * sidecar rather than into the article, so it is absent until that has been run.
	 */
	summary?: ArticleSummary;
};

export type ArticleSummary = {
	text: string;
	provider: string;
};

export type CrateDep = {
	name: string;
	version: string;
	kind: string;
	optional: boolean;
	target: string | null;
	features: string[];
	size: number | null;
	depth: number;
};

export type CrateRecord = {
	name: string;
	version: string;
	rust_version: string | null;
	features: Record<string, string[]>;
	deps: CrateDep[];
	total_dep_size: number;
};

export type RepoRecord = {
	full_name: string;
	description: string | null;
	language: string | null;
	stars: number;
	forks: number;
	open_issues: number;
	license: string | null;
	pushed_at: string | null;
};

export type TweetRecord = {
	id: string;
	author: string;
	text: string;
	created: string;
	likes: number;
	reposts: number;
	replies: number;
};

export type Alternate = {
	code: Exclude<LocaleCode, 'mw'> | 'x-default';
	language_tag: string;
	href: string;
};

export type Article = Compiled & {
	/** The identity: the last segment of the path, unique across the corpus. See build/slugs.ts. */
	slug: string;
	/** The address: the directory it currently sits in, plus that identity. */
	path: string;
	url: string;
	views: Record<LocaleCode, ArticleView>;
	canonical_urls: string[];
	alternates: Alternate[];
};

// A page paragraph is split at `:link` boundaries so styled text stays dead HTML
// while each link renders live (with its `<Icon>`), keeping the {@html} zone small.
export type InlineSegment =
	| { type: 'html'; html: string }
	| {
			type: 'link';
			icon?: 'twitter' | 'github' | 'email';
			href: string;
			label: string;
			new_tab: boolean;
			/** `wide` / `narrow` from the directive, as the classes that act on them. A link is the
			 *  one run that cannot be wrapped in `:t` -- nested, it stops being a link -- so it
			 *  carries its own width the way a `:t` run carries one. See spec/styling/phone.md. */
			width?: string;
	  };

export type PageBlock = { type: 'p'; segments: InlineSegment[] } | { type: 'html'; html: string };

// A standalone, non-article page (e.g. the homepage). `meta` carries frontmatter;
// `blocks` are rendered by the route; `body` is the DLC-lowered prose.
export type CompiledPage = {
	meta: Record<string, string>;
	blocks: PageBlock[];
	body: string;
};

export type PageView = Pick<CompiledPage, 'meta' | 'blocks'>;

// The source remains the public /<slug>.md document. Browser-facing HTML chooses
// one of the compiled views using the same request locale as an article.
export type Page = {
	path: string;
	markdown: string;
	views: Record<LocaleCode, PageView>;
};
