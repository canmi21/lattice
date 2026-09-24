/**
 * The reactive state the editor's mounted components read: a rendered block, the block handle and
 * the formatting bar. Made here because the modules that mount them are plain TypeScript, where
 * runes are not available.
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
	/** The room a dragged block would take where it would land, drawn without taking it. */
	outline: { top: number; left: number; width: number; height: number } | null;
};

export function gripState(): GripState {
	const grip = $state<GripState>({
		top: 0,
		left: 0,
		shown: false,
		dragging: false,
		line: null,
		outline: null,
	});
	return grip;
}

/** Where the formatting bar stands over a selection, and which of its marks the selection has. */
export type FormatState = { shown: boolean; top: number; left: number; active: string[] };

export function formatState(): FormatState {
	const format = $state<FormatState>({ shown: false, top: 0, left: 0, active: [] });
	return format;
}
