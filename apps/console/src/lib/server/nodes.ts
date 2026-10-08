/**
 * The nodes a reader can be handed to, and the order a reader tries them in, nearest first. See
 * spec/architecture/console.md, "Live, through the nearest node".
 */

/**
 * Each node at the airport or city its IATA code names, as latitude and longitude in degrees. With
 * nothing to go by, a reader tries them in this order: the three core nodes first, the ones at home
 * last. See platform's spec/architecture/relay.md.
 */
export const NODES = {
	tyo: [35.6762, 139.6503],
	gvx: [60.5933, 16.9513],
	buf: [42.9405, -78.7322],
	nrt: [35.772, 140.3929],
	hnd: [35.5494, 139.7798],
	bru: [50.9014, 4.4844],
	rdu: [35.8776, -78.7875],
	sha: [31.2304, 121.4737],
} as const satisfies Record<string, readonly [number, number]>;

export type Node = keyof typeof NODES;

const FIXED = Object.keys(NODES) as Node[];

/** Who goes first when Cloudflare knows the reader's continent and not where on it. */
const BY_CONTINENT: Readonly<Record<string, readonly Node[]>> = {
	AS: ['tyo', 'nrt', 'hnd', 'sha'],
	EU: ['gvx', 'bru'],
	NA: ['buf', 'rdu'],
};

/** Where Cloudflare says the reader is, spelled as `request.cf` spells it. */
export interface Whereabouts {
	readonly latitude?: string;
	readonly longitude?: string;
	readonly continent?: string;
}

const EARTH_KM = 6371;

/** The great-circle distance between two points, in kilometers. */
export function distance(
	[latitudeA, longitudeA]: readonly [number, number],
	[latitudeB, longitudeB]: readonly [number, number],
): number {
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const half =
		Math.sin(radians(latitudeB - latitudeA) / 2) ** 2 +
		Math.cos(radians(latitudeA)) *
			Math.cos(radians(latitudeB)) *
			Math.sin(radians(longitudeB - longitudeA) / 2) ** 2;
	return 2 * EARTH_KM * Math.asin(Math.sqrt(half));
}

/** Every node, nearest `where` first: by distance, else by continent, else in the fixed order. */
export function order(where: Whereabouts | undefined): Node[] {
	const reader = [
		Number.parseFloat(where?.latitude ?? ''),
		Number.parseFloat(where?.longitude ?? ''),
	] as const;
	if (reader.every(Number.isFinite)) {
		const away = (node: Node) => distance(reader, NODES[node]);
		return FIXED.toSorted((a, b) => away(a) - away(b));
	}
	const first = BY_CONTINENT[where?.continent ?? ''] ?? [];
	return [...first, ...FIXED.filter((node) => !first.includes(node))];
}
