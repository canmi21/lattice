<script lang="ts">
	import Apps from '#lib/apps.svelte';
	import type { PageData } from '././$types';

	let { data }: { data: PageData } = $props();
</script>

<Apps initial={data.apps} />
