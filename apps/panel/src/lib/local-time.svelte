<script lang="ts">
	/**
	 * A moment in the reader's own zone. The server (and the browser, before it has mounted) show
	 * `stamp`'s UTC marker, which is the same string wherever it is computed; once mounted, the
	 * browser swaps in its own zone. Avoids the hydration mismatch a `toLocaleString` shown on both
	 * sides would cause, since the server's zone is not the reader's. See spec/architecture/cron.md,
	 * "Every time is UTC.".
	 */
	import { utcMarker } from './format';

	let { stamp }: { stamp: string } = $props();

	const utc = $derived(utcMarker(stamp));
	/** Set only in the browser, once mounted; the UTC marker shows until then. */
	let local = $state<string | undefined>();

	// Effects run only in the browser, after mount, and again whenever `stamp` changes -- a poll
	// refreshing `job.next` moves this along with it.
	$effect(() => {
		local = new Date(stamp).toLocaleString();
	});
</script>

<span title={stamp}>{local ?? utc}</span>
