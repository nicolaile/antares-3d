#!/usr/bin/env node
// First-pass tags for the tagging tool (/cad/tag), worked out from geometry.
//
//   node scripts/auto-tag-cad.mjs mark-0 [--force]
//   node scripts/auto-tag-cad.mjs mark-0 --families   (print the part families and stop)
//
// Reads static/models/cad/<model>.parts.glb, writes scripts/cad-tags/<model>.json
// (refusing to overwrite hand-made tags without --force), and prints which
// part families went where. Review the result in the tool: these are best
// guesses from shape and position, not an engineer's parts list.
//
// How it works: every part is measured (bounds, centroid, area, volume,
// colour), identical parts are grouped into families, and per-model rules
// below assign parts using where they sit relative to the reactor's axis
// and what their family looks like. The CAD carries no usable names, so
// position and repetition are the only evidence; the rules record what
// each family was identified as, checked against the product videos.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const [, , MODEL, FLAG] = process.argv;
const RULES = { 'mark-0': markZero, 'power-conversion-system': powerConversion };
if (!RULES[MODEL]) {
	console.error(`usage: auto-tag-cad.mjs <${Object.keys(RULES).join('|')}> [--force]`);
	process.exit(1);
}
const SOURCES = { 'mark-0': 'Mark-0.stp', 'power-conversion-system': 'Power Conversion System.stp' };
const IN = `static/models/cad/${MODEL}.parts.glb`;
const OUT = `scripts/cad-tags/${MODEL}.json`;
if (existsSync(OUT) && !FLAG) {
	console.error(`${OUT} exists (tags may be hand-made). Re-run with --force to replace it.`);
	process.exit(1);
}

// ---- Measure ---------------------------------------------------------------

await MeshoptDecoder.ready;
const io = new NodeIO()
	.registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
	.registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(IN);

const mul = (m, [x, y, z]) => [
	m[0] * x + m[4] * y + m[8] * z + m[12],
	m[1] * x + m[5] * y + m[9] * z + m[13],
	m[2] * x + m[6] * y + m[10] * z + m[14]
];

/**
 * @typedef {{ id: string, min: number[], max: number[], size: number[], c: number[], r: number,
 *   tris: number, area: number, vol: number, colour: string, fam?: Family, group?: string }} Part
 * @typedef {{ parts: Part[], n: number }} Family
 */
/** @type {Part[]} */
const parts = [];
for (const node of doc.getRoot().listNodes()) {
	const id = node.getName();
	if (!/^p\d{5}(-\d+)?$/.test(id)) continue;
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	const c = [0, 0, 0];
	const colours = {};
	let tris = 0;
	let area = 0;
	let vol = 0;
	const stack = [node];
	while (stack.length) {
		const n = stack.pop();
		stack.push(...n.listChildren());
		const mesh = n.getMesh();
		if (!mesh) continue;
		const m = n.getWorldMatrix();
		for (const prim of mesh.listPrimitives()) {
			const pos = prim.getAttribute('POSITION');
			const idx = prim.getIndices();
			const V = [];
			const e = [0, 0, 0];
			for (let i = 0; i < pos.getCount(); i++) {
				const v = mul(m, pos.getElement(i, e));
				V.push(v);
				for (let k = 0; k < 3; k++) {
					if (v[k] < min[k]) min[k] = v[k];
					if (v[k] > max[k]) max[k] = v[k];
				}
			}
			const count = idx ? idx.getCount() : V.length;
			let pa = 0;
			for (let k = 0; k < count; k += 3) {
				const a = V[idx ? idx.getScalar(k) : k];
				const b = V[idx ? idx.getScalar(k + 1) : k + 1];
				const d = V[idx ? idx.getScalar(k + 2) : k + 2];
				const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
				const ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
				const t = Math.hypot(ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]) / 2;
				pa += t;
				for (let j = 0; j < 3; j++) c[j] += (t * (a[j] + b[j] + d[j])) / 3;
				vol +=
					(a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6;
			}
			tris += count / 3;
			area += pa;
			const col = prim.getMaterial()?.getBaseColorFactor() ?? [0, 0, 0];
			const hex = col.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
			colours[hex] = (colours[hex] ?? 0) + pa;
		}
	}
	for (let j = 0; j < 3; j++) c[j] /= area || 1;
	const size = [0, 1, 2].map((k) => max[k] - min[k]);
	const colour = Object.entries(colours).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
	parts.push({ id, min, max, size, c, r: Math.hypot(c[0], c[2]), tris, area, vol: Math.abs(vol), colour });
}

// ---- Families: identical parts, wherever and however they're placed --------

