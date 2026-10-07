#!/usr/bin/env node
// Makes part ids unique per placement. step_to_glb.py --parts names each
// body once, but a sub-assembly placed several times (a valve, a flange
// set) shares those names across every copy. Walking the node tree in
// order, the first copy keeps p00010 and the rest become p00010-2, -3, …:
// deterministic, so tags made on one conversion hold for the next.
//
//   node scripts/gltf-unique-parts.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';

const [, , IN, OUT] = process.argv;
const io = new NodeIO();
const doc = await io.read(IN);
const seen = new Map();
let renamed = 0;
const visit = (node) => {
	const name = node.getName();
	if (/^p\d{5}$/.test(name)) {
		const n = (seen.get(name) ?? 0) + 1;
		seen.set(name, n);
		if (n > 1) {
			node.setName(`${name}-${n}`);
			renamed++;
		}
	}
	for (const child of node.listChildren()) visit(child);
};
for (const scene of doc.getRoot().listScenes()) for (const node of scene.listChildren()) visit(node);
await io.write(OUT, doc);
console.log(`parts ${[...seen.values()].reduce((a, b) => a + b, 0)} (${renamed} repeat placements suffixed)`);
