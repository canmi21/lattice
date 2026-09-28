<script lang="ts">
	import Routes from '$lib/routes.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<Routes initial={data.routes} />
