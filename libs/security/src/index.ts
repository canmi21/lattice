/**
 * The security.txt every host of ours answers with: RFC 9116's two required fields and where the
 * file lives. See spec/architecture/firewall.md, "Every host answers its own security.txt".
 */
import { URLS } from '@monoflake/sdk';
import { agentNote, type Service } from './agents';

/** The path the RFC fixes, which every whitelist lets through. */
export const SECURITY_TXT_PATH = '/.well-known/security.txt';

/** RFC 9116 asks for an expiry under a year away; stated per request, so it never lapses. */
const VALID_DAYS = 180;

/**
 * The file as `origin` answers it at `now`. The expiry is a day boundary, so every answer on one
 * day is the same text and caches as one.
 */
export function securityTxt(origin: string, now: Date, service: Service): string {
	const expires = new Date(now);
	expires.setUTCHours(0, 0, 0, 0);
	expires.setUTCDate(expires.getUTCDate() + VALID_DAYS);
	return [
		`Contact: ${URLS.contact.security}`,
		`Expires: ${expires.toISOString()}`,
		`Canonical: ${new URL(SECURITY_TXT_PATH, origin).href}`,
		'',
		...agentNote('security', service),
		'',
	].join('\n');
}

/** The file as a response for the host `request` arrived at, which is `service`. */
export function securityResponse(request: Request, service: Service): Response {
	return new Response(securityTxt(new URL(request.url).origin, new Date(), service), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}
