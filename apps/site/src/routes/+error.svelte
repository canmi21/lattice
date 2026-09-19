<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, text, weight } from '$lib/vocabulary.stylex.ts';

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
			fontSize: '1.5rem',
			// The line both halves are given, which is what puts the number and the sentence on one
			// box however tall each would otherwise have been. Tailwind writes it as `--tw-leading`
			// and its `2xl` step reads that variable rather than its own default, so the pair never
			// competed and the ratio `calc(2 / 1.5)` never reached the element.
			lineHeight: '3.0625rem',
			fontWeight: weight.medium,
			color: 'var(--color-text)',
		},
		/** The sentence written for a person, on the same line box as the number. */
		message: {
			fontSize: text.px14,
			lineHeight: '3.0625rem',
			color: 'var(--color-text)',
		},
	});
</script>

<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import type { LocaleCode } from '$lib/locale';

	// The view being rendered, read off what the server stamped. An error page still answers in
	// the language the reader asked for. See spec/locale/addressing.md.
	const locale = $derived((page.data.locale?.code ?? 'mw') as LocaleCode);

	// Left in English on purpose. These are the protocol's own names for its statuses, printed
	// beside the number they belong to, and a reader who meets `404` meets `Not Found` with it
	// everywhere else on the web. The sentence below is the part written for a person.
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

	const message = $derived(
		page.status === 404
			? m['error.not-found']({}, { locale })
			: (page.error?.message ?? m['error.unexpected']({}, { locale })),
	);
	const titleText = $derived(STATUS_TEXT[page.status] ?? 'Error');
</script>

<svelte:head>
	<title>{page.status} {titleText}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center px-6">
	<div class="flex items-center">
		<h1 class="pr-6 {stylex.attrs(styles.status).class}">
			{page.status}<span class="sr-only"> {titleText}</span>
		</h1>
		<p class="pl-6 {stylex.attrs(styles.message).class}">
			{message}
		</p>
	</div>
</main>
