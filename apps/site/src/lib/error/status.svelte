<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, line, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the error page. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css/authoring.md. No scoped
	 * block: two elements, both the component's own, so a class on each reaches everything there is.
	 *
	 * No tag in angle brackets may appear anywhere in this block, comments included -- see
	 * spec/architecture/css/authoring.md, "A comment in the module script cannot write a tag in angle
	 * brackets".
	 */
	const styles = stylex.create({
		/** The status number, and the rule between it and the sentence beside it. */
		status: {
			// The right-edge utility writes its style through `--tw-border-style`, which is
			// registered with `solid` as its initial value, so the edge computes to one of solid.
			borderRightWidth: border.hairlinePx,
			borderRightStyle: 'solid',
			// All four edges, three of which have no width to draw: `border-border` is the
			// shorthand, and the computed style carries the colour on every side.
			borderColor: 'var(--color-border)',
			// unnamed: display type, nine steps over the interface ladder and written once.
			fontSize: '1.5rem',
			// The line both halves are given, which is what puts the number and the sentence on one
			// box however tall each would otherwise have been. Tailwind writes it as `--tw-leading`
			// and its `2xl` step reads that variable rather than its own default, so the pair never
			// competed and the ratio `calc(2 / 1.5)` never reached the element.
			// unnamed: one box's height shared by two keys of this file, not a step on a ladder.
			lineHeight: '3.0625rem',
			fontWeight: weight.medium,
			color: 'var(--color-text)',
		},
		/** The sentence written for a person, on the same line box as the number. */
		message: {
			fontSize: text.px14,
			// unnamed: the same box as the number beside it, which is what puts them on one line.
			lineHeight: '3.0625rem',
			color: 'var(--color-text)',
		},
		/**
		 * The way to reach a person, which is offered rather than announced.
		 *
		 * A step down and a softer ink: a reader who is not going to write to anybody should be
		 * able to leave without reading it, and one who is looking for it finds the only link on
		 * the page.
		 */
		offer: {
			fontSize: text.px13,
			lineHeight: line.relaxed,
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { LocaleCode } from '$lib/locale';
	import Offer from './offer.svelte';

	/**
	 * What a reader is shown when a server answered, and the answer was a number.
	 *
	 * The number is the page, because it is the one thing every reader already knows how to read.
	 * A failure with no number is a different page; see client.svelte.
	 */
	let { status, locale }: { status: number; locale: LocaleCode } = $props();

	// Left in English on purpose. These are the protocol's own names for its statuses, and a
	// reader who meets `404` meets `Not Found` with it everywhere else on the web. The title
	// carries the pair whatever the page is answering in; the sentence is the part for a person.
	const STATUS_TEXT: Record<number, string> = {
		400: 'Bad Request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Not Found',
		405: 'Method Not Allowed',
		410: 'Gone',
		429: 'Too Many Requests',
		500: 'Internal Server Error',
		502: 'Bad Gateway',
		503: 'Service Unavailable',
		504: 'Gateway Timeout',
	};

	/**
	 * The sentence is this site's, in the reader's language, and never `page.error.message`.
	 *
	 * That field carries whichever words the framework or an `error()` call happened to use --
	 * `Internal Error`, `License not found` -- which are for a log. It is also always set, so
	 * reading it meant the localised sentence below never rendered outside 404 and a reader
	 * asking for Chinese was answered in English. The protocol's own name is not lost: it is in
	 * the title and in the line a screen reader is given.
	 */
	const message = $derived(
		status === 404 ? m['error.not-found']({}, { locale }) : m['error.unexpected']({}, { locale }),
	);
	const titleText = $derived(STATUS_TEXT[status] ?? 'Error');

	/** An absence rather than a failure: there is nothing to report, so the offer is shorter. */
	const missing = $derived(status === 404);
</script>

<svelte:head>
	<title>{status} {titleText}</title>
</svelte:head>

<!-- The pair sits at the centre of the window and the offer at the foot of it. The offer is taken
     out of the flow rather than laid out below: in flow it would be half of what is centred, and
     the line the page is actually about would sit above the middle by half the offer's height. -->
<main class="relative flex min-h-screen items-center justify-center px-6">
	<div class="flex items-center">
		<h1 class="pr-6 {stylex.attrs(styles.status).class}">
			<!-- The space is written as data rather than as markup, because Svelte trims whitespace
			     at the start of an element's content and a screen reader was hearing "500Internal
			     Server Error" as one word. -->
			{status}<span class="sr-only">{` ${titleText}`}</span>
		</h1>
		<p class="pl-6 {stylex.attrs(styles.message).class}">
			{message}
		</p>
	</div>
	<p class="absolute inset-x-0 bottom-16 px-6 text-center {stylex.attrs(styles.offer).class}">
		<Offer {locale} {missing} />
	</p>
</main>
