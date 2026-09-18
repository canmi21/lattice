/**
 * Whether a path segment is a hostname this site would ever have collected an icon for.
 *
 * Checked because the segment becomes part of a lookup key: an unchecked one is a way to ask for
 * an arbitrary name. Moved here with the icons themselves -- the CDN no longer resolves anything.
 */
export function isValidHostname(value: string): boolean {
	if (value.length > 253 || value === 'localhost') return false;
	const labels = value.split('.');
	if (labels.length < 2) return false;
	// Four all-numeric labels is an address, not a site. `1.example.com` is fine.
	if (labels.length === 4 && labels.every((label) => /^\d{1,3}$/.test(label))) return false;
	return labels.every(
		(label) =>
			label.length > 0 &&
			label.length <= 63 &&
			!label.startsWith('-') &&
			!label.endsWith('-') &&
			/^[a-z0-9-]+$/.test(label),
	);
}
