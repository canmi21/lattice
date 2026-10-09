<script lang="ts">
	/**
	 * Which of the two error pages this is, inside the console's own frame, so the sidebar still
	 * leads somewhere. See spec/console/design.md, "An error is the site's page, in the console's
	 * frame".
	 */
	import { page } from '$app/state';
	import { pageOf } from '@canmi/web/error';
	import ClientError from '#lib/error/client.svelte';
	import StatusError from '#lib/error/status.svelte';
</script>

{#if pageOf(page.error) === 'client'}
	<ClientError />
{:else}
	<StatusError status={page.status} />
{/if}
