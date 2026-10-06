import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ASSEMBLY, FILLER, PHX_LIFT, liftOf, turnOf } from './assembly';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LineDrawing } from './LineDrawing';

/**
 * Plain inspection viewer for models converted from STEP
 * (scripts/step-to-glb.mjs). Unlike ModelViewer it keeps the CAD colours,
 * orbits freely and adds a section cut, so a conversion can be judged as-is
 * before any look is applied to it.
 */
export interface CadStats {
	/** Drawn meshes, counting each GPU instance. */
	parts: number;
	triangles: number;
	materials: number;
	/** Bounding-box size in metres. */
	size: [number, number, number];
}

export type SectionAxis = 'x' | 'y' | 'z';

/**
 * Section caps. A cut leaves every solid open, and looking into hollow
 * shells reads as missing geometry rather than a cut. Through the opening
 * you only ever see a part's inside, i.e. its back faces, so painting those
 * one flat colour fills the cut like a section drawing — no extra geometry
 * or draw calls. Shared by every material, so one switch turns all caps on.
 */
export const CAP = {
	// Display-space (sRGB) value: written after tone mapping and encoding.
	capColor: { value: new THREE.Vector3(1, 0x75 / 255, 0x1f / 255) },
	capOn: { value: 0 }
};

export function withCap<M extends THREE.Material>(m: M): M {
	m.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, CAP);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform vec3 capColor;\nuniform float capOn;')
			.replace(
				'#include <dithering_fragment>',
				'#include <dithering_fragment>\n\tif (capOn > 0.5 && !gl_FrontFacing) gl_FragColor = vec4(capColor, 1.0);'
			);
	};
	return m;
}

const CLAY = withCap(
	new THREE.MeshStandardMaterial({ color: 0xa8a8ac, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide })
);

