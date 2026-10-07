/** How long an event ran, as a short word; an event still running has no end to measure to. */
export function took(started: string, finished: string | undefined): string {
	if (!finished) return '';
	const ms = Date.parse(finished) - Date.parse(started);
	if (Number.isNaN(ms) || ms < 0) return '';
	if (ms < 1000) return `${ms} ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
	const minutes = Math.floor(seconds / 60);
	return minutes < 60
		? `${minutes} min ${Math.round(seconds % 60)} s`
		: `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
