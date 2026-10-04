<script lang="ts">
	import Schedules from '#lib/schedules.svelte';
	import type { PageData } from '././$types';

	let { data }: { data: PageData } = $props();
</script>

<Schedules initial={data.schedules} />
