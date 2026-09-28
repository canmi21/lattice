/**
 * What the hook trusts in a delivery from GitHub: that its signature is the shared secret's, and
 * that it announces a successful run of the deploy workflow on `main`. Everything past that the
 * node checks against GitHub itself. See spec/architecture/services.md, "Every node is the same
 * node".
 */
import { URLS } from '@canmi/urls';

/** This repository as GitHub names it, read from its address rather than spelled a second time. */
export const REPOSITORY = new URL(URLS.source).pathname.slice(1);

/** The workflow that builds images; a run of any other says nothing about a deploy. */
export const WORKFLOW = '.github/workflows/deploy.yml';

/** What starts that workflow. A pull request never does; were one added, it would not count. */
const EVENTS = new Set(['push', 'schedule', 'workflow_dispatch']);

function bytesOf(hex: string): Uint8Array<ArrayBuffer> | undefined {
	if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return undefined;
	return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/**
 * Whether `signature`, GitHub's `X-Hub-Signature-256`, is `body` signed with `secret`. Verified by
 * WebCrypto rather than compared as strings, so the time taken says nothing about the match.
 */
export async function signed(body: string, signature: string | null, secret: string): Promise<boolean> {
	const given = bytesOf(signature?.replace(/^sha256=/, '') ?? '');
	if (!given || !secret) return false;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify'],
	);
	return crypto.subtle.verify('HMAC', key, given, encoder.encode(body));
}

interface WorkflowRunEvent {
	action?: string;
	repository?: { full_name?: string };
	workflow_run?: {
		id?: number;
		path?: string;
		head_branch?: string;
		event?: string;
		status?: string;
		conclusion?: string;
	};
}

/** The run a `workflow_run` delivery asks the nodes to deploy from, or none. */
export function runToDeploy(payload: WorkflowRunEvent): number | undefined {
	const run = payload.workflow_run;
	const deploys =
		payload.action === 'completed' &&
		payload.repository?.full_name === REPOSITORY &&
		run?.path === WORKFLOW &&
		run.head_branch === 'main' &&
		run.status === 'completed' &&
		run.conclusion === 'success' &&
		EVENTS.has(run.event ?? '');
	return deploys && typeof run?.id === 'number' ? run.id : undefined;
}
