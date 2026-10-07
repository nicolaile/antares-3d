#!/usr/bin/env node
// Wraps each scene in a root node that turns NX's Z-up into glTF's Y-up.
// OCCT's own converter would do this, but it isn't exposed in the Python
// bindings (see step_to_glb.py). Lengths are already metres.
//
//   node scripts/gltf-zup-to-yup.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';

const [, , IN, OUT] = process.argv;
const io = new NodeIO();
const doc = await io.read(IN);
for (const scene of doc.getRoot().listScenes()) {
	const root = doc.createNode('z-up').setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
	for (const child of scene.listChildren()) {
		scene.removeChild(child);
		root.addChild(child);
	}
	scene.addChild(root);
}
await io.write(OUT, doc);
