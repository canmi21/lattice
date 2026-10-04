<script lang="ts">
	import Images from '#lib/images.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<Images initial={data.images} />