const near = (a, b, t) => Math.abs(a - b) <= t * Math.max(a, b, 1e-12);
/** @type {Family[]} */
const families = [];
for (const p of [...parts].sort((a, b) => a.area - b.area)) {
	const f = families
		.slice(-40)
		.reverse()
		.find(({ parts: [q] }) => near(p.area, q.area, 0.01) && near(p.vol, q.vol, 0.03) && near(p.tris, q.tris, 0.15));
	if (f) f.parts.push(p);
	else families.push({ parts: [p], n: 0 });
}
for (const f of families) {
	f.n = f.parts.length;
	for (const p of f.parts) p.fam = f;
}

if (FLAG === '--families') {
	const f2 = (v) => v.toFixed(2);
	const span = (vs) => `${f2(Math.min(...vs))}–${f2(Math.max(...vs))}`;
	console.log(`${parts.length} parts in ${families.length} families (by total area)`);
	for (const f of [...families].sort((a, b) => b.n * b.parts[0].area - a.n * a.parts[0].area)) {
		const q = f.parts[0];
		const c = (k) => span(f.parts.map((p) => p.c[k]));
		console.log(
			`n=${String(f.n).padStart(4)} #${q.colour} ${q.size.map((v) => v.toFixed(3)).join('×').padEnd(20)} vol ${q.vol.toExponential(1)}  x ${c(0)}  y ${c(1)}  z ${c(2)}  ${q.id}`
		);
	}
	process.exit(0);
}

// ---- Rules -----------------------------------------------------------------

const maxDim = (p) => Math.max(...p.size);

/**
 * Mark-0, Y-up, metres, the reactor's axis on x = z = 0. Seen in plan
 * (a horizontal cut through the core): a hexagonal graphite core of 26
 * columns, ringed by 12 control drums Ø0.40 m on a 0.83 m circle, with the
 * radial reflector filling between them, all inside the shield vessel. The
 * drive mechanisms stand on top, one above each drum.
 */
function markZero() {
	const CORE_R = 0.58; // the hex core's centroids sit inside this radius
	const CORE_Y = [0.15, 2.45]; // bottom reflector to top reflector
	const TOP = 2.45; // above the core: drive mechanisms, heat pipe heads
	const DRUM_R = 0.19; // just inside the drums' 0.20 m radius

	// The drum axes, from the drum body segments: Ø0.40 m blocks centred
	// on the 0.83 m circle, six layers of twelve.
	const axes = [];
	for (const p of parts) {
		if (Math.abs(p.r - 0.83) > 0.02 || Math.abs(Math.max(p.size[0], p.size[2]) - 0.4) > 0.02 || p.vol < 0.01) continue;
		if (!axes.some((a) => Math.hypot(a[0] - p.c[0], a[1] - p.c[2]) < 0.05)) axes.push([p.c[0], p.c[2]]);
	}
	if (axes.length !== 12) throw new Error(`expected 12 control drums, found ${axes.length}`);
	const drumDistance = (p) => Math.min(...axes.map((a) => Math.hypot(a[0] - p.c[0], a[1] - p.c[2])));

	for (const p of parts) {
		// Plates spanning the vessel (the core support plate, ~2 m) are
		// centred near the axis too, but belong to the vessel.
		const inCore = p.r < CORE_R && p.c[1] > CORE_Y[0] && p.c[1] < CORE_Y[1] && maxDim(p) < 1.0;
		// Pins, bolts, nuts and washers: small, and repeated by the dozen.
		// Inside the core the small repeats are the fuel channel plugs: kept.
		if (!inCore && p.fam.n >= 24 && p.vol < 5e-5 && maxDim(p) < 0.2) p.group = 'remove';
		// One per core column (26; 25 where the centre column differs).
		else if ((p.fam.n === 26 || p.fam.n === 25) && p.r < 0.55) p.group = 'f4_heatpipes';
		// Hex blocks, their fuel plugs, the top and bottom reflector blocks
		// and the instrument tube on the axis.
		else if (inCore || (p.r < 0.05 && p.c[1] > CORE_Y[0] && p.c[1] < TOP && maxDim(p) < 1.0)) p.group = 'f3_core';
		// Drum bodies, the boron carbide absorber rods inside them, their
		// shafts and bearings, and the drive stacks above: anything centred
		// within a drum's footprint, plus the twelve-fold kit on top.
		// (The size cap keeps out the shield's half-rings, whose centre of
		// mass happens to land on the drum circle.)
		else if (
			maxDim(p) < 1.0 &&
			(drumDistance(p) < DRUM_R || (p.c[1] > TOP && p.fam.n % 12 === 0 && p.r > 0.6 && p.r < 1.15))
		)
			p.group = 'f2_reactivity';
		// The shield vessel and what's fixed to it: the outer shell
		// quarters, plates and rings, lifting lugs, base plate.
		else if (p.r >= 1.0 || maxDim(p) > 1.0 || p.c[1] < CORE_Y[0]) p.group = 'f1_cradle';
		// Left in as context: the radial reflector blocks between core and drums.

		// The drive mechanisms on the deck, above the drums: their own group.
		// The systems page shows Mark-0 whole with them, then docks the
		// exchanger where they stand and they go (see SystemScene's `dock`).
		if (p.group === 'f2_reactivity' && p.c[1] > TOP) p.group = 'f2_drives';
	}
	// No primary heat exchanger in this export: the heat pipes stop at
	// their heads above the core. It's in the power conversion system.
}

