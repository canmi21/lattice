<script lang="ts">
	import { page } from '$app/state';
	import AppPage from '$lib/app-page.svelte';
</script>

{#key page.params.name}
	<AppPage name={page.params.name ?? ''} />
{/key}
