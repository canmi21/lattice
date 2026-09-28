/**
 * The `hook` scope of the public API host: GitHub's webhook for workflow runs arrives here, and a
 * run worth deploying is passed to the machine at home over Workers VPC -- to host for the apps,
 * and to keeper, which alone deploys host. See spec/architecture/services.md.
 */
import { failure, success } from '@canmi/response';
import { URLS } from '@canmi/urls';
import { runToDeploy, signed } from './github';

export interface Env {
	/** The secret GitHub signs each delivery with, set as a Worker secret. */
	WEBHOOK_SECRET: string;
	/** The machine at home's Caddy, through its tunnel. */
	HOME: Fetcher;
}

/** The public suffix Caddy routes the two receivers under; VPC sends it as the `Host`. */
const SUFFIX = new URL(URLS.internal.app).hostname;

/** Where the notice goes on a node, by label: the panel, which passes it on to host, and keeper.
 * See spec/architecture/host.md, "One name inside, and a domain label outside". */
export const RECEIVERS = ['infra', 'keeper'].map((label) => `http://${label}.${SUFFIX}/notice`);

export async function handle(request: Request, env: Env): Promise<Response> {
	const { pathname } = new URL(request.url);
	// The gateway has taken the scope off; see spec/architecture/services.md.
	if (request.method !== 'POST' || pathname !== '/github') {
		return failure(404, 'no_such_route');
	}
	const body = await request.text();
	if (!(await signed(body, request.headers.get('x-hub-signature-256'), env.WEBHOOK_SECRET))) {
		return failure(401, 'invalid_signature');
	}
	// `ping` arrives when the webhook is set up; every other event is simply not one to act on.
	if (request.headers.get('x-github-event') !== 'workflow_run') {
		return new Response(null, { status: 204 });
	}
	const run = runToDeploy(JSON.parse(body));
	if (run === undefined) return new Response(null, { status: 204 });

	const notice = JSON.stringify({ run });
	const answers = await Promise.allSettled(
		RECEIVERS.map((receiver) =>
			env.HOME.fetch(receiver, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: notice,
			}),
		),
	);
	const reached = answers.map((answer, index) => ({
		receiver: RECEIVERS[index],
		status: answer.status === 'fulfilled' ? answer.value.status : String(answer.reason),
	}));
	// A receiver that did not take it fails the delivery, so GitHub shows it and it can be
	// redelivered.
	const taken = answers.every((answer) => answer.status === 'fulfilled' && answer.value.ok);
	if (taken) return success({ run, reached }, { status: 202 });
	const each = reached.map(({ receiver, status }) => `${receiver} ${status}`);
	return failure(502, 'upstream_unavailable', {
		message: `The machine at home did not take run ${run}: ${each.join(', ')}`,
	});
}

export default { fetch: handle } satisfies ExportedHandler<Env>;
