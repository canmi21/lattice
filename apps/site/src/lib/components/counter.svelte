<script lang="ts">
	let { value }: { value: number } = $props();

	// One cell per digit, with a wider gap where a thousands separator would otherwise go. The
	// grouping is drawn rather than formatted, so no locale supplies a separator character.
	const cells = $derived(
		[...String(Math.max(0, Math.trunc(value)))].map((digit, index, all) => ({
			digit,
			grouped: index > 0 && (all.length - index) % 3 === 0,
		})),
	);
</script>

<!-- The box and its optical alignment are in styles/app.css. The wider gap where a thousands
     separator would go is a ternary rather than a second class over the first: they are the same
     property in the same layer, and that order is not the author's to choose. See
     spec/architecture/css/migration.md. -->
<span class="value">
	{#each cells as cell, i (i)}
		<span class="value-cell w-4.5 {cell.grouped ? 'ml-[0.3125rem]' : 'ml-0.25'}">{cell.digit}</span>
	{/each}
</span>
