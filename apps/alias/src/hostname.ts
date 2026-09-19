/**
 * Whether a path segment is a hostname this site would ever have collected an icon for.
 *
 * Checked because the segment becomes part of a lookup key: an unchecked one is a way to ask for
 * an arbitrary name. Moved here with the icons themselves -- the CDN no longer resolves anything.
 *
 * The same five rules in the same order as `is_fetchable` in apps/cms/src/favicon/host.rs, which
 * is the other end of one pipeline: `cms favicon` decides which hostnames are worth collecting an
 * icon for and this decides which it will look one up for. A disagreement is an object in the
 * bucket that is a 400 for ever, or a lookup that can never hit. Held by hostname.test.ts, which
 * reads that file.
 */
export function isValidHostname(value: string): boolean {
	if (value.length > 253 || value === 'localhost') return false;
	const labels = value.split('.');
	if (labels.length < 2) return false;
	// Four labels that together form an address, not a site. Each one has to be a byte for that:
	// three digits is not enough, because `999.999.999.999` is no address at all and rejecting it
	// would refuse a name that merely looks like one. `1.example.com` is fine.
	if (labels.length === 4 && labels.every((label) => /^\d{1,3}$/.test(label) && +label <= 255))
		return false;
	return labels.every(
		(label) =>
			label.length > 0 &&
			label.length <= 63 &&
			!label.startsWith('-') &&
			!label.endsWith('-') &&
			/^[a-z0-9-]+$/.test(label),
	);
}
