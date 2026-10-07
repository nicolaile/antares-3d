#!/usr/bin/env node
// Bakes the landing page's isometric drawing (IsoDrawing) into one small
// model: Mark-0 and the power conversion system assembled as assembly.ts
// stacks them, from the web models (web-model.mjs, split-web-model.mjs).
//
//   node scripts/iso-model.mjs [out.glb] [--error=<metres>] [--inside-error=<metres>] [--whole]
//
// At runtime CadViewer.loadAssembly does the same from the separate group
// files: it dequantizes every vertex, moves it into the shared frame and
// applies the lifts, in JavaScript, on the main thread (2.2M vertices, a
// long task while the page is being scrolled), and keeps the colours, UVs
// and part ids the line drawing never reads. Baked here instead, the page
// downloads one file holding only what a drawing needs (positions and
// normals) as one mesh, quantized and meshopt-compressed, which the GPU
// reads as stored.
//
// It's also lighter: a drawing only draws where surfaces fold, step or end,
// so two things it can't show go. The CAD's facets each carry their own
// normal, splitting nearly every vertex; vertices at one point whose normals
// are within WELD_ANGLE merge (a drawing only marks folds past ~25°, so no
// line moves). And meshoptimizer simplifies to ERROR metres, about a third
// of a pixel at the landing's scale, weighing the normals so folds keep
// their place.
//
// Then it splits off the inside. Most of the triangles are inside parts
// (fuel plugs, the exchanger's tube bundle, the heat pipes) and can't be
// seen from any direction the landing's camera looks from; only the
// build-up's section cut opens them. src/lib/three/isoVisibility.js finds which
// can be seen (it needs the GPU, so runs in the browser, on a `--whole`
// build: unsplit, in this script's triangle order) into
// scripts/iso-visible.json; with that here, the model is written as two
// meshes, `shell` (what can be seen, and a ring of triangles round it so
// no gap can open at its edge) and `inside`, which the landing only draws
// while a cut is open. Without it, or with `--whole`, as one mesh.
import { existsSync, readFileSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { BufferAttribute, BufferGeometry, CylinderGeometry, Matrix3, Matrix4, Vector3 } from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ASSEMBLY, FILLER, PHX_LIFT, liftOf, turnOf } from '../src/lib/three/assembly.ts';

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? 'static/models/cad/web/iso.glb';
/** How far, in metres, a simplified surface may stray (the landing draws about 1 cm a pixel). */
const ERROR = Number(args.find((a) => a.startsWith('--error='))?.split('=')[1] ?? 0.003);
/** Normals closer than this merge into one smooth vertex, degrees. */
const WELD_ANGLE = 20;
const WHOLE = args.includes('--whole');
/**
 * How far the inside's simplified surfaces may stray, metres: much looser
 * than the shell's ERROR, as it's only seen mid-cut (0 keeps it as the shell).
 */
const INSIDE_ERROR = Number(args.find((a) => a.startsWith('--inside-error='))?.split('=')[1] ?? 0.03);
const VISIBLE = 'scripts/iso-visible.json';
const WEB = 'static/models/cad/web';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
	.registerExtensions(ALL_EXTENSIONS)
	.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const positions = [];
const normals = [];
const indices = [];
let vertices = 0;

/** Appends one primitive's triangles, already in the assembled frame. */
function add(pos, nor, idx) {
	for (let i = 0; i < idx.length; i++) indices.push(idx[i] + vertices);
	positions.push(pos);
	normals.push(nor);
	vertices += pos.length / 3;
}

const p = new Vector3();
const n = new Vector3();
for (const [model, groups] of Object.entries(ASSEMBLY)) {
	const turn = new Matrix4().makeRotationY(turnOf(model));
	for (const group of groups) {
		const doc = await io.read(`${WEB}/${model}/${group}.glb`);
		for (const node of doc.getRoot().listNodes()) {
			const mesh = node.getMesh();
			if (!mesh) continue;
			const ids = node.getExtras().parts ?? [];
			const world = turn.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
			const normalMatrix = new Matrix3().getNormalMatrix(world);
			for (const prim of mesh.listPrimitives()) {
				const P = prim.getAttribute('POSITION');
				const N = prim.getAttribute('NORMAL');
				const part = prim.getAttribute('_PART');
				const count = P.getCount();
				const pos = new Float32Array(count * 3);
				const nor = new Float32Array(count * 3);
				const e = [];
				for (let i = 0; i < count; i++) {
					p.fromArray(P.getElement(i, e)).applyMatrix4(world);
					p.y += liftOf(model, group, part ? ids[part.getElement(i, e)[0]] : undefined);
					p.toArray(pos, i * 3);
					n.fromArray(N.getElement(i, e)).applyMatrix3(normalMatrix).normalize();
					n.toArray(nor, i * 3);
				}
				add(pos, nor, prim.getIndices().getArray());
			}
		}
	}
}

