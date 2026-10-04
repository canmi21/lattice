<script lang="ts">
	import Task from '#lib/task.svelte';
	import type { PageData } from '././$types';

	let { data }: { data: PageData } = $props();
</script>

{#key `${data.service}/${data.id}`}
	<Task service={data.service} id={data.id} initial={data.detail} />
{/key}
