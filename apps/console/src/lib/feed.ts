/**
 * The one socket to `/live`, and `/state` asked every few seconds while it is down, both on the
 * page's own host: worker/index.ts answers them. See platform's spec/architecture/relay.md, "A
 * browser opens `/live`".
 */
import type { Cluster, Live } from './wire.ts';

/** Which of the two is in use. */
export type Mode = 'connecting' | 'live' | 'polling';

export interface Listener {
	live(message: Live): void;
	polled(cluster: Cluster): void;
	mode(mode: Mode): void;
	/** Why the last poll failed, or undefined once one succeeds. */
	failure(why: string | undefined): void;
}

const POLL_MS = 5_000;
/** Redialed from one second, doubling to a minute, as the relays redial each other. */
const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 60_000;
/**
 * A browser answers the relay's pings on its own and cannot send any, so the page watches instead:
 * every node moves every few seconds, and this long with no message means the socket is dead.
 */
const SILENCE_MS = 30_000;

/** Starts listening; the returned function stops. */
export function listen(listener: Listener): () => void {
	const socketUrl = new URL('/live', location.href);
	socketUrl.protocol = socketUrl.protocol === 'http:' ? 'ws:' : 'wss:';

	let socket: WebSocket | undefined;
	let retry = FIRST_RETRY_MS;
	let redial: ReturnType<typeof setTimeout> | undefined;
	let silence: ReturnType<typeof setTimeout> | undefined;
	let poll: ReturnType<typeof setInterval> | undefined;
	let stopped = false;

	function dial() {
		listener.mode(poll ? 'polling' : 'connecting');
		const opened = new WebSocket(socketUrl);
		socket = opened;
		opened.onopen = () => {
			retry = FIRST_RETRY_MS;
			stopPolling();
			listener.mode('live');
			watch();
		};
		opened.onmessage = (message) => {
			watch();
			if (typeof message.data !== 'string') return;
			try {
				listener.live(JSON.parse(message.data) as Live);
			} catch {
				// Not JSON: nothing a relay sends, so nothing to read.
			}
		};
		opened.onclose = () => {
			if (socket !== opened || stopped) return;
			socket = undefined;
			clearTimeout(silence);
			startPolling();
			redial = setTimeout(dial, retry);
			retry = Math.min(retry * 2, LAST_RETRY_MS);
		};
	}

	function watch() {
		clearTimeout(silence);
		silence = setTimeout(() => socket?.close(), SILENCE_MS);
	}

	function startPolling() {
		listener.mode('polling');
		if (poll) return;
		void ask();
		poll = setInterval(() => void ask(), POLL_MS);
	}

	function stopPolling() {
		clearInterval(poll);
		poll = undefined;
		listener.failure(undefined);
	}

	async function ask() {
		try {
			const answer = await fetch('/state');
			const body = (await answer.json()) as
				| { status: 'success'; data: Cluster }
				| { status: 'error'; code: string; message: string };
			if (!poll) return;
			if (body.status === 'success') {
				listener.polled(body.data);
				listener.failure(undefined);
			} else {
				listener.failure(body.message);
			}
		} catch (error) {
			if (poll) listener.failure(error instanceof Error ? error.message : String(error));
		}
	}

	dial();
	return () => {
		stopped = true;
		clearTimeout(redial);
		clearTimeout(silence);
		clearInterval(poll);
		socket?.close();
	};
}
