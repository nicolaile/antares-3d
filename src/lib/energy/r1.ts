/**
 * The R1 power-conversion diagram as vector data.
 *
 * Coordinates are pixels of the reference render
 * (`$lib/assets/images/line-diagram.jpg`, 1930×1284), so any part can be
 * checked against it directly. Pipes are centrelines — their walls are
 * generated (see `pipes.ts`) and the same centrelines carry the energy.
 *
 * Lines come in three tiers, like a technical drawing, so depth reads from
 * weight and tone alone:
 *  - outline: each component's silhouette, darkest and heaviest;
 *  - structure: everything that describes the parts and the pipes;
 *  - detail: section hatching, wall offsets, fins, clamps — lightest.
 * Centre lines and hidden lines are detail with their own dash patterns.
 */
import type { Pipe } from './pipes';
import { MACHINES, SILHOUETTES } from './r1-machines';

export const FRAME = { width: 1930, height: 1284 };

export const PIPES: Record<string, Pipe> = {
	/** Heat pipe out of the dome, over the top and into the turbine inlet. */
	hot: { points: [[439.5, 347], [439.5, 227.5], [945, 227.5], [945, 354]], radius: 40 },
	/** Turbine exhaust round to the recuperator's hot side. */
	exhaust: { points: [[885, 509], [818.5, 509], [818.5, 866.25], [932, 866.25]], radius: 40 },
	/** Recuperator to the cooler. */
	cooler: { points: [[1140, 866.25], [1407, 866.25]], radius: 40 },
	/** Cooler round the right-hand loop into the compressor. */
	loop: { points: [[1703, 866.25], [1765.5, 866.25], [1765.5, 669.5], [1234, 669.5], [1234, 607]], radius: 40 },
	/** Compressor down the S-bend into the recuperator's cold side. */
	s: { points: [[1095.5, 661], [1095.5, 719.5], [1197.5, 719.5], [1197.5, 806.5], [1132, 806.5]], radius: [40, 42, 42] },
	/** Recuperator under everything and back into the reactor. */
	return: {
		points: [[1132, 921.75], [1197.75, 921.75], [1197.75, 1008.75], [710.5, 1008.75], [710.5, 504.5], [616, 504.5]],
		radius: [42, 42, 40, 40]
	},
	/** Reactor to the storage tank. Not part of the power cycle, so no energy runs here. */
	drain: { points: [[269, 801.75], [169.5, 801.75], [169.5, 1084.25], [269, 1084.25]], radius: 34 }
};

/**
 * The heat, in flow order round the Brayton cycle. Mostly the pipes
 * themselves; the first starts low in the core so the heat visibly rises out
 * of the reactor, and the exhaust runs on into the recuperator core.
 */
export const ROUTES: Pipe[] = [
	{ ...PIPES.hot, points: [[439.5, 890], ...PIPES.hot.points.slice(1)] },
	{ ...PIPES.exhaust, points: [...PIPES.exhaust.points.slice(0, -1), [965, 866.25]] },
	PIPES.cooler,
	PIPES.loop,
	PIPES.s,
	PIPES.return
];

/**
 * Labelled markers. `on` sits along a route (arc length from its start);
 * `after` sits in the component a route runs into. Each flares as a pulse
 * passes — the alternator with the turbine that drives it.
 */
export interface Marker {
	label: string;
	x: number;
	y: number;
	on?: [route: number, at: number];
	after?: number;
}
export const MARKERS: Marker[] = [
	{ label: 'Primary heat exchanger', x: 438.6, y: 377.5, on: [0, 890 - 377.5] },
	{ label: 'Nuclear core', x: 439, y: 802, on: [0, 88] },
	{ label: 'Turbine', x: 918.2, y: 507.8, after: 0 },
	{ label: 'Compressor', x: 1160.6, y: 507.8, after: 3 },
	{ label: 'Alternator', x: 1521, y: 507.8, after: 0 },
	{ label: 'Recuperator', x: 1037, y: 866, after: 1 },
	{ label: 'Waste heat rejection', x: 1585, y: 858, after: 2 }
];

const rods = (xs: number[], from: number, to: number) => xs.map((x) => `M${x} ${from}V${to}`);
const rows = (ys: number[], from: number, to: number) => ys.map((y) => `M${from} ${y}H${to}`);
const range = (from: number, to: number, step: number) =>
	Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** A clamp band across a straight pipe run: two short lines just past the walls. */
function clamp(x: number, y: number, along: 'h' | 'v') {
	const r = 17;
	return along === 'h'
		? `M${x - 3} ${y - r}V${y + r}M${x + 3} ${y - r}V${y + r}`
		: `M${x - r} ${y - 3}H${x + r}M${x - r} ${y + 3}H${x + r}`;
}

