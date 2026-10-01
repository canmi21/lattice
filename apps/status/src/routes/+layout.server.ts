import { dev } from '$app/environment';
import { marksOf } from '@canmi/symlink';
import { pickUrls } from '@canmi/urls';
import { MARKS } from '../params/mark';
import type { LayoutServerLoad } from './$types';

/**
 * The year the footer signs with, from the server's clock at render and never the browser's
 * (spec/architecture/identity.md); and the marks, as the objects the alias layer resolves them to
 * at render (spec/architecture/delivery.md, "A page follows the name for the browser").
 */
export const load: LayoutServerLoad = async () => ({
	year: new Date().getUTCFullYear(),
	marks: await marksOf(pickUrls(dev).alias, 'status', MARKS),
});
