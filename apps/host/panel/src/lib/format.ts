/** Numbers as a person reads them on this panel: bytes in binary units, spans in their largest. */

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

export function bytes(value: number, digits = 1): string {
	let unit = 0;
	while (Math.abs(value) >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(unit === 0 ? 0 : digits)} ${UNITS[unit]}`;
}

/** A span of seconds as its two largest units: `3d 4h`, `5h 12m`, `42s`. */
export function span(seconds: number): string {
	const parts: [number, string][] = [
		[Math.floor(seconds / 86400), 'd'],
		[Math.floor((seconds % 86400) / 3600), 'h'],
		[Math.floor((seconds % 3600) / 60), 'm'],
		[Math.floor(seconds % 60), 's'],
	];
	const first = parts.findIndex(([count]) => count > 0);
	if (first === -1) return '0s';
	return parts
		.slice(first, first + 2)
		.filter(([count]) => count > 0)
		.map(([count, unit]) => `${count}${unit}`)
		.join(' ');
}

/** MHz as GHz once it is one. */
export function frequency(megahertz: number): string {
	return megahertz >= 1000
		? `${(megahertz / 1000).toFixed(2)} GHz`
		: `${Math.round(megahertz)} MHz`;
}
