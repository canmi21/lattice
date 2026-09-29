/** How long ago, as a status page says it: coarse, and never in the future. */
export function ago(then: number, clock: number): string {
	const seconds = Math.max(0, Math.round((clock - then) / 1000));
	if (seconds < 5) return 'just now';
	if (seconds < 60) return `${seconds} s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} h ago`;
	return `${Math.round(hours / 24)} days ago`;
}

export function percent(ratio: number): string {
	if (ratio === 1) return '100%';
	// Two decimals near the top, where the differences a reader cares about live.
	return `${(ratio * 100).toFixed(ratio >= 0.99 ? 2 : 1)}%`;
}

const clockTime = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

export function hourMinute(at: number): string {
	return clockTime.format(at);
}
