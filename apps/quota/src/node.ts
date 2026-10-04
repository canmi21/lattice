/**
 * `quota` as deployed at home: the inside door over HTTP, `POST /take` with the checks of one call,
 * each bucket the moment its next call is due, in this one process's memory. The arithmetic is the
 * Worker's, through the same `takeAll`. See spec/architecture/quota.md, "Deployed twice, counted
 * where a request enters".
 */
import { createServer } from 'node:http';
import { type Check, type Rate, take } from '@monoflake/sdk/limits';
import { type Buckets, takeAll } from './index.ts';

const port = Number(process.env.PORT ?? 26523);
const due = new Map<string, number>();

/** Every bucket in the map, each taking as the Durable Object does. */
const buckets: Buckets = {
	idFromName: (name) => name,
	get: (id) => ({
		take(rate: Rate) {
			const key = id as string;
			const taken = take(due.get(key), rate, Date.now());
			if (taken.due !== undefined) due.set(key, taken.due);
			return { allowed: taken.allowed, retryAfter: taken.retryAfter };
		},
	}),
};

// A bucket whose next call is already due is full again, and forgetting it changes nothing.
setInterval(() => {
	const now = Date.now();
	for (const [key, next] of due) if (next <= now) due.delete(key);
}, 60_000).unref();

const LONGEST = 86_400;

function isWhole(value: unknown, least: number, most = Number.MAX_SAFE_INTEGER): boolean {
	return Number.isInteger(value) && (value as number) >= least && (value as number) <= most;
}

/** Whether `value` is the checks of one call, each a key and a rate this arithmetic can count. */
function isChecks(value: unknown): value is Check[] {
	return (
		Array.isArray(value) &&
		value.every((check: { key?: unknown; rate?: Partial<Rate> } | null) => {
			const rate = check?.rate;
			return (
				typeof check?.key === 'string' &&
				check.key.length > 0 &&
				check.key.length <= 512 &&
				isWhole(rate?.count, 1) &&
				isWhole(rate?.seconds, 1, LONGEST) &&
				(rate?.burst === undefined || isWhole(rate.burst, 1))
			);
		})
	);
}

function json(status: number, body: unknown) {
	return { status, body: JSON.stringify(body) };
}

createServer((request, response) => {
	const answer = (status: number, body: string) => {
		response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		response.end(body);
	};
	if (request.method === 'GET' && request.url === '/health') return answer(200, '{"status":"ok"}');
	if (request.method !== 'POST' || request.url !== '/take') {
		const refused = json(404, { status: 'error', code: 'no_such_route' });
		return answer(refused.status, refused.body);
	}
	let text = '';
	request.setEncoding('utf8');
	request.on('data', (chunk: string) => {
		text += chunk;
		if (text.length > 64_000) request.destroy();
	});
	request.on('end', async () => {
		let checks: unknown;
		try {
			checks = JSON.parse(text);
		} catch {
			checks = undefined;
		}
		if (!isChecks(checks)) {
			const refused = json(400, { status: 'error', code: 'invalid_checks' });
			return answer(refused.status, refused.body);
		}
		answer(200, JSON.stringify(await takeAll(buckets, checks)));
	});
}).listen(port, '::');
