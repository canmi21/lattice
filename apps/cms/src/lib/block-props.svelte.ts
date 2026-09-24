/**
 * What a mounted block view reads, made reactive. On its own because a runes module cannot import
 * Milkdown's `$`-named helpers, and the node view needs both.
 */
export type BlockProps = { markdown: string; language: string; name: string; selected: boolean };

export function blockProps(initial: BlockProps): BlockProps {
	const props = $state(initial);
	return props;
}
