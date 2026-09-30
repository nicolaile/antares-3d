/**
 * The energy model shared by the renderer and its controls: where the pulses
 * are, how bright a point behind a head is, and what colour that brightness
 * maps to. Units are the diagram's own coordinates.
 */

export interface EnergyParams {
	/** Units per second. */
	speed: number;
	/** Trail length behind each head. */
	tail: number;
	/** How many pulses share the loop. */
	pulses: number;
	/** Width of the bright core. */
	core: number;
	/** Halo radius. */
	glow: number;
	/** Halo strength, 0..1. */
	glowAmount: number;
	/** Idle warmth inside every pipe, scaled by its temperature, 0..1. */
	ambient: number;
	/** Turbulence travelling with the flow, 0..1. */
	flicker: number;
	/** Glow filling the pipe's bore behind the core, 0..1. */
	fill: number;
	/** Light the passing energy throws on the pipe walls, 0..1. */
	wallLight: number;
	/** Sparks drifting through the flow, 0..1. */
	sparks: number;
	/** How far each pipe's temperature cools its colour towards grey, 0..1. */
	temperature: number;
}

/** Tuned for the R1 diagram, whose pipes are 27 units across. */
export const DEFAULT_PARAMS: EnergyParams = {
	speed: 230,
	tail: 610,
	pulses: 2,
	core: 3,
	glow: 6,
	glowAmount: 1,
	ambient: 0,
	flicker: 1,
	fill: 0.35,
	wallLight: 0.19,
	sparks: 0.31,
	temperature: 1
};

/** Multiplier on every line tier's weight. */
export const DEFAULT_LINE_WEIGHT = 0.5;

/** The line-art tiers, darkest to lightest. */
export type Tier = 'outline' | 'structure' | 'detail' | 'axes' | 'hatch';
export const TIERS: { key: Tier; label: string }[] = [
	{ key: 'outline', label: 'Outlines' },
	{ key: 'structure', label: 'Structure' },
	{ key: 'detail', label: 'Detail' },
	{ key: 'axes', label: 'Axes' },
	{ key: 'hatch', label: 'Hatching' }
];

/**
 * Each tier is one ink at its own opacity. `color: null` follows the stage's
 * ink token (near-black on light, white on dark); a hex overrides it.
 */
export type LineTone = { color: string | null; opacity: number };
export const DEFAULT_TONES: Record<Tier, LineTone> = {
	outline: { color: null, opacity: 0.38 },
	structure: { color: null, opacity: 0.32 },
	detail: { color: null, opacity: 0.23 },
	axes: { color: null, opacity: 0.2 },
	hatch: { color: null, opacity: 0.16 }
};

export const cloneTones = (t: Record<Tier, LineTone>) =>
	Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { ...v }])) as Record<Tier, LineTone>;

/** Where one route ends and the next begins: the pulse is inside a component. */
export const GAP = 120;

export type Theme = 'light' | 'dark';

type Stop = { x: number; rgb: [number, number, number]; a: number };

/**
 * Colour from the tail (0) to the head (1), fading out towards the tail. On
 * the light stage the heat stays orange. On dark every beam is the cool
 * white of the low-temperature pipes, whatever its temperature: grey at the
 * tail, white at the head — it reads because the glow adds light there
 * rather than covering.
 */
export const RAMPS: Record<Theme, Stop[]> = {
	light: [
		{ x: 0, rgb: [214, 58, 24], a: 0 },
		{ x: 0.35, rgb: [236, 70, 30], a: 0.45 },
		{ x: 0.7, rgb: [255, 117, 31], a: 0.9 },
		{ x: 1, rgb: [255, 132, 78], a: 1 }
	],
	dark: [
		{ x: 0, rgb: [150, 150, 158], a: 0 },
		{ x: 0.35, rgb: [196, 196, 204], a: 0.6 },
		{ x: 0.7, rgb: [228, 228, 234], a: 1 },
		{ x: 1, rgb: [255, 255, 255], a: 1 }
	]
};

/**
 * What a pipe's colour cools towards: the grey of gas that has given its
 * heat up. Warm-tinted on light so it still reads as the same material.
 */
