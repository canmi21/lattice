import { themeOf } from '@canmi/kit/theme';
import type { LayoutServerLoad } from './$types';

/** The reader's theme from their cookie, so the switch is drawn the way the page is painted. */
export const load: LayoutServerLoad = ({ cookies }) => ({ theme: themeOf(cookies) });
