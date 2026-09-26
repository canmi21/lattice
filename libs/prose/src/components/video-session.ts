/**
 * The system's own media controls -- media keys, the lock screen, the control centre, and the
 * buttons a browser puts in its own picture-in-picture window -- driving the clip last played.
 *
 * There is one session per page and several clips on it, so a clip claims it when it starts
 * playing and the claim is the last one made. What the session is handed is the clip's own
 * actions, not the element's, so a play from a media key restores a position the way a play
 * from the page does. See spec/architecture/video/player.md, "The system's controls drive the
 * clip last played".
 */

/** How far the skip buttons move, in seconds. */
const SKIP = 10;

export type SessionActions = {
	play: () => void;
	pause: () => void;
};

let owner: HTMLVideoElement | undefined;

function position(video: HTMLVideoElement): void {
	if (!Number.isFinite(video.duration) || video.duration <= 0) return;
	try {
		navigator.mediaSession.setPositionState({
			duration: video.duration,
			playbackRate: video.playbackRate,
			position: Math.min(video.currentTime, video.duration),
		});
	} catch {
		// A state the browser finds inconsistent mid-seek; the next update puts it right.
	}
}

/**
 * Hand the session to `video`, and keep what it shows in step while it holds it. Returns the
 * function that lets it go, which does nothing once another clip has claimed it since.
 */
export function claimSession(
	video: HTMLVideoElement,
	actions: SessionActions,
	title: string,
): () => void {
	if (!('mediaSession' in navigator)) return () => {};
	const session = navigator.mediaSession;
	owner = video;
	session.metadata = new MediaMetadata({ title });
	const seek = (to: number) => {
		video.currentTime = Math.max(0, Math.min(to, video.duration || to));
		position(video);
	};
	const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
		['play', () => actions.play()],
		['pause', () => actions.pause()],
		['seekbackward', (details) => seek(video.currentTime - (details.seekOffset ?? SKIP))],
		['seekforward', (details) => seek(video.currentTime + (details.seekOffset ?? SKIP))],
		['seekto', (details) => seek(details.seekTime ?? video.currentTime)],
	];
	for (const [action, handler] of handlers) {
		try {
			session.setActionHandler(action, handler);
		} catch {
			// An action this browser does not offer.
		}
	}
	const update = () => {
		if (owner !== video) return;
		session.playbackState = video.paused ? 'paused' : 'playing';
		position(video);
	};
	const events = ['play', 'pause', 'ratechange', 'durationchange', 'seeked'] as const;
	for (const name of events) video.addEventListener(name, update);
	update();
	return () => {
		for (const name of events) video.removeEventListener(name, update);
		if (owner !== video) return;
		owner = undefined;
		for (const [action] of handlers) {
			try {
				session.setActionHandler(action, null);
			} catch {
				// As above.
			}
		}
		session.metadata = null;
		session.playbackState = 'none';
	};
}

/** Claim the session each time `video` starts playing, until the returned function is called. */
export function claimOnPlay(
	video: HTMLVideoElement,
	actions: SessionActions,
	title: () => string,
): () => void {
	let release: (() => void) | undefined;
	const claim = () => {
		release?.();
		release = claimSession(video, actions, title());
	};
	video.addEventListener('play', claim);
	return () => {
		video.removeEventListener('play', claim);
		release?.();
	};
}
