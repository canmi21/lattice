/**
 * The nodes on a globe, drawn by cobe in WebGL: a mark per node as the flat map draws it, turning
 * slowly unless the reader asked for less motion, and turned by dragging. The map imports this
 * module only when the globe is picked, so a page left flat ships no WebGL.
 */
import createGlobe, { type Marker } from 'cobe';
import type { Shown } from './marks.ts';

/** A place as the globe marks it: where it is, and its mark as the flat map has it (marks.ts). */
export interface Spot {
	readonly location: readonly [number, number];
	readonly radius: number;
	readonly opacity: number;
	readonly state: Shown;
}

export interface Globe {
	/** Marks the nodes again, as their states change. */
	mark(spots: readonly Spot[]): void;
	destroy(): void;
}

type Rgb = [number, number, number];

/** Where the globe faces first: over the Atlantic, the American and European nodes in view. */
const FACING = { latitude: 30, longitude: -30 };
/** Radians turned per frame, and per pixel dragged. */
const SPIN = 0.003;
const DRAG = 0.005;
/** cobe's marker size per unit of the flat map's radius, the middle step drawn at 0.03. */
const PER_RADIUS = 0.03 / 9.5;
/**
 * The sphere's own dark as `dark: 1` paints it: cobe has no marker opacity, so a faint mark is its
 * color mixed toward this.
 */
const SPHERE: Rgb = [0.04, 0.04, 0.04];
/** cobe 2 draws only when updated, and decodes its land texture after the first draw. */
const SETTLE_FRAMES = 30;

export function mount(host: HTMLElement, still: boolean): Globe {
	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'display:block;margin:0 auto;cursor:grab;touch-action:pan-y';
	host.appendChild(canvas);

	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	let phi = (3 * Math.PI) / 2 - radians(FACING.longitude);
	const theta = radians(FACING.latitude);
	let size = side(host);
	const ratio = Math.min(window.devicePixelRatio || 1, 2);
	fit(canvas, size);

	const globe = createGlobe(canvas, {
		devicePixelRatio: ratio,
		width: size,
		height: size,
		phi,
		theta,
		dark: 1,
		diffuse: 1.2,
		mapSamples: 16_000,
		mapBrightness: 3.5,
		baseColor: [0.22, 0.22, 0.22],
		markerColor: rgb('var(--color-text-faint)'),
		glowColor: [0.08, 0.08, 0.08],
		markerElevation: 0.01,
	});

	let frames = SETTLE_FRAMES;
	let dragged: number | undefined;
	let frame = requestAnimationFrame(function draw() {
		if (!still || dragged !== undefined || frames > 0) {
			if (!still && dragged === undefined) phi += SPIN;
			globe.update({ phi, theta });
			frames = Math.max(frames - 1, 0);
		}
		frame = requestAnimationFrame(draw);
	});

	const resize = new ResizeObserver(() => {
		size = side(host);
		fit(canvas, size);
		globe.update({ width: size, height: size });
		frames = SETTLE_FRAMES;
	});
	resize.observe(host);

	canvas.addEventListener('pointerdown', (event) => {
		dragged = event.clientX;
		canvas.setPointerCapture(event.pointerId);
		canvas.style.cursor = 'grabbing';
	});
	canvas.addEventListener('pointermove', (event) => {
		if (dragged === undefined) return;
		phi += (event.clientX - dragged) * DRAG;
		dragged = event.clientX;
	});
	const release = () => {
		dragged = undefined;
		canvas.style.cursor = 'grab';
		frames = 1;
	};
	canvas.addEventListener('pointerup', release);
	canvas.addEventListener('pointercancel', release);

	return {
		mark(spots) {
			const markers: Marker[] = spots.map(marks);
			globe.update({ markers });
			frames = 1;
		},
		destroy() {
			cancelAnimationFrame(frame);
			resize.disconnect();
			globe.destroy();
			const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
			context?.getExtension('WEBGL_lose_context')?.loseContext();
			host.replaceChildren();
		},
	};
}

/** A place as cobe's marker: blue, or red when gone, faded to the sphere as it runs less. */
function marks({ location, radius, opacity, state }: Spot): Marker {
	const color = rgb(state === 'gone' ? 'var(--color-danger)' : 'var(--color-primary)');
	return { location: [...location], size: radius * PER_RADIUS, color: mix(color, SPHERE, opacity) };
}

function mix([r, g, b]: Rgb, [r0, g0, b0]: Rgb, share: number): Rgb {
	return [r0 + (r - r0) * share, g0 + (g - g0) * share, b0 + (b - b0) * share];
}

/** The globe is round: as wide as the host is tall, or narrower when the host is. */
function side(host: HTMLElement): number {
	return Math.max(Math.floor(Math.min(host.clientWidth, host.clientHeight)), 1);
}

function fit(canvas: HTMLCanvasElement, size: number) {
	canvas.style.width = `${size}px`;
	canvas.style.height = `${size}px`;
}

const resolved = new Map<string, Rgb>();

/** A CSS color as cobe takes it, 0 to 1 a channel, read off a pixel so any color syntax works. */
function rgb(color: string): Rgb {
	const known = resolved.get(color);
	if (known) return known;
	const probe = document.createElement('span');
	probe.style.color = color;
	document.body.appendChild(probe);
	const computed = getComputedStyle(probe).color;
	probe.remove();
	const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!paint) return [1, 1, 1];
	paint.fillStyle = computed;
	paint.fillRect(0, 0, 1, 1);
	const [red = 255, green = 255, blue = 255] = paint.getImageData(0, 0, 1, 1).data;
	const value: Rgb = [red / 255, green / 255, blue / 255];
	resolved.set(color, value);
	return value;
}
