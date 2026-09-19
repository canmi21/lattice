/**
 * Addressing the card `cms og` rendered for a page.
 *
 * One card per page per language, published as a content-addressed object like everything else.
 * Which one a page shows comes from that page's own answer, because there is no address to derive
 * from a slug any more. See spec/architecture/media.md.
 */

/**
 * The size every consumer crops to, and what the renderer draws.
 *
 * Strings because their only use is a meta attribute. Carried as numbers they would be
 * stringified at each of them, which is the same value written two ways.
 */
export const CARD_WIDTH = '1200';
export const CARD_HEIGHT = '630';

/** The home page's card. Its route is `/`, which is not a slug anything can be filed under. */
export const HOME_SLUG = 'homepage';

/**
 * The card an answer names, as an address on the CDN.
 *
 * Content-addressed like everything else the corpus publishes, so this takes the id the article's
 * own answer carries rather than deriving an address from a slug. That is what lets it keep a year
 * instead of a week: an edited title draws a new card, which is a new object at a new address, and
 * the old one stops being named rather than being overwritten. See spec/architecture/media.md.
 */
export function cardUrl(cdn: string, card: string | undefined): string | undefined {
	return card ? `${cdn}/object/${card}.png` : undefined;
}
