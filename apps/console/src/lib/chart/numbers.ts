/**
 * Figures as the charts say them. The locale is fixed rather than the reader's: the server renders
 * the first paint, and a figure written two ways would differ between it and the browser.
 */

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const short = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** `1,284` under ten thousand, `12.9K` and `4.2M` above it. */
export function compact(value: number): string {
	if (!Number.isFinite(value)) return '';
	return Math.abs(value) < 10_000 ? grouped.format(value) : short.format(value);
}

/** A share from 0 to 1 as a whole percentage, or one decimal under ten. */
export function percent(share: number): string {
	if (!Number.isFinite(share)) return '';
	const value = share * 100;
	if (value === 0 || Math.abs(value) >= 10) return `${Math.round(value)}%`;
	return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

/** A change with its sign always written: `+4.2`, `-12`, `0`. */
export function signed(value: number, format: (value: number) => string = compact): string {
	if (value > 0) return `+${format(value)}`;
	if (value < 0) return `-${format(-value)}`;
	return format(0);
}

/** A length of time in seconds, in its two largest units: `420 ms`, `4.2 s`, `3 min 4 s`. */
export function duration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '';
	if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
	if (seconds < 10) return `${seconds.toFixed(1).replace(/\.0$/, '')} s`;
	if (seconds < 60) return `${Math.round(seconds)} s`;
	const whole = Math.round(seconds);
	const [large, small, big, little] =
		whole < 3600
			? [Math.floor(whole / 60), whole % 60, 'min', 's']
			: whole < 86_400
				? [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), 'h', 'min']
				: [Math.floor(whole / 86_400), Math.floor((whole % 86_400) / 3600), 'd', 'h'];
	return small ? `${large} ${big} ${small} ${little}` : `${large} ${big}`;
}
