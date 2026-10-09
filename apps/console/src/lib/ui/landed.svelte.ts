/**
 * The latest value a streamed read landed with, kept while a newer one is on its way, so a page
 * whose load runs again does not fall back to its placeholders. None until the first lands; a read
 * the load held rather than streamed is the value at once, on the server too, which otherwise draws
 * the placeholders; none again when `key` moves to another thing. Made while a component starts,
 * since it owns an effect. See spec/architecture/console.md, "Moving between pages never waits for
 * a node".
 */
export class Landed<T> {
	value: T | undefined = $state.raw();

	constructor(read: () => T | Promise<T>, key: () => unknown = () => undefined) {
		const first = read();
		if (!(first instanceof Promise)) this.value = first;
		let held: unknown = key();
		$effect.pre(() => {
			const promise = read();
			const now = key();
			if (now !== held) this.value = undefined;
			held = now;
			if (!(promise instanceof Promise)) {
				this.value = promise;
				return;
			}
			let gone = false;
			void promise.then((value) => {
				if (!gone) this.value = value;
			});
			return () => {
				gone = true;
			};
		});
	}
}
