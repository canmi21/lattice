import type { ThemeRegistration } from 'shiki';
import oneDarkPro from 'shiki/themes/one-dark-pro.mjs';
import oneLight from 'shiki/themes/one-light.mjs';

/**
 * One Light wearing One Dark Pro's coverage, because Shiki bundles no such theme.
 *
 * One Dark Pro is the elaborated One Dark: it colors 250 scopes One Light leaves alone,
 * including the bare identifiers a closing JSX tag is made of. Pairing the two therefore made
 * the light half look bare beside the dark one. This keeps every rule One Dark Pro writes and
 * swaps only the color. See spec/styling/blocks.md, "The light syntax theme is One Light's
 * palette under One Dark Pro's rules".
 */

/** Both themes spell some colors with an alpha byte and some without. */
function normal(color: string): string {
	return color.toLowerCase().replace(/^(#[\da-f]{6})ff$/, '$1');
}

/**
 * One Dark Pro's palette against One Light's.
 *
 * Voted from the selectors both themes define: for each of One Dark Pro's colors, the One Light
 * color its shared scopes agree on. The last four have no shared scope and were settled against
 * what One Light does with the same scope family; none of them is reachable by the ten languages
 * this site loads, so they are here for completeness rather than for a reader.
 */
const COUNTERPART = new Map([
	['#abb2bf', '#383a42'], // the foreground itself
	['#e06c75', '#e45649'], // variables, parameters, and the names inside closing tags
	['#e5c07b', '#c18401'], // classes and types
	['#61afef', '#4078f2'], // functions
	['#98c379', '#50a14f'], // strings
	['#c678dd', '#a626a4'], // keywords
	['#56b6c2', '#0184bc'], // operators and escapes
	['#d19a66', '#986801'], // numbers and constants
	['#5c6370', '#a0a1a7'], // comments
	['#7f848e', '#a0a1a7'], // the second comment gray, which One Light does not split
	['#be5046', '#ca1243'], // embedded punctuation, which is One Light's own rule for that scope
	['#f44747', '#ca1243'], // error tokens, to One Light's deepest red
	['#ffffff', '#000000'], // maximum contrast on a loud ground, and contrast is what inverts
]);

/**
 * A rule's color, or a failure naming the one that is missing.
 *
 * Throwing is the point: a Shiki release that adds a color to One Dark Pro would otherwise pass
 * it through unchanged, and a dark color on the light theme is the kind of wrong that reaches a
 * reader before it reaches a test.
 */
function counterpart(color: string): string {
	const found = COUNTERPART.get(normal(color));
	if (!found) {
		throw new Error(`one-light-pro has no counterpart for ${color}; see one-light-pro.ts`);
	}
	return found;
}

/**
 * Only the foregrounds move. One Dark Pro writes no backgrounds at all, and the five rules
 * carrying `fontStyle` keep it: nothing on this site reads the style a dual render emits, which
 * spec/architecture/fonts.md records along with what would happen if something started.
 */
export const oneLightPro: ThemeRegistration = {
	name: 'one-light-pro',
	displayName: 'One Light Pro',
	type: 'light',
	// One Light's own, so the editor foreground and the surface behind the code stay its own.
	colors: oneLight.colors,
	// oxlint-disable-next-line no-map-spread -- the rules are One Dark Pro's own, never written to
	tokenColors: (oneDarkPro.tokenColors ?? []).map((rule) => ({
		...rule,
		settings: {
			...rule.settings,
			...(rule.settings?.foreground ? { foreground: counterpart(rule.settings.foreground) } : {}),
		},
	})),
};
