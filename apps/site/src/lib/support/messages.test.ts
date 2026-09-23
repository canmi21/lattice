import { describe, expect, it } from 'vitest';
import de from '@canmi/messages/messages/de.json';
import en from '@canmi/messages/messages/en.json';
import es from '@canmi/messages/messages/es.json';
import fr from '@canmi/messages/messages/fr.json';
import ja from '@canmi/messages/messages/ja.json';
import ko from '@canmi/messages/messages/ko.json';
import mw from '@canmi/messages/messages/mw.json';
import tw from '@canmi/messages/messages/tw.json';
import zh from '@canmi/messages/messages/zh.json';

const locales = { de, en, es, fr, ja, ko, mw, tw, zh } as const;

describe('support action copy', () => {
	for (const [locale, messages] of Object.entries(locales)) {
		it(`${locale} keeps the resting copy inside every expanded label`, () => {
			expect(messages['support.like']).toContain('{count}');
			expect(messages['support.google']).toContain(messages['support.google-short']);
			expect(messages['support.sponsor']).toContain(messages['support.sponsor-short']);
			// The slot that asks for a Google preference asks for a star once it has been used,
			// and the reveal it animates is the same one: the short label has to be a substring
			// of the long for both of the favours it carries. See spec/styling/controls.md.
			expect(messages['support.github']).toContain(messages['support.github-short']);
		});
	}
});
