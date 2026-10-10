/**
 * A reader's choice the server draws the first response with -- the overview's span, the map's
 * view -- kept in a cookie of its own and nowhere else, as the kit's theme is. See
 * spec/console/state.md, "Kept, and where".
 */

/** A year, at every path, sent on a link followed from elsewhere; the theme cookie's attributes. */
const ATTRIBUTES = ';path=/;max-age=31536000;SameSite=Lax';

/** What the cookie `name` holds where it is one of `allowed`, else `fallback`. */
export function preferred<T extends string>(
	cookies: { get(name: string): string | undefined },
	name: string,
	allowed: readonly T[],
	fallback: T,
): T {
	const held = cookies.get(name);
	return allowed.find((one) => one === held) ?? fallback;
}

/** Keeps `value` as the reader's `name`, from the browser; nothing on the server. */
export function prefer(name: string, value: string): void {
	if (typeof document === 'undefined') return;
	document.cookie = `${name}=${encodeURIComponent(value)}${ATTRIBUTES}`;
}