// The stand-in pipe closing the gap the exchanger's lift leaves in the down pipe (as loadAssembly).
const h = PHX_LIFT + 0.02;
const filler = new CylinderGeometry(FILLER.radius, FILLER.radius, h, 32, 1, true);
filler.translate(FILLER.x, FILLER.from + h / 2 - 0.01, FILLER.z);
add(filler.getAttribute('position').array, filler.getAttribute('normal').array, filler.getIndex().array);

const flat = (parts, length) => {
	const out = new Float32Array(length);
	let at = 0;
	for (const a of parts) {
		out.set(a, at);
		at += a.length;
	}
	return out;
};
let pos = flat(positions, vertices * 3);
let nor = flat(normals, vertices * 3);
let idx = new Uint32Array(indices);
const before = { vertices, triangles: idx.length / 3 };

/*
 * Weld: one vertex per point and smooth stretch of surface. Vertices are
 * bucketed by position on a 0.1 mm grid; in each bucket, a vertex joins the
 * first merged one whose (running mean) normal is within WELD_ANGLE.
 */
{
	const cos = Math.cos((WELD_ANGLE * Math.PI) / 180);
	const buckets = new Map();
	const remap = new Uint32Array(vertices);
	const outPos = [];
	const outNor = [];
	const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
	for (let i = 0; i < vertices; i++) {
		const k = key(i);
		let list = buckets.get(k);
		if (!list) buckets.set(k, (list = []));
		const [x, y, z] = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
		let into = -1;
		for (const j of list) {
			const [a, b, c] = [outNor[j * 3], outNor[j * 3 + 1], outNor[j * 3 + 2]];
			const len = Math.hypot(a, b, c) || 1;
			if ((a * x + b * y + c * z) / len > cos) {
				into = j;
				break;
			}
		}
		if (into < 0) {
			into = outPos.length / 3;
			list.push(into);
			outPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
			outNor.push(0, 0, 0);
		}
		outNor[into * 3] += x;
		outNor[into * 3 + 1] += y;
		outNor[into * 3 + 2] += z;
		remap[i] = into;
	}
	for (let j = 0; j < outNor.length; j += 3) {
		const len = Math.hypot(outNor[j], outNor[j + 1], outNor[j + 2]) || 1;
		outNor[j] /= len;
		outNor[j + 1] /= len;
		outNor[j + 2] /= len;
	}
	const kept = [];
	for (let t = 0; t < idx.length; t += 3) {
		const [a, b, c] = [remap[idx[t]], remap[idx[t + 1]], remap[idx[t + 2]]];
		if (a !== b && b !== c && a !== c) kept.push(a, b, c);
	}
	pos = new Float32Array(outPos);
	nor = new Float32Array(outNor);
	idx = new Uint32Array(kept);
}
const welded = { vertices: pos.length / 3, triangles: idx.length / 3 };

// Simplify, with the normals weighed in so folds stay put.
await MeshoptSimplifier.ready;
{
	const scale = MeshoptSimplifier.getScale(pos, 3);
	const [simplified] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, nor, 3, [0.5, 0.5, 0.5], null, 0, ERROR / scale, []);
	// Drop the vertices nothing uses any more.
	const used = new Int32Array(pos.length / 3).fill(-1);
	const p2 = [];
	const n2 = [];
	const i2 = new Uint32Array(simplified.length);
	for (let t = 0; t < simplified.length; t++) {
		const v = simplified[t];
		if (used[v] < 0) {
			used[v] = p2.length / 3;
			p2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
			n2.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
		}
		i2[t] = used[v];
	}
	pos = new Float32Array(p2);
	nor = new Float32Array(n2);
	idx = i2;
}
/** Which triangles go in the shell, from scripts/iso-visible.json, or null to keep the model whole. */
function shellOf(triangles) {
	if (WHOLE || !existsSync(VISIBLE)) return null;
	const visible = JSON.parse(readFileSync(VISIBLE, 'utf8'));
	if (visible.triangles !== triangles) {
		console.warn(`${VISIBLE} is for ${visible.triangles} triangles, not ${triangles}: re-run the visibility bake. Writing it whole.`);
		return null;
	}
	const shell = new Uint8Array(triangles);
	let t = 0;
	visible.runs.forEach((run, i) => {
		if (i % 2 === 0) shell.fill(1, t, t + run);
		t += run;
	});
	// And every triangle touching one of those, so no gap can open at the shell's edge.
	const edge = new Uint8Array(pos.length / 3);
	for (let k = 0; k < triangles; k++) if (shell[k]) edge[idx[k * 3]] = edge[idx[k * 3 + 1]] = edge[idx[k * 3 + 2]] = 1;
	for (let k = 0; k < triangles; k++) if (edge[idx[k * 3]] || edge[idx[k * 3 + 1]] || edge[idx[k * 3 + 2]]) shell[k] = 1;
	return shell;
}