/** Each surface's distance from the camera, for the labels' visibility test; honours the section cut. */
function distanceMaterial() {
	return new THREE.ShaderMaterial({
		vertexShader: /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
varying float vDistance;
void main() {
	#include <begin_vertex>
	#include <project_vertex>
	#include <clipping_planes_vertex>
	vDistance = -mvPosition.z;
}`,
		fragmentShader: /* glsl */ `
#include <clipping_planes_pars_fragment>
varying float vDistance;
void main() {
	#include <clipping_planes_fragment>
	gl_FragColor = vec4(vDistance, 0.0, 0.0, 1.0);
}`,
		side: THREE.DoubleSide,
		clipping: true
	});
}

export class CadViewer {
	readonly renderer: THREE.WebGLRenderer;
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
	readonly controls: OrbitControls;

	private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
	protected model: THREE.Object3D | null = null;
	protected originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
	protected box = new THREE.Box3();
	protected plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
	private axis: SectionAxis = 'x';
	private sectionAt = 1;
	private resizeObserver: ResizeObserver;
	protected dirty = true;
	private tick = () => this.frame();
	/** Called every frame once the camera has moved, for anything placed over the canvas (the page's labels). */
	onFrame: (() => void) | null = null;
	/** The canvas's size in CSS pixels, kept by resize() so project() doesn't read layout. */
	private view = { width: 1, height: 1 };
	private loadId = 0;
	/**
	 * Labels pinned to the model (`setAnchors`): whether each is in the
	 * open, from a distance render of the scene (honouring the section cut)
	 * read back at each anchor, at most ten times a second while the view moves.
	 */
	private anchors: THREE.Vector3[] = [];
	private anchorShown: boolean[] = [];
	/** A shown label hides once less than `hide` of its patch is clear, and a hidden one shows once more than `show` is. */
	protected anchorThresholds = { hide: 0.25, show: 0.6 };
	private anchorTest = { due: false, last: 0 };
	private distanceTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType });
	private distanceMaterial = distanceMaterial();
	/** The line drawing (`setLines`): how far in (0..1), and the drawing pass itself, made on first use. */
	private lines = { mix: 0, on: false, drawing: null as LineDrawing | null, ink: '#111111', paper: '#ffffff', opacity: 1, weight: 0.5 };

	constructor(protected host: HTMLElement) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		this.renderer.toneMapping = THREE.NeutralToneMapping;
		host.appendChild(this.renderer.domElement);

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		pmrem.dispose();
		const key = new THREE.DirectionalLight(0xffffff, 1.2);
		key.position.set(1, 2, 1.5);
		this.scene.add(key);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.addEventListener('change', () => (this.dirty = true));

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(host);
		this.resize();
		gsap.ticker.add(this.tick);
	}

	async load(url: string, onProgress?: (f: number) => void): Promise<CadStats> {
		const id = ++this.loadId;
		const gltf = await this.loader.loadAsync(url, (e) => e.total && onProgress?.(e.loaded / e.total));
		if (id !== this.loadId) throw new Error('superseded');
		return this.show(gltf.scene);
	}

	/**
	 * Mark-0 and the power conversion system together, stacked as the
	 * systems page stacks them (see assembly.ts): from the web models, which
	 * already leave out the exchanger's stand and the drive motors, with the
	 * exchanger and its outlet lifted onto the reactor and the stand-in pipe
	 * closing the gap in the down pipe. CAD only otherwise: none of the
	 * systems page's other stand-ins.
	 */
	async loadAssembly(onProgress?: (f: number) => void): Promise<CadStats> {
		const id = ++this.loadId;
		const files = Object.entries(ASSEMBLY).flatMap(([model, groups]) => groups.map((group) => ({ model, group })));
		const loaded = files.map(() => 0);
		const totals = files.map(() => 0);
		const gltfs = await Promise.all(
			files.map(({ model, group }, i) =>
				this.loader.loadAsync(`/models/cad/web/${model}/${group}.glb`, (e) => {
					loaded[i] = e.loaded;
					totals[i] = e.total;
					const total = totals.reduce((a, b) => a + b, 0);
					if (total && totals.every(Boolean)) onProgress?.(loaded.reduce((a, b) => a + b, 0) / total);
				})
			)
		);
		if (id !== this.loadId) throw new Error('superseded');

		// Each group baked to world space with its parts' lifts, so the two
		// models share one frame.
		const root = new THREE.Group();
		const v = new THREE.Vector3();
		gltfs.forEach((gltf, i) => {
			const { model, group } = files[i];
			gltf.scene.rotation.y = turnOf(model);
			gltf.scene.updateMatrixWorld(true);
			const meshes: THREE.Mesh[] = [];
			gltf.scene.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
			for (const src of meshes) {
				const g = src.geometry.clone();
				// The web models are quantised (16-bit positions, 8-bit normals):
				// to floats first, or moving them into world space clamps them to ±1.
				for (const name of ['position', 'normal']) {
					const a = g.getAttribute(name);
					if (!a) continue;
					const f = new Float32Array(a.count * 3);
					for (let k = 0; k < a.count; k++) [f[k * 3], f[k * 3 + 1], f[k * 3 + 2]] = [a.getX(k), a.getY(k), a.getZ(k)];
					g.setAttribute(name, new THREE.BufferAttribute(f, 3));
				}
				g.applyMatrix4(src.matrixWorld);
				const ids: string[] = src.userData.parts ?? [];
				const part = g.getAttribute('_part');
				const pos = g.getAttribute('position');
				for (let k = 0; k < pos.count; k++) {
					const lift = liftOf(model, group, part ? ids[part.getX(k)] : undefined);
					if (lift) pos.setY(k, v.fromBufferAttribute(pos, k).y + lift);
				}
				src.geometry.dispose();
				const mesh = new THREE.Mesh(g, src.material);
				mesh.name = `${model}/${group}`;
				root.add(mesh);
			}
		});
		const h = PHX_LIFT + 0.02;
		const filler = new THREE.CylinderGeometry(FILLER.radius, FILLER.radius, h, 32, 1, true);
		filler.translate(FILLER.x, FILLER.from + h / 2 - 0.01, FILLER.z);
		root.add(new THREE.Mesh(filler, new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.4, roughness: 0.5 })));
		return this.show(root);
	}

	/** Shows `root` in place of the current model and frames it. */
	private show(root: THREE.Object3D): CadStats {
		this.clear();
		root.updateMatrixWorld(true);

		let parts = 0;
		let triangles = 0;
		const materials = new Set<THREE.Material>();
		root.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			const count = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
			const g = mesh.geometry;
			parts += count;
			triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * count;
			for (const m of [mesh.material].flat()) {
				// CAD shells often have inconsistent winding, and the section
				// cut exposes the inside.
				m.side = THREE.DoubleSide;
				withCap(m);
				materials.add(m);
			}
			this.originals.set(mesh, mesh.material);
		});

		this.model = root;
		this.scene.add(root);
		this.box.setFromObject(root);
		this.setSection(this.axis, this.sectionAt);
		this.frameModel(false);

		const size = this.box.getSize(new THREE.Vector3());
		return { parts, triangles, materials: materials.size, size: [size.x, size.y, size.z] };
	}

	/** Moves the camera to a three-quarter view that fits the whole model. */
	frameModel(animate = true) {
		const r = this.box.getBoundingSphere(new THREE.Sphere()).radius || 1;
		this.camera.near = r / 100;
		this.camera.far = r * 100;
		this.camera.updateProjectionMatrix();
		this.controls.maxDistance = r * 20 * this.zoomFactor();
		this.frameBox(this.box, new THREE.Vector3(1, 0.6, 1.2), animate);
	}

	/** Fits `box` in view, looking along `dir` (default: the current view direction). */
	frameBox(box: THREE.Box3, dir?: THREE.Vector3, animate = true) {
		const sphere = box.getBoundingSphere(new THREE.Sphere());
		const r = sphere.radius || 1;
		const dist = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.05;
		const look = (dir ?? this.camera.position.clone().sub(this.controls.target)).normalize();
		const pos = sphere.center.clone().addScaledVector(look, dist);

		const duration = animate ? 1.2 : 0;
		const ease = 'power3.inOut';
		gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease, overwrite: true });
		gsap.to(this.controls.target, {
			x: sphere.center.x,
			y: sphere.center.y,
			z: sphere.center.z,
			duration,
			ease,
			overwrite: true,
			onUpdate: () => (this.dirty = true)
		});
	}

	/** `clay` swaps every part to one neutral material, to read form without the CAD colours. */
	private clay = false;
	/** One colour for every part (`setColor`), a satin finish like the clay's. */
	private paint = withCap(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }));
	private painted = false;

	setClay(on: boolean) {
		this.clay = on;
		this.applyMaterials();
	}

	/** Paints every part `color` (any CSS colour), or back to the CAD's own colours with null. Wins over clay. */
	setColor(color: string | null) {
		this.painted = color !== null;
		if (color) this.paint.color.set(color);
		this.applyMaterials();
	}

	private applyMaterials() {
		for (const [mesh, original] of this.originals) mesh.material = this.painted ? this.paint : this.clay ? CLAY : original;
		this.dirty = true;
	}

	setWireframe(on: boolean) {
		CLAY.wireframe = on;
		this.paint.wireframe = on;
		for (const original of this.originals.values()) for (const m of [original].flat()) (m as THREE.MeshStandardMaterial).wireframe = on;
		this.dirty = true;
	}

	/** Cuts the model along `axis`; `at` runs 0..1 across its bounds, and 1 shows everything. */
	setSection(axis: SectionAxis, at: number) {
		this.axis = axis;
		this.sectionAt = at;
		const normal = new THREE.Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
		const min = this.box.min[axis];
		const max = this.box.max[axis];
		// Pad past the bounds at 1 so nothing flickers on the edge.
		const cut = at >= 1 ? max + (max - min) : THREE.MathUtils.lerp(min, max, at);
		this.plane.set(normal, cut);
		this.renderer.clippingPlanes = at >= 1 ? [] : [this.plane];
		CAP.capOn.value = at >= 1 ? 0 : 1;
		this.dirty = true;
	}

	/** How much further away the camera sits at the current field of view than at the default 35°, for the same framing. */
	private zoomFactor(fov = this.camera.fov) {
		return Math.tan(THREE.MathUtils.degToRad(35 / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
	}

	/**
	 * Redraws the model as a line drawing (LineDrawing.ts), and flattens the
	 * view to match: a dolly zoom to a 4° lens, near enough orthographic to
	 * read as an axonometric drawing while keeping a hint of depth, settling
	 * at an isometric-ish height. Orbiting stays on, but tilting is held to
	 * the band a drawing would be seen from, so it turns like a turntable.
	 * Without `animate` it switches at once and leaves the camera to the caller.
	 */
	setLines(on: boolean, animate = true) {
		if (on === this.lines.on) return;
		this.lines.on = on;
		this.lines.drawing ??= new LineDrawing(this.renderer);
		this.applyLineStyle();
		// At once, lens and all, leaving the camera where it is.
		if (!animate) {
			this.lines.mix = on ? 1 : 0;
			this.camera.fov = on ? 4 : 35;
			this.camera.updateProjectionMatrix();
			this.dirty = true;
			return;
		}

		const target = this.controls.target;
		const offset = this.camera.position.clone().sub(target);
		const s = new THREE.Spherical().setFromVector3(offset);
		// Apparent size held constant through the zoom.
		const size = s.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		const [minPolar, maxPolar] = [THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(85)];
		const tween = {
			fov: this.camera.fov,
			polar: s.phi,
			mix: this.lines.mix
		};
		this.controls.minPolarAngle = 0;
		this.controls.maxPolarAngle = Math.PI;
		this.controls.enabled = false;
		gsap.to(tween, {
			fov: on ? 4 : 35,
			// 35.26° above the horizon is true isometric.
			polar: on ? THREE.MathUtils.degToRad(90 - 35.26) : s.phi,
			mix: on ? 1 : 0,
			duration: 1.4,
			ease: 'power3.inOut',
			overwrite: true,
			onUpdate: () => {
				this.camera.fov = tween.fov;
				this.camera.updateProjectionMatrix();
				s.phi = tween.polar;
				s.radius = size / Math.tan(THREE.MathUtils.degToRad(tween.fov / 2));
				this.camera.position.setFromSpherical(s).add(target);
				this.lines.mix = tween.mix;
				this.dirty = true;
			},
			onComplete: () => {
				const r = this.box.getBoundingSphere(new THREE.Sphere()).radius || 1;
				this.controls.maxDistance = r * 20 * this.zoomFactor();
				if (on) [this.controls.minPolarAngle, this.controls.maxPolarAngle] = [minPolar, maxPolar];
				this.controls.enabled = true;
			}
		});
	}

	/** The drawing's ink and paper (any CSS colour), the ink's opacity over the paper, and its line weight in CSS pixels. */
	setLineStyle(style: { ink?: string; paper?: string; opacity?: number; weight?: number }) {
		Object.assign(this.lines, style);
		this.applyLineStyle();
	}

	private applyLineStyle() {
		const drawing = this.lines.drawing;
		if (!drawing) return;
		drawing.setColors(this.lines.ink, this.lines.paper, this.lines.opacity);
		drawing.weight = this.lines.weight;
		this.dirty = true;
	}

	private clear() {
		if (!this.model) return;
		this.scene.remove(this.model);
		this.model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			mesh.geometry.dispose();
			for (const m of [this.originals.get(mesh) ?? mesh.material].flat()) m.dispose();
		});
		this.originals.clear();
		this.model = null;
	}

	protected resize() {
		const { clientWidth: w, clientHeight: h } = this.host;
		if (!w || !h) return;
		this.view = { width: w, height: h };
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.dirty = true;
	}

	private frame() {
		this.controls.update();
		if (this.dirty) {
			this.dirty = false;
			// Clip planes follow the camera out to the long lens's distance, near closed in for depth precision.
			const r = this.box.getBoundingSphere(new THREE.Sphere()).radius || 1;
			const distance = this.camera.position.distanceTo(this.controls.target);
			const near = Math.max(r / 100, distance - r * 2);
			const far = Math.max(r * 100, distance + r * 4);
			if (Math.abs(near - this.camera.near) > r / 1000 || far !== this.camera.far) {
				this.camera.near = near;
				this.camera.far = far;
				this.camera.updateProjectionMatrix();
			}
			const drawing = this.lines.drawing;
			if (this.lines.mix < 1) this.renderer.render(this.scene, this.camera);
			else this.renderer.clear();
			if (drawing && this.lines.mix > 0) {
				drawing.amount = this.lines.mix;
				drawing.render(this.scene, this.camera);
			}
			this.anchorTest.due = true;
		}
		const now = performance.now();
		if (this.anchorTest.due && now - this.anchorTest.last > 100) {
			this.anchorTest.due = false;
			this.anchorTest.last = now;
			this.testAnchors();
		}
		this.onFrame?.();
	}

	/** Screen position (CSS pixels, canvas-relative) of a world point, or null behind the camera. */
	project(p: THREE.Vector3): { x: number; y: number } | null {
		const v = p.clone().project(this.camera);
		if (v.z > 1) return null;
		const { width: w, height: h } = this.view;
		return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
	}

	/** The points to test for visibility, in order; `anchorVisible(i)` answers for each. */
	setAnchors(points: THREE.Vector3[]) {
		this.anchors = points;
		this.anchorShown = points.map(() => true);
		this.anchorTest.due = true;
	}

	anchorVisible(i: number) {
		return this.anchorShown[i] ?? true;
	}

	/**
	 * Renders every surface's distance from the camera at a quarter of the
	 * canvas's size and reads back a 5×5 patch round each anchor: a sample
	 * with a surface in front of the anchor by more than the slack (3 cm for
	 * the simplified surfaces, plus a sample's width at that distance for
	 * the quarter-size grid) is covered, and the section cut removing the
	 * anchor's side covers all of them. Anchors sit just proud of their
	 * part's surface (cadLabels.ts).
	 *
	 * A label hides once most of its patch is covered and shows again only
	 * once most is clear, so one near the edge of whatever's in front of it
	 * holds steady instead of blinking as samples cross the edge.
	 */
	private testAnchors() {
		if (!this.anchors.length || !this.model) return;
		const w = Math.max(1, Math.round(this.view.width / 4));
		const h = Math.max(1, Math.round(this.view.height / 4));
		if (this.distanceTarget.width !== w || this.distanceTarget.height !== h) this.distanceTarget.setSize(w, h);
		const clear = this.renderer.getClearAlpha();
		this.scene.overrideMaterial = this.distanceMaterial;
		this.renderer.setRenderTarget(this.distanceTarget);
		this.renderer.setClearAlpha(0);
		this.renderer.clear();
		this.renderer.render(this.scene, this.camera);
		this.scene.overrideMaterial = null;
		const px = new Float32Array(25 * 4);
		const view = new THREE.Vector3();
		const planes = this.renderer.clippingPlanes;
		// A sample's width one unit away.
		const sample = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
		this.anchorShown = this.anchors.map((p, i) => {
			const clear = this.anchorClear(p, w, h, sample, px, planes, view);
			const { hide, show } = this.anchorThresholds;
			return this.anchorShown[i] ? clear > hide : clear > show;
		});
		this.renderer.setRenderTarget(null);
		this.renderer.setClearAlpha(clear);
	}

	/** The share of the samples round anchor `p` with nothing in front of it, 0..1. */
	private anchorClear(
		p: THREE.Vector3,
		w: number,
		h: number,
		sample: number,
		px: Float32Array,
		planes: THREE.Plane[],
		view: THREE.Vector3
	) {
		// On the side the section cut removes: its part isn't there.
		if (planes.some((plane) => plane.distanceToPoint(p) < 0)) return 0;
		view.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
		const ndc = p.clone().project(this.camera);
		if (view.z >= 0 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) return 0;
		if (w < 5 || h < 5) return 1;
		const x = THREE.MathUtils.clamp(Math.floor(((ndc.x + 1) / 2) * w) - 2, 0, w - 5);
		const y = THREE.MathUtils.clamp(Math.floor(((ndc.y + 1) / 2) * h) - 2, 0, h - 5);
		this.renderer.readRenderTargetPixels(this.distanceTarget, x, y, 5, 5, px);
		const distance = -view.z;
		const reach = distance - 0.03 - distance * sample;
		let clear = 0;
		for (let k = 0; k < 25; k++) if (px[k * 4 + 3] === 0 || px[k * 4] >= reach) clear++;
		return clear / 25;
	}

	destroy() {
		this.distanceTarget.dispose();
		this.distanceMaterial.dispose();
		this.lines.drawing?.dispose();
		gsap.ticker.remove(this.tick);
		this.onFrame = null;
		this.resizeObserver.disconnect();
		this.controls.dispose();
		this.clear();
		this.scene.environment?.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}
