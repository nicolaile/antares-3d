#!/usr/bin/env node
// Regroups a --parts conversion by the tags from the tagging tool (/cad/tag).
//
//   node scripts/apply-cad-tags.mjs in.glb scripts/cad-tags/mark-0.json out.glb
//
// Every part moves, keeping its world placement, under a node named after
// its group (f1_cradle … f7_pmad, as in src/lib/three/cadGroups.ts);
// untagged parts go under `context`, and parts tagged `remove` are dropped.
// The site animates those group nodes, so their names are the contract.
// Runs on the Y-up file, before optimize-model.sh.
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { Matrix4 } from 'three';

const [, , IN, TAGS, OUT] = process.argv;
if (!IN || !TAGS || !OUT) {
	console.error('usage: apply-cad-tags.mjs <in.glb> <tags.json> <out.glb>');
	process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(IN);
const tags = JSON.parse(await readFile(TAGS, 'utf8'));

const groupOf = new Map();
for (const [group, ids] of Object.entries(tags.groups)) for (const id of ids) groupOf.set(id, group);

const scene = doc.getRoot().listScenes()[0];
// gltf-zup-to-yup.mjs's root: groups go under it, so they share its Y-up turn.
const top = scene.listChildren()[0];
const topInverse = new Matrix4().fromArray(top.getWorldMatrix()).invert();

const groups = new Map();
for (const id of [...Object.keys(tags.groups).filter((g) => g !== 'remove'), 'context']) {
	const node = doc.createNode(id);
	top.addChild(node);
	groups.set(id, node);
}

const counts = { removed: 0 };
for (const node of [...doc.getRoot().listNodes()]) {
	if (!/^p\d{5}(-\d+)?$/.test(node.getName())) continue;
	const group = groupOf.get(node.getName()) ?? 'context';
	if (group === 'remove') {
		node.dispose();
		counts.removed++;
		continue;
	}
	const local = topInverse.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
	node.getParentNode()?.removeChild(node);
	node.setMatrix(local.toArray());
	groups.get(group).addChild(node);
	counts[group] = (counts[group] ?? 0) + 1;
}

// The emptied assembly nodes are left for optimize-model.sh's prune.
await io.write(OUT, doc);
for (const [group, n] of Object.entries(counts)) console.log(`${group.padEnd(14)} ${n}`);
