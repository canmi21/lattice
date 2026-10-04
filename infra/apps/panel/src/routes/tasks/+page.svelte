<script lang="ts">
	import Tasks from '#lib/tasks.svelte';
	import type { PageData } from '././$types';

	let { data }: { data: PageData } = $props();
</script>

<Tasks initial={data.tasks} />
