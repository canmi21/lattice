/**
 * The pieces every schema in this library is built from: a content id, and a value kept once per
 * locale. A module of its own so `index.ts`, `resource.ts` and `picture.ts` can share them without
 * importing one another in a circle.
 */
import * as v from 'valibot';
import { LOCALE_CODES, type LocaleCode } from '@canmi/locales';

/** BLAKE3 truncated to 128 bits, as the bucket spells it. See spec/architecture/artifacts.md. */
export const HASH_PATTERN = /^[0-9a-f]{32}$/;

/** A content id as every schema here spells one. */
export const hash = v.pipe(v.string(), v.regex(HASH_PATTERN));

// Every locale is optional: a corpus mid-translation has views the root cannot name yet, and a
// required key would make that a parse failure rather than a fallback.
export function byLocale<T extends v.GenericSchema>(value: T) {
	const entries = LOCALE_CODES.map((code: LocaleCode) => [code, value] as const);
	return v.partial(v.object(Object.fromEntries(entries) as Record<LocaleCode, T>));
}