export const COOL: Record<Theme, [number, number, number]> = {
	light: [168, 160, 156],
	dark: [196, 196, 204]
};

/** The marker dots' grey, for their flares; matches `--grey-400`. */
export const DOT_RGB: [number, number, number] = [172, 171, 173];

export interface Sampled {
	/** Flat x,y pairs every `step` units. */
	points: Float32Array;
	/** Loop-wide arc length at each point. */
	arcs: Float32Array;
	/** 1 where the point runs inside a drawn pipe, 0 where it crosses open space. */
	inPipe: Uint8Array;
	start: number;
	length: number;
}

export interface Network {
	/** The heat loop, in flow order. */
	routes: Sampled[];
	/** Loop length, including the gaps inside components. */
	total: number;
	/** Loop-wide arc of each marker. */
	dotArcs: number[];
}

export type DotPlacement = { on?: [route: number, at: number]; after?: number };

/**
 * Walk each route with the browser's own path geometry, so any path data
 * works unchanged. The SVG has to be attached to measure in every engine.
 */
export function sampleNetwork(routes: string[], pipes: string[], dots: DotPlacement[], step = 3): Network {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '0');
	svg.setAttribute('height', '0');
	svg.style.position = 'absolute';
	document.body.append(svg);

	// Where the drawn pipes run, hashed on a coarse grid, so each route point
	// can ask cheaply whether it sits inside one.
	const CELL = 6;
	const cells = new Map<string, number[]>();
	for (const d of pipes) {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		svg.append(path);
		const length = path.getTotalLength();
		for (let l = 0; l <= length; l += 2) {
			const p = path.getPointAtLength(l);
			const key = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
			(cells.get(key) ?? cells.set(key, []).get(key)!).push(p.x, p.y);
		}
	}
	const onPipe = (x: number, y: number) => {
		const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
		for (let i = -1; i <= 1; i++)
			for (let j = -1; j <= 1; j++) {
				const pts = cells.get(`${cx + i},${cy + j}`);
				if (!pts) continue;
				for (let k = 0; k < pts.length; k += 2) if (Math.hypot(pts[k] - x, pts[k + 1] - y) < 2.5) return true;
			}
		return false;
	};

	let cursor = 0;
	const sample = (d: string) => {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		svg.append(path);
		const length = path.getTotalLength();
		const n = Math.max(2, Math.ceil(length / step) + 1);
		const points = new Float32Array(n * 2);
		const arcs = new Float32Array(n);
		const inPipe = new Uint8Array(n);
		for (let i = 0; i < n; i++) {
			const l = (i / (n - 1)) * length;
			const p = path.getPointAtLength(l);
			points[i * 2] = p.x;
			points[i * 2 + 1] = p.y;
			arcs[i] = cursor + l;
			inPipe[i] = onPipe(p.x, p.y) ? 1 : 0;
		}
		const route = { points, arcs, inPipe, start: cursor, length };
		cursor += length + GAP;
		return route;
	};
	const sampled = routes.map(sample);
	svg.remove();

	const dotArcs = dots.map((d) => {
		if (d.on) return sampled[d.on[0]].start + d.on[1];
		const r = sampled[d.after ?? 0];
		return r.start + r.length + GAP * 0.5;
	});
	return { routes: sampled, total: cursor, dotArcs };
}

/** Distance between pulse heads along the loop. */
export const period = (net: Network, p: EnergyParams) => net.total / Math.max(1, Math.round(p.pulses));

/** A tail can't reach past the pulse ahead of it, or trails overlap. */
export const tailOf = (net: Network, p: EnergyParams) => Math.min(p.tail, period(net, p) * 0.95);

/** 0..1 flare on each marker, peaking as a head passes through it. Written into `out`: no allocation per frame. */
export function dotFlares(net: Network, p: EnergyParams, head: number, out: Float32Array) {
	const per = period(net, p);
	net.dotArcs.forEach((a, i) => (out[i] = Math.exp(-((((head - a) % per) + per) % per) / 140)));
	return out;
}
