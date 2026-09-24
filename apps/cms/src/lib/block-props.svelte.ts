/**
 * What a mounted block view reads, made reactive. On its own because a runes module cannot import
 * Milkdown's `$`-named helpers, and the node view needs both.
 */
export type BlockProps = { markdown: string; language: string; selected: boolean };

export function blockProps(initial: BlockProps): BlockProps {
	const props = $state(initial);
	return props;
}

/** Where the block handle stands, and the line a dragged block would land on. */
export type GripState = {
	top: number;
	left: number;
	shown: boolean;
	dragging: boolean;
	/** The drop line while dragging: a window position and a width. */
	line: { top: number; left: number; width: number } | null;
};

export function gripState(): GripState {
	const grip = $state<GripState>({ top: 0, left: 0, shown: false, dragging: false, line: null });
	return grip;
}
