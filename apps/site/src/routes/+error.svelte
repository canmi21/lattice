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
		/**
		 * The way to reach a person, which is offered rather than announced.
		 *
		 * A step down and a softer ink: a reader who is not going to write to anybody should be
		 * able to leave without reading it, and one who is looking for it finds the only link on
		 * the page.
		 */
		offer: {
			fontSize: text.px13,
			lineHeight: 1.6,
			color: 'var(--color-text-soft)',
		},
		/** The address itself, at the strength of the text it sits in until it is pointed at. */
		address: {
			color: {
				default: 'var(--color-text)',
				':hover': 'var(--color-text-strong)',
			},
			transitionProperty: 'color',
			transitionDuration: '150ms',
			transitionTimingFunction: 'ease',
		},
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ParaglideMessage } from '@inlang/paraglide-js-svelte';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import type { LocaleCode } from '$lib/locale';
	import { site } from '$lib/site';

	// The view being rendered, read off what the server stamped. An error page still answers in
	// the language the reader asked for. See spec/locale/addressing.md.
	const locale = $derived((page.data.locale?.code ?? 'mw') as LocaleCode);

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
		page.status === 404
			? m['error.not-found']({}, { locale })
			: m['error.unexpected']({}, { locale }),
	);
	const titleText = $derived(STATUS_TEXT[page.status] ?? 'Error');

	/**
	 * Whether the page is reporting an absence or a failure, which is what the offer turns on.
	 *
	 * The two sentences are rendered separately rather than chosen into one variable, because
	 * they do not carry the same tags -- only a failure offers the report form, since a page that
	 * is simply not there is nothing to report -- and paraglide types each message by the tags it
	 * actually has. A union of the two is correctly rejected.
	 */
	const missing = $derived(page.status === 404);

	/**
	 * The dialog is fetched on the first press and never before it.
	 *
	 * The import is here and not at the top for two reasons. It is 24KB gzipped of preact, which
	 * in the app entry is every page paying for a control only this one has. And this component
	 * renders on the server, where `@sentry/sveltekit` resolves to an entry with no `getFeedback`
	 * -- a top-level import of a name that is not there fails the module rather than the call,
	 * which 500ed the error page itself.
	 */
	async function openReport(): Promise<void> {
		const { openReport: show } = await import('$lib/error/report');
		await show();
	}
</script>

<svelte:head>
	<title>{page.status} {titleText}</title>
</svelte:head>

<!-- Declared once and handed to whichever sentence is being rendered. Both sentences name the
     address and only one names the form, so writing them inside each message would put the same
     anchor in two places for the sake of the tag that differs. -->
{#snippet address()}<a
		href="mailto:{site.author.email}"
		class="focus-link spring-underline article-link {stylex.attrs(styles.address).class}"
		>{site.author.email}</a
	>{/snippet}

<!-- A button and not a link, because what it opens is a dialog on this page rather than somewhere
     to go. Its label is the text inside the tag, so the words stay in the message file with the
     sentence they belong to rather than in a key of their own.

     The stroke is on the span and not on the button: a button's box is a line box, so a stroke
     pinned to its bottom sat 2.5px below the address's in the same sentence. See utilities.css. -->
{#snippet reportForm({ children }: { children?: Snippet })}<button
		type="button"
		onclick={openReport}
		class="focus-link spring-underline-host cursor-pointer {stylex.attrs(styles.address).class}"
		><span class="spring-underline article-link">{@render children?.()}</span></button
	>{/snippet}

<!-- The pair sits at the centre of the window and the offer at the foot of it. The offer is taken
     out of the flow rather than laid out below: in flow it would be half of what is centred, and
     the line the page is actually about would sit above the middle by half the offer's height. -->
<main class="relative flex min-h-screen items-center justify-center px-6">
	<div class="flex items-center">
		<h1 class="pr-6 {stylex.attrs(styles.status).class}">
			<!-- The space is written as data rather than as markup, because Svelte trims whitespace
			     at the start of an element's content and a screen reader was hearing "500Internal
			     Server Error" as one word. -->
			{page.status}<span class="sr-only">{` ${titleText}`}</span>
		</h1>
		<p class="pl-6 {stylex.attrs(styles.message).class}">
			{message}
		</p>
	</div>
	<p class="absolute inset-x-0 bottom-16 px-6 text-center {stylex.attrs(styles.offer).class}">
		{#if missing}
			<ParaglideMessage
				message={m['error.contact.not-found']}
				inputs={{}}
				options={{ locale }}
				mail={address}
			/>
		{:else}
			<ParaglideMessage
				message={m['error.contact.unexpected']}
				inputs={{}}
				options={{ locale }}
				mail={address}
				report={reportForm}
			/>
		{/if}
	</p>
</main>
