<script lang="ts">
	import { page } from '$app/state';
	import ClientError from '$lib/error/client.svelte';
	import StatusError from '$lib/error/status.svelte';
	import type { LocaleCode } from '$lib/locale';

	// The view being rendered, read off what the server stamped. An error page still answers in
	// the language the reader asked for. See spec/locale/addressing.md.
	const locale = $derived((page.data.locale?.code ?? 'mw') as LocaleCode);

	/**
	 * Which of the two error pages this is, and the whole of what this route decides.
	 *
	 * `origin` is stamped by whichever `handleError` ran, and only unexpected errors reach one --
	 * an `error()` goes to the page with its own body and no stamp at all. So a 404 keeps its
	 * number whichever side worked it out, and only a browser that broke gets the page that has
	 * none. See app.d.ts.
	 */
	const fromBrowser = $derived(page.error?.origin === 'client');
</script>

{#if fromBrowser}
	<ClientError {locale} />
{:else}
	<StatusError status={page.status} {locale} />
{/if}
