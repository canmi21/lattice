<script lang="ts">
	import { page } from '$app/state';
	import { pageOf } from '@canmi/web/error';
	import ClientError from '#lib/error/client.svelte';
	import StatusError from '#lib/error/status.svelte';
	import type { LocaleCode } from '#lib/locale/index.js';

	// The view being rendered, read off what the server stamped. An error page still answers in
	// the language the reader asked for. See spec/locale/addressing.md.
	const locale = $derived((page.data.locale?.code ?? 'mw') as LocaleCode);

	/** Which of the two error pages this is; lib's spec/web/error.md, "Two pages". */
	const fromBrowser = $derived(pageOf(page.error) === 'client');
</script>

{#if fromBrowser}
	<ClientError {locale} />
{:else}
	<StatusError status={page.status} {locale} />
{/if}
