import { SignedOut } from './api';

/** Whether this browser holds a session: unknown until the first answer says. */
export const session = $state<{ signedIn: boolean | undefined }>({ signedIn: undefined });

/** A request that came back signed out, anywhere, sends the panel to sign in. */
export function signedOut(error: unknown): boolean {
	if (error instanceof SignedOut) {
		session.signedIn = false;
		return true;
	}
	return false;
}
