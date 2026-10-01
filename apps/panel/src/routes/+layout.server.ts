// Whether this visitor is signed in, and the machine's name, read once on the server so the first
// paint is the right one: the sign-in form, or the panel.
import { read, SESSION, SignedOut } from '$lib/server/core';
import type { MachineInfo, Sample } from '$lib/api';
import type { LayoutServerLoad } from './$types';

// The path's spelling is the entry point's to settle, by the one rule every server shares, before
// any route reads it; SvelteKit's own trailing-slash redirect would answer first and by another.
// See spec/architecture/delivery.md, "Every address has one spelling".
export const trailingSlash = 'ignore';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const token = cookies.get(SESSION);
	try {
		await read('/api/apps', token);
	} catch (error) {
		if (error instanceof SignedOut) return { signedIn: false, machine: undefined };
		return { signedIn: true, machine: undefined };
	}
	const now = await read<{ info: MachineInfo; sample: Sample }>('/api/node/now', token).catch(
		() => undefined,
	);
	return { signedIn: true, machine: now?.info.model ?? undefined };
};
