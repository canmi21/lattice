/**
 * What the editor holds between saves, which is the browser's and not the collection's.
 *
 * Keyed by rid, so two tabs on two articles do not share one buffer -- the failure that costs is
 * the one where saving the second overwrites the first with text it never contained. Every read
 * and write is guarded: storage throws in a private window and comes back empty after a clear,
 * and neither is a reason for the editor not to open. See spec/todo/milestones.md.
 */
const key = (rid: string) => `draft:${rid}`;

export function remember(rid: string, body: string): void {
	try {
		localStorage.setItem(key(rid), body);
	} catch {
		// A buffer is a convenience. Losing it costs the keystrokes since the last save, and
		// refusing to edit because it cannot be kept would cost the session.
	}
}

export function recall(rid: string): string | undefined {
	try {
		return localStorage.getItem(key(rid)) ?? undefined;
	} catch {
		return undefined;
	}
}

export function forget(rid: string): void {
	try {
		localStorage.removeItem(key(rid));
	} catch {
		// Nothing to do: the row is saved, and a buffer nobody can clear is read once and dropped.
	}
}
