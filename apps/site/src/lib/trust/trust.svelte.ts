import { dev } from '$app/env';
import { EXTERNAL } from '@canmi/me/urls';
import { apiPath } from '#lib/api.js';
import { site } from '#lib/site.js';

/**
 * Trust to write, earned by passing Cloudflare Turnstile once a day. The page runs the widget in
 * the background when it is not yet trusted, a reader who has to interact with it sees it alone on
 * the screen, and a write the API refuses with 428 runs it again and asks once more. Reading needs
 * none of it, and a page whose script is blocked reads the same. See spec/architecture/trust.md.
 */

/** Turnstile's documented test key that passes without interaction, for development alone. */
const TEST_SITE_KEY = '1x00000000000000000000AA';

const SCRIPT = `${EXTERNAL.turnstile.script}?render=explicit`;

/** The action the API holds a token to, so one minted for something else is refused. */
const ACTION = 'trust';

/** How long before its end a grant is treated as ended, so a write never races the expiry. */
const MARGIN_SECONDS = 60;

/**
 * The widget's key: the site's own in production, absent until the widget exists, which leaves
 * the page as it was. `VITE_TURNSTILE_SITE_KEY` picks another test key in development --
 * `3x00000000000000000000FF` forces the interactive challenge, for working on the overlay.
 */
const siteKey: string | null = dev
	? import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY
	: site.turnstile.siteKey;

/** What the overlay draws from: shown only while the widget waits on the reader. */
export const challenge = $state({ shown: false });

interface Turnstile {
	render(container: HTMLElement, options: Record<string, unknown>): string;
	remove(widget: string): void;
}

let container: HTMLElement | undefined;
let script: Promise<Turnstile> | undefined;
let pending: Promise<boolean> | undefined;
let dismiss: (() => void) | undefined;
/** The reader closed the check; writes the page sends on its own stop asking for it. */
let dismissed = false;

/** Where the widget is drawn; the overlay hands its element over while it is mounted. */
export function holdChallenge(element: HTMLElement): () => void {
	container = element;
	return () => {
		if (container === element) container = undefined;
	};
}

/** The end of this browser's grant, in seconds, from the cookie the API sets beside it. */
function trustedUntil(): number {
	const found = /(?:^|;\s*)trust_until=(\d+)/u.exec(document.cookie);
	return found ? Number(found[1]) : 0;
}

function trusted(): boolean {
	return trustedUntil() - MARGIN_SECONDS > Date.now() / 1000;
}

function load(): Promise<Turnstile> {
	const ready = (window as { turnstile?: Turnstile }).turnstile;
	if (ready) return Promise.resolve(ready);
	script ??= new Promise<Turnstile>((resolve, reject) => {
		const element = document.createElement('script');
		element.src = SCRIPT;
		element.async = true;
		element.onload = () => {
			const loaded = (window as { turnstile?: Turnstile }).turnstile;
			if (loaded) resolve(loaded);
			else reject(new Error('turnstile did not load'));
		};
		element.onerror = () => {
			script = undefined;
			reject(new Error('turnstile did not load'));
		};
		document.head.appendChild(element);
	});
	return script;
}

/** One pass of the widget: its token, or nothing when it failed, timed out or was dismissed. */
async function solve(key: string, into: HTMLElement): Promise<string | undefined> {
	const turnstile = await load().catch(() => undefined);
	if (!turnstile) return undefined;
	return new Promise((resolve) => {
		let widget: string | undefined;
		const finish = (token?: string) => {
			challenge.shown = false;
			dismiss = undefined;
			if (widget !== undefined) turnstile.remove(widget);
			resolve(token);
		};
		dismiss = () => finish();
		widget = turnstile.render(into, {
			sitekey: key,
			action: ACTION,
			appearance: 'interaction-only',
			theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
			'before-interactive-callback': () => {
				challenge.shown = true;
			},
			callback: (token: string) => finish(token),
			// While the reader is being asked, Turnstile retries a failure itself; before that there
			// is nobody to retry for, and the write that needed it is told no.
			'error-callback': () => {
				if (!challenge.shown) finish();
				return true;
			},
			'timeout-callback': () => finish(),
			'expired-callback': () => finish(),
		});
	});
}

async function earn(): Promise<boolean> {
	if (!siteKey || !container) return false;
	const token = await solve(siteKey, container);
	if (!token) return false;
	const answer = await fetch(apiPath('verify'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token }),
	}).catch(() => undefined);
	return answer?.ok ?? false;
}

/**
 * Make sure this browser is trusted, running the check when it is not -- or always, when `again`,
 * because the API said a grant the cookie still claims is gone. One check at a time.
 */
export function ensureTrust(again = false): Promise<boolean> {
	if (!again && trusted()) return Promise.resolve(true);
	pending ??= earn().finally(() => {
		pending = undefined;
	});
	return pending;
}

/** Earn trust in the background on arrival, so a reader's first write does not wait for it. */
export function warmTrust(): void {
	if (!siteKey || trusted()) return;
	void ensureTrust();
}

/**
 * Close the overlay and give up on this check. The page's own writes stop asking for another, so
 * it does not come straight back; a write the reader makes asks again.
 */
export function dismissChallenge(): void {
	dismissed = true;
	dismiss?.();
}

/**
 * `fetch` for a write. A page not yet trusted waits for the check first -- the arrival's own, as a
 * read counted on landing races it -- and when the API still answers 428 the check is run again and
 * the write asked once more. Any other answer, and a check that did not pass, is the caller's.
 *
 * A `passive` write is one the page sends on its own, a read counted: it never starts a check,
 * and once the reader has closed one it does not wait either, so the overlay stays closed and the
 * write is simply refused.
 */
export async function writeFetch(
	input: string,
	init: RequestInit,
	{ passive = false }: { passive?: boolean } = {},
): Promise<Response> {
	if (!passive) dismissed = false;
	if (siteKey && !trusted() && !(passive && dismissed)) await ensureTrust();
	const first = await fetch(input, init);
	if (first.status !== 428 || passive) return first;
	if (!(await ensureTrust(true))) return first;
	return fetch(input, init);
}
