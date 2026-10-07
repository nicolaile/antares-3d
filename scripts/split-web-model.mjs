#!/usr/bin/env node
// Splits a web model (web-model.mjs output) into one file per group, so
// the site can load what each beat needs when it needs it: the exterior
// for the opening shots first, the internals while the visitor reads.
//
//   node scripts/split-web-model.mjs in.glb out-dir/
//
// Writes out-dir/<group>.glb for every group node, each keeping the
// model's Y-up root so it lands in the same place as the whole.
import { mkdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { cloneDocument, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [, , IN, OUT] = process.argv;
if (!IN || !OUT) {
	console.error('usage: split-web-model.mjs <in.glb> <out-dir>');
	process.exit(1);
}

// The web models are meshopt-compressed (optimize-model.sh); each part stays so.
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
	.registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
	.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN);
const names = doc.getRoot().listScenes()[0].listChildren()[0].listChildren().map((n) => n.getName());
await mkdir(OUT, { recursive: true });

for (const name of names) {
	const copy = cloneDocument(doc);
	const top = copy.getRoot().listScenes()[0].listChildren()[0];
	for (const group of top.listChildren()) if (group.getName() !== name) group.dispose();
	await copy.transform(prune());
	await io.write(`${OUT}/${name}.glb`, copy);
	console.log(`${name}.glb`);
}