/**
 * Power Conversion System, Y-up, metres. Two zones: around x = z = 0 a tall
 * domed vessel on a stand, holding a bundle of 180 thin tubes 1.73 m long
 * (the heat pipes' upper ends under the exchanger's dome, as the full video
 * shows them), and
 * on the skid at z < −1 the rest of the Brayton loop: the horizontal
 * pressure vessel on saddles (recuperator or turbo-alternator housing), the
 * finned cooler at the far end, and the piping and valves between. There is
 * no electrical cabinet in this export, so Power Management stays empty.
 */
function powerConversion() {
	const xz = (p, x, z) => Math.hypot(p.c[0] - x, p.c[2] - z);
	for (const p of parts) {
		const [thin, mid, long] = [...p.size].sort((a, b) => a - b);
		// The skid frame: 3" square tube members, and the channels and
		// plates along the base. Pipes are round, at standard pipe sizes.
		const frame =
			(long > 1.2 && Math.abs(thin - 0.076) < 0.004 && Math.abs(mid - 0.076) < 0.004) || (p.c[1] < 0.35 && long > 0.8);
		if (p.vol < 3e-5 && maxDim(p) < 0.15 && p.fam.n >= 2) p.group = 'remove';
		// The thin vertical tubes in the vessel are the heat pipes' upper,
		// condensing ends: the full video runs the heat pipes up from the
		// core through this bundle to the dome.
		else if (xz(p, 0, 0) < 0.75 && p.c[1] > 1.75 && Math.max(p.size[0], p.size[2]) < 0.05 && p.size[1] > 0.3)
			p.group = 'f4_heatpipes';
		// The vessel from its bottom flange (≈1.8 m) up: shell, header,
		// dome and outlet elbow.
		else if (xz(p, 0, 0) < 0.75 && p.c[1] > 1.75) p.group = 'f5_phx';
		// The exchanger's stand and the boxes on it, all below the vessel. The
		// systems page stacks the exchanger on the reactor (see SystemScene),
		// which stands here instead, so it leaves them out; the landing shows
		// the system on its own, standing on them (`standalone`). Not the down
		// pipe's run beside it (its flanges, bolts and elbow, within 0.3 m of
		// its axis), or half a flange's bolts go with the stand.
		else if (xz(p, 0, 0) < 1.3 && p.max[1] < 2.6 && xz(p, 0.56, -1.27) > 0.3) p.group = 'standalone';
		else if (frame) continue;
		// Skid fittings that would sit inside the stacked column's shield:
		// left out of the stack, kept standing alone (`standalone`). Not the
		// outlet run above the dome (the crossover from the dome's elbow to
		// the down pipe, ≈4.5 m up): the gas runs through it.
		else if (xz(p, 0, 0) < 1.15 && p.c[1] < 4.3) p.group = 'standalone';
		else p.group = 'f6_brayton';
	}
}

RULES[MODEL]();

// ---- Write and report -----------------------------------------------------

const GROUPS = ['f1_cradle', 'f2_reactivity', 'f2_drives', 'f3_core', 'f4_heatpipes', 'f5_phx', 'f6_brayton', 'f7_pmad', 'standalone', 'remove'];
const groups = Object.fromEntries(GROUPS.map((g) => [g, parts.filter((p) => p.group === g).map((p) => p.id).sort()]));
await mkdir('scripts/cad-tags', { recursive: true });
await writeFile(OUT, JSON.stringify({ model: MODEL, source: SOURCES[MODEL], groups }, null, '\t') + '\n');

console.log(`${parts.length} parts in ${families.length} families → ${OUT}\n`);
for (const g of [...GROUPS, undefined]) {
	const ps = parts.filter((p) => p.group === g);
	console.log(`${(g ?? 'context').padEnd(14)} ${String(ps.length).padStart(6)} parts`);
	if (process.env.VERBOSE) {
		const fams = new Map();
		for (const p of ps) fams.set(p.fam, (fams.get(p.fam) ?? 0) + 1);
		for (const [f, k] of [...fams].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
			const q = f.parts[0];
			console.log(
				`    ${String(k).padStart(5)}/${String(f.n).padEnd(5)} #${q.colour} ${q.size.map((v) => v.toFixed(3)).join('×')} r${q.r.toFixed(2)} y${q.c[1].toFixed(2)}`
			);
		}
	}
}
