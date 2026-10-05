/**
 * The service domains this page answers for, and what each says about itself. One app serves all
 * of them and tells them apart by the request's own host. See spec/architecture/landing.md,
 * "`ixc.one` and `il.lli.lil.ill.li` share one app, on Netlify".
 */
export const HOSTS = {
	'ixc.one': { name: 'ixc.one', line: 'A service domain of the platform.' },
	'symlink.si': { name: 'symlink.si', line: 'Fixed names for the platform’s objects.' },
	'il.lli.lil.ill.li': { name: 'ill.li', line: 'Short links, shorter than they look.' },
} as const;

export type Host = keyof typeof HOSTS;

/** The host a request is for: a name of ours, as itself or with `.localhost` in development. */
export function hostOf(hostname: string): Host {
	const name = hostname.replace(/\.localhost$/, '');
	return name in HOSTS ? (name as Host) : 'ixc.one';
}
