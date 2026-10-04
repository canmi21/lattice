<script lang="ts">
	import { page } from '$app/state';
	import AppPage from '#lib/app-page.svelte';
	import type { PageData } from '././$types';

	let { data }: { data: PageData } = $props();
</script>

{#key page.params.name}
	<AppPage name={page.params.name ?? ''} initial={data.app} />
{/key}
