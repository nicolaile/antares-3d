#!/usr/bin/env node
// Bakes the landing's models: ray-traced ambient occlusion per vertex, so
// the crevices, the gaps between the core's blocks and the insides of the
// pipe bundles darken as they would in an offline render, steady as the
// model turns, at no cost a frame; and each part's finish. Reads the web
// models (split-web-model.mjs output, which /cad and /systems load as they
// are) and writes the landing's own copies, with a `_SURF` attribute
// (u8 × 4, normalised):
//
//   x  occlusion by the vertex's own part alone
//   y  occlusion by everything in its group (its file)
//   z  its finish's shade: albedo over the classic look's brightest (0.27)
//   w  its finish's roughness (7 bits) and whether it's a non-metal (low bit)
//
// The viewer blends from y to x as a group comes apart or is cut open, so
// pieces moved away from each other stop shading each other. Groups never
// shade each other here: they're hidden, cut and moved apart one by one,
// so that's left to the screen-space occlusion, which sees what's shown.
//
// The finishes are the approved studio renders' (scripts/render/render.py,
// the classic look): every CAD material, by its colour, draws one of cast,
// machined, anodised or polymer from a stable hash, and its own shade and
// roughness within that finish's range. The same hashes, so a part has the
// same finish here as in the renders; the viewer maps the shades onto its
// own lighter look. The CAD colours go (z and w carry what's used of them);
// the part index stays, for splitting at load.
//
// Where the occlusion changes along a long edge, the edge is split, the
// surface unchanged (`subdivide`): CAD meshes have large faces of a few
// triangles, a 2.5 m vessel wall in strips its full height, and a crease's
// darkness at one end would otherwise be stretched along the whole of it.
// Only there: splitting every long edge doubled some files, platforms tens
// of metres across most of all, for occlusion that's flat. And each vertex's
// final value is the occlusion averaged over the triangles round it
// (weighted towards it, as the GPU interpolates), not taken at the point.
//
//   node scripts/bake-surface.mjs [model ...] [--samples 96] [--radius 0.3]
//     [--smooth 2] [--bits 5] [--edge 0.2] [--only group]
//
// Models default to all under static/models/cad/web/; output goes to
// static/models/landing/<model>/<group>.glb. Deterministic: the same input
// gives the same bytes.
import { mkdir, readdir } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}static/models/cad/web/`;
const OUT = `${ROOT}static/models/landing/`;
/** render.py's classic finishes: share of CAD materials, albedo scale, roughness range, non-metal. */
const FINISHES = {
	cast: { share: 0.35, albedo: 1.0, roughness: [0.42, 0.6], dielectric: false },
	machined: { share: 0.2, albedo: 3.0, roughness: [0.16, 0.28], dielectric: false },
	anodised: { share: 0.3, albedo: 1.0, roughness: [0.3, 0.42], dielectric: false },
	polymer: { share: 0.15, albedo: 0.8, roughness: [0.55, 0.75], dielectric: true }
};
/**
 * render.py's real finishes, for parts whose classic draw doesn't fit what
 * they are (OVERRIDES): measured albedo (`abs`) rather than a scale.
 */
const REAL = {
	// Nuclear-grade graphite: dark grey, matte, a faint sheen.
	graphite: { abs: [0.08, 0.11], roughness: [0.7, 0.82], dielectric: true }
};
/**
 * Per model, per group, CAD materials given a real finish in place of
 * their classic one: the core's fuel blocks are graphite (render.py's
 * PARTS core, mat_0; the drive motors share the colour, in another group).
 */
const OVERRIDES = { 'mark-0': { f3_core: { mat_0: 'graphite' } } };
/** The classic look's albedo range, before a finish's scale; the brightest shade it can give, for 0–1. */
const ALBEDO = [0.02, 0.09];
const BRIGHTEST = ALBEDO[1] * 3;
/** Subdividing: rays a vertex for deciding where, passes of halving at most, and what counts as a change. */
const PROBE_SAMPLES = 32;
const PASSES = 4;
const STEP = 0.1;
/** At most this share more vertices a file, the biggest changes split first. */
const BUDGET = 0.25;

if (isMainThread) await main();
else await work();

async function main() {
	const args = process.argv.slice(2);
	const flag = (name, fallback) => {
		const i = args.indexOf(`--${name}`);
		if (i < 0) return fallback;
		const v = Number(args[i + 1]);
		args.splice(i, 2);
		return v;
	};
	const flagged = (name) => {
		const i = args.indexOf(`--${name}`);
		return i < 0 ? null : args.splice(i, 2)[1];
	};
	const samples = flag('samples', 96);
	// Metres: how far a surface looks for what shades it. The reactor is
	// ~3 m across; a third of a metre reaches across its gaps and recesses
	// without darkening whole faces under a distant overhang.
	const radius = flag('radius', 0.3);
	// Passes of averaging each vertex with its neighbours on the same
	// surface: the sampling's noise out, which otherwise both speckles and
	// doesn't compress (the bake's bytes were mostly noise).
	const smooth = flag('smooth', 2);
	// Levels kept, as bits: what's left after smoothing needs no more, and
	// fewer compress far better.
	const bits = flag('bits', 5);
	// Metres: edges longer than this are split where the occlusion changes
	// along them (`subdivide`); 0 leaves the mesh be.
	const edge = flag('edge', 0.2);
	const only = flagged('only');
	const models = args.length ? args : (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

	const { NodeIO } = await import('@gltf-transform/core');
	const { EXTMeshoptCompression, KHRMeshQuantization } = await import('@gltf-transform/extensions');
	const { reorder } = await import('@gltf-transform/functions');
	const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer');
	await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
	const io = new NodeIO()
		.registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
		.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

	const names = await renderNames();
	for (const model of models) {
		const files = (await readdir(`${SRC}${model}`)).filter((f) => f.endsWith('.glb') && (!only || f === `${only}.glb`));
		await mkdir(`${OUT}${model}`, { recursive: true });
		for (const file of files) {
			const t = performance.now();
			const doc = await io.read(`${SRC}${model}/${file}`);
			let from = 0;
			let to = 0;
			for (const node of doc.getRoot().listNodes()) {
				const mesh = node.getMesh();
				if (!mesh) continue;
				const world = node.getWorldMatrix();
				for (const prim of mesh.listPrimitives()) {
					from += prim.getAttribute('POSITION').getCount();
					const overrides = OVERRIDES[model]?.[file.replace('.glb', '')];
					await bakePrimitive(doc, prim, world, { samples, radius, smooth, bits, edge, names: names[model], overrides });
					to += prim.getAttribute('POSITION').getCount();
				}
			}
			// Back into the GPU's preferred order, the new vertices among the rest.
			await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
			await io.write(`${OUT}${model}/${file}`, doc);
			console.log(`${model}/${file}: ${from} → ${to} vertices, ${((performance.now() - t) / 1000).toFixed(1)} s`);
		}
	}
}

/** Copies a typed array into shared memory, for the workers. */
function share(a) {
	const s = new a.constructor(new SharedArrayBuffer(a.byteLength));
	s.set(a);
	return s;
}

/**
 * A primitive's vertex data as its raw (quantised) values, growable, and
 * in world space for the rays: the files carry a Z-up turn and a scale on
 * their nodes (uniform, so the matrix's own 3×3 turns normals).
 */
function readMesh(prim, m) {
	const semantics = prim.listSemantics();
	const data = semantics.map((s) => {
		const a = prim.getAttribute(s);
		return { semantic: s, a, size: a.getElementSize(), array: a.getArray().slice() };
	});
	const mesh = {
		data,
		count: prim.getAttribute('POSITION').getCount(),
		index: Uint32Array.from(prim.getIndices().getArray()),
		get(s) {
			return data.find((d) => d.semantic === s);
		},
		/** World positions and normals, and each vertex's part. */
		world() {
			const n = this.count;
			const P = new Float32Array(n * 3);
			const N = new Float32Array(n * 3);
			const part = new Uint32Array(n);
			const pos = this.get('POSITION');
			const nrm = this.get('NORMAL');
			const prt = this.get('_PART');
			const pu = pos.a.getNormalized() ? unit(pos.array) : 1;
			const nu = nrm.a.getNormalized() ? unit(nrm.array) : 1;
			for (let i = 0; i < n; i++) {
				const x = Math.max(pos.array[i * 3] / pu, -1);
				const y = Math.max(pos.array[i * 3 + 1] / pu, -1);
				const z = Math.max(pos.array[i * 3 + 2] / pu, -1);
				P[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
				P[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
				P[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
				const a = nrm.array[i * 3] / nu;
				const b = nrm.array[i * 3 + 1] / nu;
				const c = nrm.array[i * 3 + 2] / nu;
				const nx = m[0] * a + m[4] * b + m[8] * c;
				const ny = m[1] * a + m[5] * b + m[9] * c;
				const nz = m[2] * a + m[6] * b + m[10] * c;
				const len = Math.hypot(nx, ny, nz) || 1;
				N[i * 3] = nx / len;
				N[i * 3 + 1] = ny / len;
				N[i * 3 + 2] = nz / len;
				part[i] = prt ? prt.array[i] : 0;
			}
			return { P, N, part };
		},
		/** Writes the data back into the primitive. */
		commit() {
			for (const d of data) d.a.setArray(d.array.slice(0, this.count * d.size));
			prim.getIndices().setArray(this.index);
		}
	};
	return mesh;
}

/** The value a normalised integer array's full scale stands for. */
function unit(array) {
	return array instanceof Int8Array ? 127 : array instanceof Int16Array ? 32767 : array instanceof Uint8Array ? 255 : array instanceof Uint16Array ? 65535 : 1;
}

/**
 * One pass of halving the edges `split(a, b)` picks, each triangle cut
 * along its new points (one, two or all three of its edges): the same
 * surface, flat where it was flat, shaded the same (a new vertex's normal
 * is its edge's, interpolated as the GPU would). An edge is split once for
 * both its triangles, and a hard edge's two copies at the same points, so
 * nothing cracks. Returns how many vertices it added.
 */
function subdivide(mesh, split) {
	const before = mesh.count;
	const mids = new Map();
	const grow = (d, need) => {
		if (d.array.length >= need * d.size) return;
		const next = new d.array.constructor(Math.max(need, Math.ceil(d.array.length / d.size) * 2) * d.size);
		next.set(d.array);
		d.array = next;
	};
	const midOf = (a, b) => {
		const key = a < b ? a * 4194304 + b : b * 4194304 + a;
		let v = mids.get(key);
		if (v !== undefined) return v;
		if (!split(a, b)) {
			mids.set(key, -1);
			return -1;
		}
		v = mesh.count++;
		// Ordered, so a hard edge's two copies land on the same values.
		const [lo, hi] = a < b ? [a, b] : [b, a];
		for (const d of mesh.data) {
			grow(d, mesh.count);
			const k = d.size;
			if (d.semantic === 'NORMAL') {
				const u = unit(d.array);
				const x = d.array[lo * k] / u + d.array[hi * k] / u;
				const y = d.array[lo * k + 1] / u + d.array[hi * k + 1] / u;
				const z = d.array[lo * k + 2] / u + d.array[hi * k + 2] / u;
				const len = Math.hypot(x, y, z) || 1;
				d.array[v * k] = Math.round((x / len) * u);
				d.array[v * k + 1] = Math.round((y / len) * u);
				d.array[v * k + 2] = Math.round((z / len) * u);
				for (let c = 3; c < k; c++) d.array[v * k + c] = d.array[lo * k + c];
			} else {
				const round = d.array instanceof Float32Array ? (x) => x : Math.round;
				for (let c = 0; c < k; c++) d.array[v * k + c] = round((d.array[lo * k + c] + d.array[hi * k + c]) / 2);
			}
		}
		mids.set(key, v);
		return v;
	};
	const index = mesh.index;
	const out = [];
	for (let t = 0; t < index.length; t += 3) {
		const a = index[t], b = index[t + 1], c = index[t + 2];
		const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
		const n = (ab >= 0) + (bc >= 0) + (ca >= 0);
		if (n === 0) out.push(a, b, c);
		else if (n === 3) out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
		else if (n === 1) {
			if (ab >= 0) out.push(a, ab, c, ab, b, c);
			else if (bc >= 0) out.push(b, bc, a, bc, c, a);
			else out.push(c, ca, b, ca, a, b);
		} else {
			// Two: the corner between them cut off, the rest a quad split in two.
			const [p, q, r, pq, qr] = ab < 0 ? [b, c, a, bc, ca] : bc < 0 ? [c, a, b, ca, ab] : [a, b, c, ab, bc];
			out.push(pq, q, qr, p, pq, qr, p, qr, r);
		}
	}
	mesh.index = Uint32Array.from(out);
	return mesh.count - before;
}

/**
 * Workers that each hold the original mesh's BVH (splitting edges never
 * changes the surface, so it stays right however the mesh is divided) and
 * bake a share of whatever vertices they're handed: `point`, rays from the
 * vertex itself (for deciding where to split), or `area`, from points on
 * the triangles round it (the final values). Results into `out`, two
 * floats a vertex: by its part alone, by everything.
 */
async function pool(P, index, part, radius) {
	const shared = { P: share(P), index: share(index), part: share(part), radius };
	const workers = Array.from({ length: Math.max(1, availableParallelism() - 1) }, () => new Worker(fileURLToPath(import.meta.url), { workerData: shared }));
	await Promise.all(workers.map((w) => new Promise((resolve, reject) => (w.once('message', resolve), w.once('error', reject)))));
	return {
		async bake(task, start, end) {
			const out = new Float32Array(new SharedArrayBuffer((end - start) * 8));
			const chunk = Math.ceil((end - start) / workers.length);
			await Promise.all(
				workers.map((w, i) => {
					const from = start + i * chunk;
					const to = Math.min(end, from + chunk);
					if (from >= to) return null;
					return new Promise((resolve, reject) => {
						w.once('message', resolve);
						w.once('error', reject);
						w.postMessage({ ...task, start: from, end: to, base: start, out });
					});
				})
			);
			return out;
		},
		close: () => Promise.all(workers.map((w) => w.terminate()))
	};
}

/** Reads a primitive, subdivides it where it needs, bakes it, and writes `_SURF` in place of COLOR_0. */
async function bakePrimitive(doc, prim, world, { samples, radius, smooth, bits, edge, names, overrides }) {
	const mesh = readMesh(prim, world);
	const original = mesh.world();
	const workers = await pool(original.P, mesh.index, original.part, radius);
	try {
		// Where to split: an edge longer than `edge` whose ends' occlusion
		// differs by more than STEP, the biggest differences over the longest
		// edges first, within BUDGET; then the new points baked, and again.
		if (edge > 0) {
			let { P, N, part } = original;
			let ao = groupOf(await workers.bake({ mode: 'point', P: share(P), N: share(N), part: share(part), samples: PROBE_SAMPLES }, 0, mesh.count));
			const length = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
			let budget = Math.round(mesh.count * BUDGET);
			for (let pass = 0; pass < PASSES && budget > 0; pass++) {
				const was = mesh.count;
				const candidates = new Map();
				const index = mesh.index;
				for (let t = 0; t < index.length; t += 3)
					for (let c = 0; c < 3; c++) {
						const a = Math.min(index[t + c], index[t + ((c + 1) % 3)]);
						const b = Math.max(index[t + c], index[t + ((c + 1) % 3)]);
						const key = a * 4194304 + b;
						if (candidates.has(key)) continue;
						const step = Math.abs(ao[a] - ao[b]);
						const l = length(a, b);
						if (l > edge && step > STEP) candidates.set(key, step * l);
					}
				const chosen = new Set([...candidates].sort((x, y) => y[1] - x[1]).slice(0, budget).map(([key]) => key));
				const added = subdivide(mesh, (a, b) => chosen.has(Math.min(a, b) * 4194304 + Math.max(a, b)));
				budget -= added;
				if (!added) break;
				({ P, N, part } = mesh.world());
				const fresh = groupOf(await workers.bake({ mode: 'point', P: share(P), N: share(N), part: share(part), samples: PROBE_SAMPLES }, was, mesh.count));
				const next = new Float32Array(mesh.count);
				next.set(ao);
				next.set(fresh, was);
				ao = next;
			}
			mesh.commit();
		}

		const { P, N, part } = mesh.world();
		const n = mesh.count;
		const index = mesh.index;
		// Each vertex's triangles, and the triangles' areas, for sampling round it.
		const triangles = index.length / 3;
		const offsets = new Uint32Array(n + 1);
		for (let k = 0; k < index.length; k++) offsets[index[k] + 1]++;
		for (let i = 0; i < n; i++) offsets[i + 1] += offsets[i];
		const ring = new Uint32Array(index.length);
		const fill = offsets.slice(0, n);
		for (let t = 0; t < triangles; t++) for (let c = 0; c < 3; c++) ring[fill[index[t * 3 + c]]++] = t;
		const area = new Float32Array(triangles);
		for (let t = 0; t < triangles; t++) {
			const [a, b, c] = [index[t * 3] * 3, index[t * 3 + 1] * 3, index[t * 3 + 2] * 3];
			const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
			const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
			area[t] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
		}
		let ao = await workers.bake(
			{ mode: 'area', P: share(P), N: share(N), part: share(part), index: share(index), offsets: share(offsets), ring: share(ring), area: share(area), samples },
			0,
			n
		);

		// Each vertex's neighbours along its triangles' edges. Hard edges are
		// separate vertices already, so averaging never crosses a crease.
		for (let pass = 0; pass < smooth; pass++) {
			const next = new Float32Array(n * 2);
			const weight = new Float32Array(n);
			for (let t = 0; t < triangles; t++)
				for (let c = 0; c < 3; c++) {
					const a = index[t * 3 + c];
					const b = index[t * 3 + ((c + 1) % 3)];
					next[a * 2] += ao[b * 2];
					next[a * 2 + 1] += ao[b * 2 + 1];
					next[b * 2] += ao[a * 2];
					next[b * 2 + 1] += ao[a * 2 + 1];
					weight[a]++;
					weight[b]++;
				}
			// Half its own, half its neighbours': soft enough to keep the detail.
			for (let i = 0; i < n; i++) {
				const w = weight[i] || 1;
				next[i * 2] = 0.5 * ao[i * 2] + (0.5 * next[i * 2]) / w;
				next[i * 2 + 1] = 0.5 * ao[i * 2 + 1] + (0.5 * next[i * 2 + 1]) / w;
			}
			ao = next;
		}

		const levels = (1 << bits) - 1;
		const quantise = (v) => Math.round((Math.round(Math.max(0, Math.min(1, v)) * levels) / levels) * 255);
		const colour = prim.getAttribute('COLOR_0');
		const finishOf = new Map();
		const el = [];
		const surf = new Uint8Array(n * 4);
		for (let i = 0; i < n; i++) {
			surf[i * 4] = quantise(ao[i * 2]);
			surf[i * 4 + 1] = quantise(ao[i * 2 + 1]);
			if (colour) {
				colour.getElement(i, el);
				const key = el.map((c) => (Math.round(c * 100) / 100).toFixed(2)).join(',');
				let f = finishOf.get(key);
				if (!f) {
					const name = names?.get(key) ?? `rgb:${key}`;
					finishOf.set(key, (f = finishFor(name, overrides?.[name])));
				}
				surf[i * 4 + 2] = f[0];
				surf[i * 4 + 3] = f[1];
			}
		}
		const position = prim.getAttribute('POSITION');
		prim.setAttribute('_SURF', doc.createAccessor('_SURF').setType('VEC4').setArray(surf).setNormalized(true).setBuffer(position.getBuffer()));
		if (colour) {
			prim.setAttribute('COLOR_0', null);
			if (!colour.listParents().some((p) => p.propertyType !== 'Root')) colour.dispose();
		}
	} finally {
		await workers.close();
	}
}

/** The group occlusion out of a bake's pairs. */
function groupOf(out) {
	const g = new Float32Array(out.length / 2);
	for (let i = 0; i < g.length; i++) g[i] = out[i * 2 + 1];
	return g;
}

/** A worker: builds its BVH, then bakes each share it's sent (see `pool`). */
async function work() {
	const THREE = await import('three');
	const { MeshBVH, SAH } = await import('three-mesh-bvh');
	const { P: P0, index, part: part0, radius } = workerData;
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(P0, 3));
	// A copy of its own: building the BVH reorders the triangles of the
	// index it's given.
	const order = index.slice();
	geometry.setIndex(new THREE.BufferAttribute(order, 1));
	const bvh = new MeshBVH(geometry, { strategy: SAH, targetLeafSize: 8 });
	parentPort.postMessage('ready');

	const ray = new THREE.Ray();
	const origin = new THREE.Vector3();
	const nrm = new THREE.Vector3();
	const t1 = new THREE.Vector3();
	const t2 = new THREE.Vector3();
	// Off the surface by a hair: past the quantised positions' error, under any real gap.
	const EPS = 0.0005;
	const corners = [0, 0, 0];
	const g = [0, 0, 0];
	const w = [0, 0, 0];

	parentPort.on('message', (task) => {
		const { mode, P, N, part, samples, start, end, base, out } = task;
		for (let v = start; v < end; v++) {
			const random = mulberry32(0x5eed ^ Math.imul(v, 0x9e3779b1));
			let total = 0;
			if (mode === 'area') for (let k = task.offsets[v]; k < task.offsets[v + 1]; k++) total += task.area[task.ring[k]];
			let groupHit = 0;
			let partHit = 0;
			for (let s = 0; s < samples; s++) {
				if (mode === 'area') {
					// A triangle round the vertex, by area…
					const { offsets, ring, area, index: tris } = task;
					let t = ring[offsets[v]];
					let pick = random() * total;
					for (let k = offsets[v]; k < offsets[v + 1]; k++) {
						pick -= area[ring[k]];
						if (pick <= 0) {
							t = ring[k];
							break;
						}
					}
					// …and a point on it weighted towards the vertex (Dirichlet(2,1,1)):
					// how much of it the vertex's value stands for once interpolated.
					corners[0] = tris[t * 3];
					corners[1] = tris[t * 3 + 1];
					corners[2] = tris[t * 3 + 2];
					const self = corners.indexOf(v);
					g[0] = -Math.log(random() * random() + 1e-12);
					g[1] = -Math.log(random() + 1e-12);
					g[2] = -Math.log(random() + 1e-12);
					const sum = g[0] + g[1] + g[2];
					w[self] = g[0] / sum;
					w[(self + 1) % 3] = g[1] / sum;
					w[(self + 2) % 3] = g[2] / sum;
					origin.set(0, 0, 0);
					nrm.set(0, 0, 0);
					for (let c = 0; c < 3; c++) {
						const i = corners[c] * 3;
						origin.x += P[i] * w[c];
						origin.y += P[i + 1] * w[c];
						origin.z += P[i + 2] * w[c];
						nrm.x += N[i] * w[c];
						nrm.y += N[i + 1] * w[c];
						nrm.z += N[i + 2] * w[c];
					}
					nrm.normalize();
				} else {
					origin.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
					nrm.set(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
				}
				// Cosine-weighted about the normal: what diffuse light would see.
				const r = Math.sqrt(random());
				const phi = 2 * Math.PI * random();
				const up = Math.abs(nrm.z) < 0.9 ? t1.set(0, 0, 1) : t1.set(1, 0, 0);
				t2.crossVectors(up, nrm).normalize();
				t1.crossVectors(nrm, t2);
				const lz = Math.sqrt(Math.max(0, 1 - r * r));
				ray.direction
					.set(0, 0, 0)
					.addScaledVector(t2, r * Math.cos(phi))
					.addScaledVector(t1, r * Math.sin(phi))
					.addScaledVector(nrm, lz)
					.normalize();
				ray.origin.copy(origin).addScaledVector(nrm, EPS);
				let nearest = Infinity;
				let nearestOwn = Infinity;
				for (const hit of bvh.raycast(ray, THREE.DoubleSide, 0, radius)) {
					if (hit.distance < nearest) nearest = hit.distance;
					if (hit.distance < nearestOwn && part0[order[hit.faceIndex * 3]] === part[v]) nearestOwn = hit.distance;
				}
				// Nearer things shade more: full at contact, none at the radius.
				if (nearest < radius) groupHit += (1 - nearest / radius) ** 2;
				if (nearestOwn < radius) partHit += (1 - nearestOwn / radius) ** 2;
			}
			out[(v - base) * 2] = 1 - partHit / samples;
			out[(v - base) * 2 + 1] = 1 - groupHit / samples;
		}
		parentPort.postMessage('done');
	});
}

/**
 * A CAD material's finish, as render.py's classic look picks it (its
 * `lit_material_classic`): the bytes for z and w.
 */
function finishFor(key, real) {
	if (real) {
		const f = REAL[real];
		const shade = f.abs[0] + (f.abs[1] - f.abs[0]) * unitHash(key, 'albedo');
		const rough = f.roughness[0] + (f.roughness[1] - f.roughness[0]) * unitHash(key, 'rough');
		return [Math.round((shade / BRIGHTEST) * 255), (Math.round(rough * 127) << 1) | (f.dielectric ? 1 : 0)];
	}
	let u = unitHash(key, 'finish') * Object.values(FINISHES).reduce((s, f) => s + f.share, 0);
	let finish = FINISHES.polymer;
	for (const f of Object.values(FINISHES)) {
		if (u < f.share) {
			finish = f;
			break;
		}
		u -= f.share;
	}
	const shade = Math.min(0.75, (ALBEDO[0] + (ALBEDO[1] - ALBEDO[0]) * unitHash(key, 'albedo')) * finish.albedo);
	const [r0, r1] = finish.roughness;
	const rough = r0 + (r1 - r0) * unitHash(key, 'rough');
	return [Math.round((shade / BRIGHTEST) * 255), (Math.round(rough * 127) << 1) | (finish.dielectric ? 1 : 0)];
}

/** render.py's `unit_hash`: a stable 0–1 number per (material, property). */
function unitHash(text, salt) {
	return parseInt(createHash('md5').update(`${salt}:${text}`).digest('hex').slice(0, 8), 16) / 0xffffffff;
}

/**
 * Each model's CAD material names by colour (linear, 2 dp), from render.py,
 * with the parts it gives one finish between them (the vessel's shells, the
 * base ring's halves) under one name: the keys its finishes hash.
 */
async function renderNames() {
	const { execFileSync } = await import('node:child_process');
	const json = execFileSync('python3', [
		'-c',
		`import ast, json, sys
src = open(sys.argv[1]).read()
def block(name):
    i = src.index(name + ' = {')
    j = src.index('\\n}\\n', i)
    return ast.literal_eval(src[i + len(name) + 3:j + 2])
legacy = block('LEGACY_NAMES')
parts = {m: {'shell': p.get('shell', []), 'matched': p.get('matched', [])} for m, p in block('PARTS').items()}
print(json.dumps({'legacy': legacy, 'parts': parts}))`,
		`${ROOT}scripts/render/render.py`
	]).toString();
	const { legacy, parts } = JSON.parse(json);
	const out = {};
	for (const [model, list] of Object.entries(legacy)) {
		const alias = new Map();
		const shell = parts[model]?.shell ?? [];
		for (const name of shell) alias.set(name, shell[0]);
		for (const names of parts[model]?.matched ?? []) for (const name of names) alias.set(name, names[0]);
		const byColour = new Map();
		for (const [name, rgb] of list) {
			const key = rgb.map((c) => c.toFixed(2)).join(',');
			if (!byColour.has(key)) byColour.set(key, alias.get(name) ?? name);
		}
		out[model] = byColour;
	}
	return out;
}

/** A stable random sequence per seed. */
function mulberry32(seed) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
