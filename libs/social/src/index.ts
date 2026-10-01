import { author } from '@canmi/identity';
import { URLS } from '@canmi/urls';

/** Every entry, in the order the site shows them. See spec/architecture/identity.md. */
export const SOCIAL = [
	'github',
	'twitter',
	'fediverse',
	'bluesky',
	'telegram',
	'sitemap',
	'travellings',
	'moe',
	'rss',
] as const;

export type SocialName = (typeof SOCIAL)[number];

/** The author's own accounts, which is what status shows. */
export const ACCOUNTS = SOCIAL.slice(0, 5) as readonly SocialName[];

export type IconName =
	| 'github'
	| 'twitter'
	| 'nyaone'
	| 'bluesky'
	| 'telegram'
	| 'sitemap'
	| 'travellings'
	| 'moe'
	| 'rss';

export interface SocialEntry {
	label: string;
	icon: IconName;
	/** The icon's box. Icons are center-anchored, so a wide, flat glyph gets a larger one. */
	size: string;
	/** Undefined where only the app knows the address, or where the author has no account. */
	href: string | undefined;
	/** Asked for from the app, which must pass it; see `SocialLinks`' `hrefs`. */
	fromApp?: true;
	/**
	 * A server-only resource, kept out of the client page router.
	 * See spec/locale/addressing.md#server-only-documents-leave-the-page-router.
	 */
	document?: true;
}

/** Every size is in `em` of the row's scale, so a caller resizes the whole row with one value. */
const BASE = 'size-[1em]';
const { github, social, webring } = URLS.external;

export const CATALOG: Readonly<Record<SocialName, SocialEntry>> = {
	github: { label: 'GitHub', icon: 'github', size: BASE, href: `${github.web}/${author.github}` },
	twitter: {
		label: 'Twitter',
		icon: 'twitter',
		size: BASE,
		href: author.twitter ? `${social.twitterIntent}?screen_name=${author.twitter}` : undefined,
	},
	fediverse: {
		label: 'Nya.one',
		icon: 'nyaone',
		size: BASE,
		href: `${social.fediverse}/@${author.fediverse}`,
	},
	bluesky: {
		label: 'Bluesky',
		icon: 'bluesky',
		size: BASE,
		href: `${social.bluesky}/${author.bluesky}`,
	},
	telegram: {
		label: 'Telegram',
		icon: 'telegram',
		size: 'size-[1.25em]',
		href: `${social.telegram}/${author.telegramGroup}`,
	},
	sitemap: {
		label: 'Sitemap',
		icon: 'sitemap',
		size: BASE,
		href: undefined,
		fromApp: true,
		document: true,
	},
	travellings: { label: 'Travellings', icon: 'travellings', size: BASE, href: webring.travellings },
	moe: { label: 'Travellings Moe', icon: 'moe', size: BASE, href: webring.moe },
	rss: {
		label: 'RSS feed',
		icon: 'rss',
		size: BASE,
		href: undefined,
		fromApp: true,
		document: true,
	},
};

export interface SocialLink {
	name: SocialName;
	label: string;
	icon: IconName;
	size: string;
	href: string;
	document: boolean;
}

/**
 * The links for `names`, in the order given. An entry the author has no account for is left out;
 * one only the app can address and was not given throws, since a row missing a feed is silent.
 */
export function socialLinks(
	names: readonly SocialName[],
	hrefs: Partial<Record<SocialName, string>> = {},
): SocialLink[] {
	return names.flatMap((name) => {
		const entry = CATALOG[name];
		const href = hrefs[name] ?? entry.href;
		if (href === undefined) {
			if (entry.fromApp) throw new Error(`@canmi/social: ${name} needs an href from the app`);
			return [];
		}
		const { label, icon, size } = entry;
		return [{ name, label, icon, size, href, document: entry.document === true }];
	});
}
