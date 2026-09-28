/**
 * The machine's own names made readable. A thermal zone is named by its driver -- `bigcore`, `ddr`
 * -- and a cluster by nothing at all; the metrics keep the kernel's words, and only what is shown
 * is renamed. See spec/architecture/meter.md, "Metrics".
 */
import type { Cluster } from './api';
import { frequency } from './format';

/** What each zone a driver names measures, as a person would say it. */
const ZONES: Record<string, string> = {
	package: 'Package',
	soc: 'SoC',
	cpu: 'CPU',
	center: 'Center',
	gpu: 'GPU',
	npu: 'NPU',
	vpu: 'VPU',
	ddr: 'Memory',
	nvme: 'NVMe',
	wifi: 'Wi-Fi',
};

/** Core zones, as `bigcore`, `littlecore0`: which cluster, and which of several. */
const CORES = /^(big|little|mid|middle)-?core-?(\d*)$/;

/**
 * What a driver's size word means, in the words cluster designs use for it: big.LITTLE's big cores
 * are built for speed and its little ones for efficiency, and a third tier sits between. The size
 * words themselves are never shown.
 */
const TIERS: Record<string, string> = {
	big: 'Performance',
	little: 'Efficiency',
	mid: 'Balanced',
	middle: 'Balanced',
};

/** A zone's name, `bigcore1` read as `Performance cores 1`. */
export function zoneLabel(zone: string): string {
	const known = ZONES[zone];
	if (known) return known;
	const cores = CORES.exec(zone);
	if (cores) {
		return `${TIERS[cores[1]!]} cores${cores[2] ? ` ${cores[2]}` : ''}`;
	}
	return zone
		.split('-')
		.map((word) => ZONES[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** The order zones are listed in: the whole chip, then its cores, then everything else by name. */
export function zoneOrder(a: string, b: string): number {
	const rank = (zone: string) =>
		['package', 'soc', 'cpu'].includes(zone)
			? 0
			: CORES.test(zone)
				? zone.startsWith('big')
					? 1
					: 2
				: 3;
	return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Each cluster's name by how fast it can run: none when there is one, or when all run as fast;
 * otherwise Efficiency up to Performance, and Balanced between.
 */
export function clusterNames(clusters: Cluster[]): (string | undefined)[] {
	const maxima = clusters.map((cluster) => cluster.max_frequency ?? 0);
	if (clusters.length < 2 || new Set(maxima).size < 2) return clusters.map(() => undefined);
	const ranked = [...new Set(maxima)].sort((a, b) => a - b);
	return maxima.map((max) => {
		const place = ranked.indexOf(max);
		if (place === 0) return TIERS.little;
		return place === ranked.length - 1 ? TIERS.big : TIERS.mid;
	});
}

/**
 * The clock as one line: a single frequency when every cluster runs at it, which is what most
 * machines show, and each cluster's named otherwise, the fastest first.
 */
export function clockLine(clusters: Cluster[], now: (first: number) => number | undefined): string {
	const readings = clusters
		.map((cluster, index) => ({ cluster, index, mhz: now(cluster.cores[0] ?? 0) }))
		.filter((reading): reading is typeof reading & { mhz: number } => reading.mhz !== undefined);
	if (readings.length === 0) return 'No frequency reported';
	if (new Set(readings.map((reading) => reading.mhz)).size === 1)
		return frequency(readings[0]!.mhz);
	const names = clusterNames(clusters);
	return readings
		.toSorted((a, b) => b.mhz - a.mhz)
		.map(
			(reading) =>
				`${names[reading.index] ?? `Cores ${reading.cluster.cores.join(', ')}`} ${frequency(reading.mhz)}`,
		)
		.join(' · ');
}
