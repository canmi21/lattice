import { dev } from '$app/environment';
import { OpenPanel } from '@openpanel/web';

/**
 * The OpenPanel client this site reports to, its id public by construction. See spec/analytics.md,
 * "The client id is public, the client secret is not in the repo".
 */
const CLIENT_ID = 'fb80587a-c39c-4171-9e1f-c14f73d31bc1';

/**
 * Start reporting page views, outgoing link clicks, and `data-track` elements. Development loads
 * the client fully and reports nothing, matching umami's own dev behaviour: see spec/analytics.md,
 * "Development loads the client and reports nothing", for why and for `filter` being the only
 * option that does it. `trackScreenViews` wraps `history.pushState` for SvelteKit's client-side
 * navigation, since there is no route hook to register. Session replay stays off, a decision of
 * its own.
 */
export function registerAnalytics(): void {
	// Constructing is the entire API here: the SDK arms its listeners in the constructor and
	// registers itself nowhere, so there is no instance to keep until something needs to report
	// a custom event by hand.
	// eslint-disable-next-line no-new
	new OpenPanel({
		clientId: CLIENT_ID,
		trackScreenViews: true,
		trackOutgoingLinks: true,
		trackAttributes: true,
		filter: () => !dev,
	});
}
