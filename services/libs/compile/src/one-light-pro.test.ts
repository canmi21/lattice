import { expect, it } from 'vitest';
import oneDarkPro from 'shiki/themes/one-dark-pro.mjs';
import oneLight from 'shiki/themes/one-light.mjs';
import { oneLightPro } from './one-light-pro.ts';

const normal = (colour: string) => colour.toLowerCase().replace(/^(#[\da-f]{6})ff$/, '$1');

function foregrounds(theme: { tokenColors?: { settings?: { foreground?: string } }[] }): string[] {
	return (theme.tokenColors ?? [])
		.map((rule) => rule.settings?.foreground)
		.filter((colour): colour is string => Boolean(colour))
		.map(normal);
}

it('keeps every rule One Dark Pro writes, which is the whole point of deriving it', () => {
	// Coverage is the reason this theme exists: One Light leaves 250 of these scopes alone, and
	// a light half that colours fewer tokens than the dark one is what was being fixed.
	expect(oneLightPro.tokenColors).toHaveLength(oneDarkPro.tokenColors?.length ?? 0);
	expect(oneLightPro.type).toBe('light');
});

it('spends only One Light colours, so nothing from the dark palette reaches a light page', () => {
	const allowed = new Set(foregrounds(oneLight));
	const leaked = [...new Set(foregrounds(oneLightPro))].filter((colour) => !allowed.has(colour));

	// The four colours no shared scope covered are decided against One Light's own rules for the
	// same scope family, so each is a colour One Light already spends somewhere.
	expect(leaked).toEqual([]);
});

it('carries a style only where One Dark Pro does', () => {
	const styled = (rules: { settings?: { fontStyle?: string } }[]) =>
		rules.filter((rule) => rule.settings?.fontStyle).map((rule) => rule.settings?.fontStyle);

	// Nothing on this site reads the style a dual render emits -- see spec/architecture/fonts.md,
	// "Only the regular cut of the monospace face is reachable, and the rest stay". Carried rather
	// than dropped, so the derivation stays a recolouring and nothing else.
	expect(styled(oneLightPro.tokenColors ?? [])).toEqual(styled(oneDarkPro.tokenColors ?? []));
});
