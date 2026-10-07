#!/usr/bin/env node
// Turns a grouped CAD model (apply-cad-tags.mjs output) into a web model:
// each group's parts are simplified, then merged into a single mesh.
//
//   node scripts/web-model.mjs in.glb out.glb
//
// Merging takes ~10k draw calls down to one per group, but would freeze
// the parts together, and the site needs to move some of them on their
// own: drums turning (video 2), core blocks stacking (video 3). So every
// vertex keeps the index of the part it came from in a `_PART` attribute
// (`_part` on the three.js geometry), and each group node's
// extras.parts lists the part ids in that order. A vertex shader can then
// move, turn or light up any single part with no extra draw calls. The
// CAD colours ride along as COLOR_0, so graphite still reads apart from
// absorber whatever material the site applies.
//
// Simplification is meshoptimizer's, per part, to an error budget in
// metres: what matters is how far a surface moves on screen, not relative
// to the part, or the 3,600 3 cm fuel plugs would keep every triangle.
// Internals that only show in a cut-away get a looser budget than hero
// surfaces. The relative error is capped so tiny parts keep their shape.
import { NodeIO } from '@gltf-transform/core';
import { joinPrimitives, prune, simplifyPrimitive, transformPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4 } from 'three';

/** Per group: how far, in metres, a simplified surface may stray from the CAD. */
const ERROR = {
	f1_cradle: 0.0015,
	f2_reactivity: 0.0025,
	f2_drives: 0.003,
	f3_core: 0.003,
	f4_heatpipes: 0.0015,
	f5_phx: 0.0025,
	f6_brayton: 0.003,
	f7_pmad: 0.0015,
	context: 0.003
};
/** No part loses more than this share of its size, however small it is. */
const MAX_RELATIVE_ERROR = 0.08;
const PART = /^p\d{5}(-\d+)?$/;

const [, , IN, OUT] = process.argv;
if (!IN || !OUT) {
	console.error('usage: web-model.mjs <grouped.glb> <out.glb>');
	process.exit(1);
}

await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(IN);
// Simplification needs shared vertices; CAD exports split every triangle's.
await doc.transform(weld());

const top = doc.getRoot().listScenes()[0].listChildren()[0];
const totals = [];

for (const group of top.listChildren()) {
	const name = group.getName();
	const budget = ERROR[name] ?? ERROR.context;
	const toGroup = new Matrix4().fromArray(group.getWorldMatrix()).invert();
	const ids = [];
	const prims = [];
	let before = 0;

	const visit = (node, part) => {
		if (PART.test(node.getName())) {
			part = ids.length;
			ids.push(node.getName());
		}
		const mesh = node.getMesh();
		if (mesh && part !== undefined) {
			const matrix = toGroup.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
			for (const src of mesh.listPrimitives()) {
				if (!src.getAttribute('NORMAL') || !src.getIndices()) continue;
				// Repeat placements share a mesh: work on a copy.
				const prim = src.clone();
				for (const semantic of prim.listSemantics()) prim.setAttribute(semantic, src.getAttribute(semantic).clone());
				prim.setIndices(src.getIndices().clone());
				before += prim.getIndices().getCount() / 3;
				// meshoptimizer's error is relative to the mesh's extent.
				const pos = prim.getAttribute('POSITION');
				const lo = pos.getMin([]);
				const hi = pos.getMax([]);
				const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
				const error = Math.min(budget / extent, MAX_RELATIVE_ERROR);
				simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error });
				transformPrimitive(prim, matrix.toArray());

				const count = prim.getAttribute('POSITION').getCount();
				const colour = src.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
				const colours = new Float32Array(count * 3);
				for (let i = 0; i < count; i++) colours.set(colour.slice(0, 3), i * 3);
				const partIndex = new Uint16Array(count).fill(part);
				const buffer = doc.getRoot().listBuffers()[0];
				prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(colours).setBuffer(buffer));
				prim.setAttribute('_PART', doc.createAccessor().setType('SCALAR').setArray(partIndex).setBuffer(buffer));
				prim.setMaterial(null);
				prims.push(prim);
			}
		}
		for (const child of node.listChildren()) visit(child, part);
	};
	for (const child of group.listChildren()) visit(child, undefined);
	if (!prims.length) continue;

	const joined = joinPrimitives(prims);
	for (const p of prims) p.dispose();
	joined.setMaterial(
		doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0.2).setRoughnessFactor(0.6).setDoubleSided(true)
	);
	for (const child of group.listChildren()) child.dispose();
	group.setMesh(doc.createMesh(name).addPrimitive(joined));
	group.setExtras({ parts: ids });

	const after = joined.getIndices().getCount() / 3;
	totals.push([name, ids.length, before, after]);
}

await doc.transform(prune());
await io.write(OUT, doc);

const fmt = (n) => Math.round(n).toLocaleString('en').padStart(11);
let b = 0;
let a = 0;
for (const [name, parts, before, after] of totals) {
	console.log(`${name.padEnd(14)} ${String(parts).padStart(5)} parts ${fmt(before)} → ${fmt(after)} tris`);
	b += before;
	a += after;
}
console.log(`${'total'.padEnd(20)}       ${fmt(b)} → ${fmt(a)} tris`);
