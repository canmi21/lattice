/**
 * What the compiler's tests share. See compile.test.ts, inline.test.ts and fields.test.ts.
 */
import { feedHtml } from '@canmi/artifacts';
import type { Compiled } from '@canmi/artifacts/types';
import { URLS } from '@canmi/urls';

/**
 * What a feed makes of this article, which the compiler no longer produces beside it.
 *
 * The feed is a projection of the blocks and is rendered where the view's locale is known, so
 * these assertions call the same function the Worker does rather than reading a second field the
 * compiler kept in step by hand. See libs/artifacts, `feedHtml`.
 */
export function feedOf(compiled: Pick<Compiled, 'blocks'>): string {
	return feedHtml(compiled.blocks, {
		site: URLS.apps.production.site,
		resources: `${URLS.apps.production.alias}/`,
		url: '/article',
		locale: 'mw',
	});
}
