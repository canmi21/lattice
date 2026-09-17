/**
 * Several lookups in a short window, answered by one request.
 *
 * Warming is the reason this exists. A reader sweeping a pointer down the homepage crosses six
 * cards in under a second, and six requests for six numbers is a cost the reader pays for a
 * gesture they did not mean as six decisions. Collected instead, and sent once the sweep settles.
 *
 * The window is short enough that a deliberate hover still feels immediate and long enough that a
 * sweep collapses. What it is not is a cache: a key asked for twice inside one window is answered
 * once, and after that the caller's own cache decides. See spec/engagement.md.
 */

/** Held per key until the batch it belongs to comes back. */
type Waiting<V> = {
	resolve: (value: V | undefined) => void;
	reject: (reason: unknown) => void;
};

export type BatcherOptions<V> = {
	/** How long to keep collecting after the first key. Milliseconds. */
	window: number;
	/** The most keys one request may carry. A seventh key starts a second batch. */
	limit: number;
	/** Asks for many and answers by key. A key it has no answer for is simply absent. */
	run: (keys: string[]) => Promise<Map<string, V>>;
};

export type Batcher<V> = {
	(key: string): Promise<V | undefined>;
	/** Send what is waiting now rather than at the end of the window. */
	flush: () => void;
};

export function createBatcher<V>({ window: delay, limit, run }: BatcherOptions<V>): Batcher<V> {
	let pending = new Map<string, Waiting<V>[]>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function send() {
		timer = undefined;
		const batch = pending;
		pending = new Map();
		if (batch.size === 0) return;

		const keys = [...batch.keys()];
		run(keys).then(
			(answers) => {
				for (const [key, waiting] of batch) {
					for (const one of waiting) one.resolve(answers.get(key));
				}
			},
			(failure: unknown) => {
				for (const waiting of batch.values()) {
					for (const one of waiting) one.reject(failure);
				}
			},
		);
	}

	const lookup = (key: string): Promise<V | undefined> =>
		new Promise<V | undefined>((resolve, reject) => {
			const waiting = pending.get(key);
			if (waiting) {
				waiting.push({ resolve, reject });
			} else {
				pending.set(key, [{ resolve, reject }]);
			}
			// Full is sent immediately: waiting out the window would only delay a request whose
			// shape is already decided.
			if (pending.size >= limit) {
				if (timer !== undefined) clearTimeout(timer);
				send();
				return;
			}
			timer ??= setTimeout(send, delay);
		});

	return Object.assign(lookup, {
		flush: () => {
			if (timer !== undefined) clearTimeout(timer);
			send();
		},
	});
}
