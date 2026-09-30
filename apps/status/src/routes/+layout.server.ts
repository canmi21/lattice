import type { LayoutServerLoad } from './$types';

/**
 * The year the footer signs with, from the server's clock at render and never the browser's.
 * See spec/architecture/identity.md.
 */
export const load: LayoutServerLoad = () => ({ year: new Date().getUTCFullYear() });
