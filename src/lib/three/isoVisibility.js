// @ts-nocheck — dev tooling, run by hand in the browser console; not part of the site.
// Which of the isometric model's triangles can ever be seen from outside it.
// Dev tooling for scripts/iso-model.mjs, not part of the site (nothing
// imports it, so it never ships). Runs in the browser, on the dev server, as
// it needs the GPU:
//
//   node scripts/iso-model.mjs --whole static/models/cad/web/iso-whole.glb
//   (then, in the browser console on the dev site)
//   const v = await import('/src/lib/three/isoVisibility.js');
//   const json = await v.bake('/models/cad/web/iso-whole.glb');
//   (save `json` as scripts/iso-visible.json, then)
//   node scripts/iso-model.mjs
//
// The model is drawn with each triangle in its own colour (its index) from
// every direction the landing's camera can look from (any turn, from level
// to straight down), with an orthographic camera, as the landing's 4° lens
// nearly is, and every colour that shows is marked seen. What's never seen
// is the inside of the parts, which only the build-up's section cut opens:
// iso-model.mjs splits it off, and the landing draws it only while cut.
//
// The result lists the triangles as runs, in the model's own order: seen,
// unseen, seen, … (the first run is of seen ones, and may be 0 long).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Turns, degrees apart; and tilts above level, degrees. */
const TURN_STEP = 10;
const TILTS = [0, 8, 16, 24, 32, 40, 50, 60, 70, 80, 90];

export async function bake(url, { size = 2048 } = {}) {
	const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
	let mesh;
	gltf.scene.traverse((o) => o.isMesh && (mesh ??= o));
	gltf.scene.updateMatrixWorld(true);

	// One colour per triangle: its index plus one, over three bytes.
	const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
	const pos = src.getAttribute('position');
	const triangles = pos.count / 3;
	const position = new Float32Array(pos.count * 3);
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).toArray(position, i * 3);
	const colour = new Uint8Array(pos.count * 3);
	for (let t = 0; t < triangles; t++) {
		const id = t + 1;
		for (let k = 0; k < 3; k++) colour.set([id & 255, (id >> 8) & 255, (id >> 16) & 255], (t * 3 + k) * 3);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3, true));
	const scene = new THREE.Scene();
	scene.add(
		new THREE.Mesh(
			geometry,
			new THREE.ShaderMaterial({
				vertexShader: 'varying vec3 c; void main() { c = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
				fragmentShader: 'varying vec3 c; void main() { gl_FragColor = vec4(c, 1.0); }',
				vertexColors: true,
				side: THREE.DoubleSide
			})
		)
	);

	const renderer = new THREE.WebGLRenderer({ antialias: false });
	renderer.setSize(size, size, false);
	const target = new THREE.WebGLRenderTarget(size, size);
	geometry.computeBoundingSphere();
	const { center, radius } = geometry.boundingSphere;
	const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 4);
	const seen = new Uint8Array(triangles);
	const px = new Uint8Array(size * size * 4);
	for (const tilt of TILTS)
		for (let turn = 0; turn < 360; turn += tilt === 90 ? 360 : TURN_STEP) {
			const [a, b] = [THREE.MathUtils.degToRad(turn), THREE.MathUtils.degToRad(tilt)];
			const dir = new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a));
			camera.position.copy(center).addScaledVector(dir, radius * 2);
			camera.up.set(0, 1, 0);
			if (tilt === 90) camera.up.set(1, 0, 0);
			camera.lookAt(center);
			renderer.setRenderTarget(target);
			renderer.setClearColor(0x000000, 1);
			renderer.clear();
			renderer.render(scene, camera);
			renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
			for (let i = 0; i < px.length; i += 4) {
				const id = px[i] | (px[i + 1] << 8) | (px[i + 2] << 16);
				if (id) seen[id - 1] = 1;
			}
		}
	renderer.dispose();
	target.dispose();

	const runs = [];
	let current = 1;
	let length = 0;
	for (let t = 0; t < triangles; t++) {
		if (seen[t] === current) length++;
		else {
			runs.push(length);
			current = seen[t];
			length = 1;
		}
	}
	runs.push(length);
	const count = seen.reduce((a, b) => a + b, 0);
	return JSON.stringify({ triangles, seen: count, size, runs });
}
