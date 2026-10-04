/**
 * Infra's own addresses: the panel, keeper and host, which bootstrap everything else and so are
 * named below it. See spec/architecture/layers.md, "Addresses are split by who owns the name".
 */
import { PORT_OFFSET } from 'canmi/urls';

export const INFRA = {
	// The panel, host's interface, an app of its own; see spec/architecture/host.md.
	panel: 'https://infra.internal.ixc.one',
	keeper: 'https://keeper.internal.ixc.one',
	// host's API as the panel reaches it, on the panel's network.
	host: 'http://host:11011',
} as const;

/** The port the panel's development server answers on, before the sandbox shifts it. */
export const PANEL_PORT = 26519;

/**
 * Where `mise run reach` answers: a plain-HTTP door on this machine to an interface that only the
 * LAN reaches. Not an app, so it is kept out of the pinned ports. See spec/toolchain.md, "Reaching
 * the LAN from a browser that cannot".
 */
export const REACH_PORT: number = 26520 + PORT_OFFSET;
