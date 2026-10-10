/**
 * A surface the pointer opened, held as one place with what opened it: the anchor, the surface,
 * and the unseen bridge across the gap between them (./bridge.svelte, inside the surface). It
 * stays while the pointer is in any of them and closes the moment it leaves all three, with no
 * delay to wait out. See spec/console/design.md, "A surface the pointer opened holds the pointer".
 */
export class Held {
	/** What opened the surface: the slot, the mark. */
	anchor: HTMLElement | undefined;
	/** The surface, its bridge inside it. */
	surface: HTMLElement | undefined;

	constructor(readonly close: () => void) {}

	/** The pointer off the anchor: closes, unless it went onto the surface. */
	offAnchor = (event: PointerEvent): void => {
		if (!Held.#into(event, this.surface)) this.close();
	};

	/** The pointer off the surface: closes, unless it went back onto the anchor. */
	offSurface = (event: PointerEvent): void => {
		if (!Held.#into(event, this.anchor)) this.close();
	};

	static #into(event: PointerEvent, other: Element | undefined): boolean {
		const to = event.relatedTarget as Node | null;
		return Boolean(to && other?.contains(to));
	}
}
