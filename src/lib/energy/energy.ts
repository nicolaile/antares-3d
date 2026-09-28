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
	/** Constant faint warmth along every route, 0..1. */
	ambient: number;
	/** Turbulence travelling with the flow, 0..1. */
	flicker: number;
}

/** Tuned for the R1 diagram, whose pipes are 27 units across. */
export const DEFAULT_PARAMS: EnergyParams = {
	speed: 230,
	tail: 610,
	pulses: 2,
	core: 4,
	glow: 4,
	glowAmount: 1,
	ambient: 0,
	flicker: 1
};

/** Multiplier on every line tier's weight. */
export const DEFAULT_LINE_WEIGHT = 0.65;

/** Head length that fades in, so the front is rounded rather than a hard cut. */
export const FRONT = 20;

/** Where one route ends and the next begins: the pulse is inside a component. */
export const GAP = 120;

export type Theme = 'light' | 'dark';

type Stop = { x: number; rgb: [number, number, number]; a: number };

/**
 * Colour from the tail (0) to the head (1), fading out towards the tail. On
 * the light stage the heat stays orange; on dark it runs up to white-hot,
 * which only reads because the glow adds light there rather than covering.
 */
export const RAMPS: Record<Theme, Stop[]> = {
	light: [
		{ x: 0, rgb: [214, 58, 24], a: 0 },
		{ x: 0.35, rgb: [236, 70, 30], a: 0.45 },
		{ x: 0.7, rgb: [251, 80, 36], a: 0.9 },
		{ x: 1, rgb: [255, 132, 78], a: 1 }
	],
	dark: [
		{ x: 0, rgb: [122, 26, 12], a: 0 },
		{ x: 0.35, rgb: [194, 54, 28], a: 0.6 },
		{ x: 0.7, rgb: [255, 106, 46], a: 1 },
		{ x: 1, rgb: [255, 241, 220], a: 1 }
	]
};

/** The accent, for marker flares; matches `--accent-500`. */
export const DOT_RGB: [number, number, number] = [251, 80, 36];

export interface Sampled {
	/** Flat x,y pairs every `step` units. */
	points: Float32Array;
	/** Loop-wide arc length at each point. */
	arcs: Float32Array;
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
export function sampleNetwork(routes: string[], dots: DotPlacement[], step = 3): Network {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '0');
	svg.setAttribute('height', '0');
	svg.style.position = 'absolute';
	document.body.append(svg);

	let cursor = 0;
	const sample = (d: string) => {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		svg.append(path);
		const length = path.getTotalLength();
		const n = Math.max(2, Math.ceil(length / step) + 1);
		const points = new Float32Array(n * 2);
		const arcs = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const l = (i / (n - 1)) * length;
			const p = path.getPointAtLength(l);
			points[i * 2] = p.x;
			points[i * 2 + 1] = p.y;
			arcs[i] = cursor + l;
		}
		const route = { points, arcs, start: cursor, length };
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

/** 0..1 flare on each marker, peaking as a head passes through it. */
export function dotFlares(net: Network, p: EnergyParams, head: number): number[] {
	const per = period(net, p);
	return net.dotArcs.map((a) => Math.exp(-((((head - a) % per) + per) % per) / 140));
}
