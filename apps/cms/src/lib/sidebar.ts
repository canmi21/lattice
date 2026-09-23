import type { Divider } from '@canmi/behavior/resize';

/**
 * The divider between the sidebar and the pane: where its width is remembered, the property the
 * sidebar reads, and the range a drag may take it through. The fallback is the width a first
 * visit sees, and the one the server renders. See spec/architecture/local.md.
 */
export const SIDEBAR: Divider = {
	key: 'cms.sidebar.width',
	property: '--sidebar-width',
	span: { min: 12, max: 28, fallback: 15 },
};
