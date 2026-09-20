/**
 * Sentry's feedback dialog, in a module nothing imports until a reader asks for it.
 *
 * It is a module of its own so the 24KB gzipped widget can be split out of the app entry.
 * Naming the integration at `Sentry.init` put it in the static graph, and so did reaching for it
 * with `await import('@sentry/sveltekit')` -- a namespace import forces every export live, so
 * the bundler cannot tell that only this one binding is wanted. Named imports here, and a
 * dynamic import of *this* file from the error page, is what lets the defining module travel
 * with the chunk that uses it. See routes/+error.svelte.
 */
import { feedbackIntegration, getClient, getFeedback } from '@sentry/sveltekit';

/** What this page uses of Sentry's dialog. Its own type is not part of the published surface. */
type Dialog = { appendToDom: () => void; open: () => void };

let form: Dialog | undefined;

/**
 * Show the dialog, registering the integration the first time.
 *
 * Answers whether it opened, so the caller can say nothing rather than guess. Sentry is switched
 * off in development, which leaves the client with no integrations to add one to.
 */
export async function openReport(): Promise<boolean> {
	const client = getClient();
	if (!client) return false;
	// `autoInject: false`, or Sentry floats a button of its own in the corner as well.
	if (!getFeedback()) client.addIntegration(feedbackIntegration({ autoInject: false }));
	const feedback = getFeedback();
	if (!feedback) return false;
	form ??= await feedback.createForm();
	form.appendToDom();
	form.open();
	return true;
}
