/**
 * The flat map turning into a globe and back, drawn on a canvas in the plot's own units. Every dot
 * of land and every mark has a place on the flat map and one on an orthographic globe, and is drawn
 * at `t` of the way between them, 0 flat and 1 round; on the globe a dot fades as it nears the edge
 * and one turned away fades out where it stood, so the sphere is its dots and a hairline, with no
 * glow to show a seam against the card. Loaded only when the globe is asked for. See
 * spec/console/overview.md, "The globe is the flat map turned round".
 */
import { DOT, DOTS, HEIGHT, PITCH, PROJECTION, WIDTH } from './land.generated.ts';

/** A place as `[latitude, longitude]`, in degrees, as land.generated.ts writes a node's. */
export type Location = readonly [number, number];

/** Where something is drawn in the plot's units, and how much of it shows. */
export interface Placed {
	readonly x: number;
	readonly y: number;
	readonly alpha: number;
}

/** The globe's middle and radius: the plot's height, a hair inside it for the ring. */
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RADIUS = (HEIGHT / 2) * 0.96;
/** How far north the globe is tipped toward the reader, in degrees. */
const TILT = 15;
/** Where on the globe a dot starts to fade, as a share of the quarter turn to its edge. */
const FADE = 0.7;
/** A dot's side on the globe: a little under the flat map's, the round land being denser. */
const ROUND_DOT = 3;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The location a point on the plot stands for: d3's `geoMercator` at the plot's scale, undone. */
function unflat(x: number, y: number): Location {
	const [tx, ty] = PROJECTION.translate;
	const longitude = (x - tx) / PROJECTION.scale;
	const latitude = 2 * Math.atan(Math.exp((ty - y) / PROJECTION.scale)) - Math.PI / 2;
	return [degrees(latitude), degrees(longitude)];
}

/**
 * Where `location` is on a globe turned to face `facing` degrees of longitude and tipped `TILT`
 * north, and how far round from its middle it is, 0 at the middle and 1 at the edge.
 */
function round([latitude, longitude]: Location, facing: number) {
	const phi = radians(latitude);
	const lambda = radians(longitude - facing);
	const tilt = radians(TILT);
	const cosine = Math.cos(phi) * Math.cos(lambda);
	const near = Math.sin(tilt) * Math.sin(phi) + Math.cos(tilt) * cosine;
	return {
		x: CX + RADIUS * Math.cos(phi) * Math.sin(lambda),
		y: CY - RADIUS * (Math.cos(tilt) * Math.sin(phi) - Math.sin(tilt) * cosine),
		away: Math.acos(Math.max(-1, Math.min(1, near))) / (Math.PI / 2),
	};
}

/** How much of a dot `away` from the middle shows: whole, then fading to none at its rim. */
function shown(away: number): number {
	if (away >= 1) return 0;
	return away < FADE ? 1 : 1 - (away - FADE) / (1 - FADE);
}

/** `from` toward `to`, `t` of the way. */
const toward = (from: number, to: number, t: number) => from + (to - from) * t;

/** Where something at `location`, drawn at `point` on the flat map, is at `t` of the way round. */
export function place(
	location: Location,
	point: readonly [number, number],
	t: number,
	facing: number,
): Placed {
	const on = round(location, facing);
	if (on.away >= 1) return { x: point[0], y: point[1], alpha: 1 - t };
	return {
		x: toward(point[0], on.x, t),
		y: toward(point[1], on.y, t),
		alpha: toward(1, shown(on.away), t),
	};
}

/** A dot of land: its middle on the flat map, and the place it stands for. */
interface Dot {
	readonly point: readonly [number, number];
	readonly location: Location;
}

/** The dots `DOTS` dashes each run into, as the flat map draws it: `DOT` wide, `PITCH` apart. */
function dots(): Dot[] {
	const out: Dot[] = [];
	for (const [, x, y, length] of DOTS.matchAll(/M(-?[\d.]+) (-?[\d.]+)h([\d.]+)/g)) {
		const [start, row, run] = [Number(x), Number(y), Number(length)];
		for (let at = 0; at + DOT <= run + 0.001; at += PITCH) {
			const middle = start + at + DOT / 2;
			out.push({ point: [middle, row], location: unflat(middle, row) });
		}
	}
	return out;
}

/** Exported for ./globe.test.ts to hold against the flat map's own dots. */
export const LAND = dots();

/** The colors the canvas is painted in, read off the page, so a switch of theme repaints it. */
export interface Paint {
	readonly land: string;
	readonly ring: string;
}

/** The land and the globe's ring at `t` of the way round, the globe facing `facing`. */
export function draw(context: CanvasRenderingContext2D, t: number, facing: number, paint: Paint) {
	context.clearRect(0, 0, WIDTH, HEIGHT);
	if (t > 0.001) {
		context.globalAlpha = t;
		context.beginPath();
		context.arc(CX, CY, RADIUS, 0, 2 * Math.PI);
		context.strokeStyle = paint.ring;
		context.lineWidth = 1.5;
		context.stroke();
	}
	const side = toward(DOT, ROUND_DOT, t);
	const half = side / 2;
	context.fillStyle = paint.land;
	for (const dot of LAND) {
		const at = place(dot.location, dot.point, t, facing);
		if (at.alpha <= 0.01) continue;
		context.globalAlpha = at.alpha;
		context.fillRect(at.x - half, at.y - half, side, side);
	}
	context.globalAlpha = 1;
}
