/**
 * A CJK letter, as opposed to CJK punctuation.
 *
 * Script properties rather than a block range, which is what keeps `，`, `。` and `、` out: a
 * full-width comma already carries its own trailing space in the glyph, and putting another one
 * beside it opens a hole in the line.
 */
const CJK_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
const CJK_LETTER_START =
	/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LATIN = /^[A-Za-z0-9]/;
const LATIN_END = /[A-Za-z0-9]$/;

/**
 * Put a space where a Latin run meets a CJK letter, in text assembled at runtime.
 *
 * Authored copy already carries these; only text this site builds needs it, since nobody typed
 * one there. See spec/styling/prose.md, "Latin inside CJK is spaced with a real space", for why
 * this is a real space rather than `text-autospace`.
 */
export function spaceScriptBoundaries(parts: readonly string[]): string[] {
	return parts.map((part, index) => {
		if (index === 0) return part;
		const previous = parts[index - 1] ?? '';
		const meets =
			(CJK_LETTER.test(previous) && LATIN.test(part)) ||
			(LATIN_END.test(previous) && CJK_LETTER_START.test(part));
		return meets ? ` ${part}` : part;
	});
}

/**
 * Put a value into a sentence rendered with a placeholder, spacing both joins by the characters
 * that actually meet there.
 *
 * Which side needs a space depends on the value, not the locale or template -- a per-locale flag
 * would go stale the first time a message was rewritten. Rendering once with the placeholder is
 * how the two real neighbours are found.
 */
export function fillSlot(rendered: string, slot: string, value: string): string {
	const [before = '', after = ''] = rendered.split(slot);
	return spaceScriptBoundaries([before, value, after]).join('');
}
