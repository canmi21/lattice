/** VPC bindings for the tests of what reads through them: they record what they were sent. */
import type { Env } from './edge.ts';

export const TOKEN = 'read-token';

export interface Sent {
	node: string;
	url: string;
}

/** Each binding answers as `answers` says for the path it was asked, or throws. */
export function bound(answers: Record<string, (path: string) => Response>) {
	const sent: Sent[] = [];
	const env = Object.fromEntries(
		Object.entries(answers).map(([name, answer]) => [
			name.toUpperCase(),
			{
				fetch: async (url: string) => {
					sent.push({ node: name, url });
					return answer(url.replace(/^http:\/\/[^/]+\/api/, ''));
				},
			} as unknown as Fetcher,
		]),
	);
	return { sent, env: { ...env, HOST_READ_TOKEN: TOKEN } as Env };
}

export const success = (data: unknown) => Response.json({ status: 'success', data });
export const down = (): Response => {
	throw new Error('tunnel down');
};

/** The path and query each request asked for, under `/api`. */
export const paths = (sent: Sent[]) =>
	sent.map(({ url }) => url.replace(/^http:\/\/[^/]+\/api/, ''));
