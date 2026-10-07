/**
 * The latest value a streamed read landed with, kept while a newer one is on its way, so a page
 * whose load runs again does not fall back to its placeholders. None until the first lands, and
 * none on the server, which draws the placeholders; none again when `key` moves to another
 * thing. Made while a component starts, since it owns an effect. See
 * spec/architecture/console.md, "Moving between pages never waits for a node".
 */
export class Landed<T> {
	value: T | undefined = $state.raw();

	constructor(read: () => Promise<T>, key: () => unknown = () => undefined) {
		let held: unknown;
		$effect.pre(() => {
			const promise = read();
			const now = key();
			if (now !== held) this.value = undefined;
			held = now;
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