/** The triangles (as an index list) for which `keep` holds. */
function select(keep) {
	const out = [];
	for (let k = 0; k < idx.length / 3; k++) if (keep(k)) out.push(idx[k * 3], idx[k * 3 + 1], idx[k * 3 + 2]);
	return new Uint32Array(out);
}

/**
 * The inside, simplified much further (INSIDE_ERROR): it only shows while
 * the build-up's cut passes through it, for a second or two. Returned as its
 * own positions, normals and triangles.
 *
 * The weld above keeps a vertex per crease, so normals stay sharp; to the
 * simplifier each such seam is an edge it mustn't move, so curved parts
 * would keep every facet. So here: weld by position alone, simplify by shape
 * (the true open edge, where the inside meets the shell, locked so no gap
 * opens there), then work the normals out afresh, split at the same
 * WELD_ANGLE so the inside's folds still draw.
 */
function simplifyInside(triangles) {
	const at = new Map();
	const p = [];
	const remap = new Uint32Array(pos.length / 3).fill(0xffffffff);
	for (const v of triangles) {
		if (remap[v] !== 0xffffffff) continue;
		const key = `${Math.round(pos[v * 3] * 1e4)},${Math.round(pos[v * 3 + 1] * 1e4)},${Math.round(pos[v * 3 + 2] * 1e4)}`;
		let j = at.get(key);
		if (j === undefined) {
			j = p.length / 3;
			at.set(key, j);
			p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
		}
		remap[v] = j;
	}
	const welded = Uint32Array.from(triangles, (v) => remap[v]);
	const points = new Float32Array(p);
	const scale = MeshoptSimplifier.getScale(points, 3);
	const [simplified] = MeshoptSimplifier.simplify(welded, points, 3, 0, INSIDE_ERROR / scale, ['LockBorder']);

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(points, 3));
	geometry.setIndex(new BufferAttribute(simplified, 1));
	const creased = mergeVertices(toCreasedNormals(geometry, (WELD_ANGLE * Math.PI) / 180), 1e-5);
	return {
		pos: creased.getAttribute('position').array,
		nor: creased.getAttribute('normal').array,
		idx: creased.getIndex().array
	};
}

/** A mesh of the given triangles (an index list), with only the vertices they use. */
function part(doc, buffer, material, name, triangles, from = { pos, nor }) {
	const { pos: P, nor: N } = from;
	const used = new Int32Array(P.length / 3).fill(-1);
	const p = [];
	const n = [];
	const i = [];
	for (let k = 0; k < triangles.length / 3; k++) {
		for (let j = 0; j < 3; j++) {
			const v = triangles[k * 3 + j];
			if (used[v] < 0) {
				used[v] = p.length / 3;
				p.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
				n.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
			}
			i.push(used[v]);
		}
	}
	const prim = doc
		.createPrimitive()
		.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buffer))
		.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(n)).setBuffer(buffer))
		.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(i)).setBuffer(buffer))
		.setMaterial(material);
	return { node: doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)), triangles: i.length / 3 };
}

const doc = new Document();
const buffer = doc.createBuffer();
const material = doc.createMaterial('drawing').setDoubleSided(true);
const scene = doc.createScene('r1');
const shell = shellOf(idx.length / 3);
const split = shell
	? [
			part(doc, buffer, material, 'shell', select((k) => shell[k])),
			(() => {
				const inside = INSIDE_ERROR ? simplifyInside(select((k) => !shell[k])) : { pos, nor, idx: select((k) => !shell[k]) };
				return part(doc, buffer, material, 'inside', inside.idx, inside);
			})()
		]
	: [part(doc, buffer, material, 'r1', idx)];
for (const { node } of split) scene.addChild(node);

// For the GPU's cache, the vertices and triangles reordered; positions
// quantized to 16 bits (0.1 mm over the model's 6.3 m; at 14 a few percent
// of the drawing's line pixels shift) on one grid for both meshes, and
// normals to 12 (the drawing finds its folds from them, and meshopt alone
// would take them to 8); then meshopt's compression. The
// visibility bake's copy (`--whole`) is left as plain floats instead: it
// must keep this script's triangle order, and it never leaves the machine.
if (!WHOLE)
	await doc.transform(
		reorder({ encoder: MeshoptEncoder }),
		quantize({ quantizePosition: 16, quantizeNormal: 12, quantizationVolume: 'scene' }),
		meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeNormal: 12, quantizationVolume: 'scene' })
	);
await io.write(OUT, doc);
const fmt = (o) => `${o.vertices.toLocaleString('en')} vertices, ${o.triangles.toLocaleString('en')} triangles`;
console.log(`assembled  ${fmt(before)}`);
console.log(`welded     ${fmt(welded)}`);
console.log(`simplified ${fmt({ vertices: pos.length / 3, triangles: idx.length / 3 })} (${ERROR * 1000} mm)`);
if (shell) for (const { node, triangles } of split) console.log(`${node.getName().padEnd(10)} ${triangles.toLocaleString('en')} triangles`);
console.log(OUT);