/** Silhouettes: the darkest, heaviest lines. */
export const OUTLINES = [
	// Reactor housing, broken where the heat pipe leaves through the top.
	'M261 635V317A22 22 0 0 1 283 295H426',
	'M453 295H594A22 22 0 0 1 616 317V635',
	'M348 401V394A91 48 0 0 1 530 394V401',
	'M251 635H627V647H251Z',
	'M269 647V956M609 647V956',
	'M252 956H627V969H252Z',
	'M285 1019H593A16 16 0 0 1 609 1035V1133A16 16 0 0 1 593 1149H285A16 16 0 0 1 269 1133V1035A16 16 0 0 1 285 1019Z',
	// Recuperator shell.
	'M932 852.75A8 8 0 0 0 940 844.75V788A20 20 0 0 1 960 768H1112A20 20 0 0 1 1132 788V792',
	'M932 879.75A8 8 0 0 1 940 887.75V940A20 20 0 0 0 960 960H1112A20 20 0 0 0 1132 940V935',
	...SILHOUETTES
];

/** Everything that describes the parts. Pipe walls join these at draw time. */
export const STRUCTURE = [
	// Flange, core body and rods.
	'M323 417V401H348M530 401H555V417H323',
	'M348 417V598M530 417V598',
	...rods([363, 376, 391, 404, 418, 459, 474, 487, 502, 515], 417, 598),
	// The two central rods run on through the stepped block: the heat channel.
	...rods([432, 446], 417, 635),
	'M323 635V624H340V598H432M446 598H538V624H555V635',
	'M272 635V579H348M530 579H606V635',
	// Fuel box and its tabs.
	'M289 710H588V895H289Z',
	...rods([356, 384, 411.5, 466, 494, 522], 598, 895),
	'M308 710V697H320V710M558 710V697H570V710',
	'M308 895V908H320V895M558 895V908H570V895',
	// Tank filler cap.
	'M305 998H348V1009H305Z',
	'M311 1009V1019M341.5 1009V1019',
	// Recuperator: the inner channel the compressed flow takes, and the core.
	'M1132 792H974A9 9 0 0 0 965 801V926A9 9 0 0 0 974 935H1132',
	'M965 820H1132M965 908H1132',
	'M1132 820V844.75A8 8 0 0 0 1140 852.75M1140 879.75A8 8 0 0 0 1132 887.75V908',
	...rods([981, 992, 1003, 1014, 1025, 1036, 1047.5, 1059, 1070, 1081, 1091.5, 1108], 820, 908),
	...MACHINES
];

/** The lightest tier: what a section drawing adds once the parts are there. */
export const DETAIL = [
	// Reactor wall thickness, broken where pipes pass through.
	'M269 635V317A14 14 0 0 1 283 303H426',
	'M453 303H594A14 14 0 0 1 608 317V491M608 518V635',
	'M356 401V394A83 40 0 0 1 426 354.5M453 354.5A83 40 0 0 1 522 394V401',
	// Fuel box spacer grids.
	...rows([772, 833], 289, 588),
	// Tank wall and seams, broken where the drain enters.
	'M276 1070.5V1035A9 9 0 0 1 285 1026H593A9 9 0 0 1 602 1035V1133A9 9 0 0 1 593 1142H285A9 9 0 0 1 276 1133V1098',
	...rods([360, 518], 1026, 1142),
	// Recuperator plates between the fins.
	...rods([973, 986.5, 997.5, 1008.5, 1019.5, 1030.5, 1041.75, 1053.25, 1064.5, 1075.5, 1086.25, 1099.75, 1120], 820, 908),
	// Radiator fins along the waste-heat cooler.
	...rods(range(1480, 1690, 14), 826, 890),
	// Pipe clamps on the long straight runs.
	clamp(620, 227.5, 'h'),
	clamp(790, 227.5, 'h'),
	clamp(818.5, 700, 'v'),
	clamp(710.5, 700, 'v'),
	clamp(710.5, 860, 'v'),
	clamp(880, 1008.75, 'h'),
	clamp(1060, 1008.75, 'h'),
	clamp(1280, 866.25, 'h'),
	clamp(1420, 669.5, 'h'),
	clamp(1620, 669.5, 'h'),
	clamp(1765.5, 770, 'v'),
	clamp(169.5, 945, 'v')
];

/** Parts behind other parts: dashed. */
export const HIDDEN = [...rods([356, 384, 411.5, 466, 494, 522], 895, 956)];

/** Axes of symmetry: dash-dot. */
export const CENTRES = ['M439 175V990'];

/** Cut faces, hatched. `dense` is for windings rather than solid metal. */
export const HATCH: { x: number; y: number; w: number; h: number; dense?: boolean }[] = [
	{ x: 251, y: 635, w: 376, h: 12 },
	{ x: 252, y: 956, w: 375, h: 13 },
	{ x: 323, y: 401, w: 25, h: 16 },
	{ x: 530, y: 401, w: 25, h: 16 },
	{ x: 305, y: 998, w: 43, h: 11 },
	{ x: 1452, y: 441, w: 135, h: 35, dense: true },
	{ x: 1452, y: 536, w: 135, h: 33, dense: true }
];
