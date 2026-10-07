import * as THREE from 'three';
import { CAP, CadViewer, withCap, type CadStats } from './CadViewer';
import { CAD_GROUPS, SELECTION_COLOR, type CadTagsFile } from './cadGroups';

/**
 * CadViewer plus part selection and tagging, for sorting a `--parts`
 * conversion (every body its own node, named p00001…) into CAD_GROUPS.
 *
 * Picking is done on the GPU: each part is drawn in a flat colour that
 * encodes its index, into an offscreen target the size of the click or
 * the marquee, and the ids are read back. That is exact on 10k parts where
 * a raycast over millions of triangles would crawl, it only ever selects
 * what is actually visible, and it respects the section cut, so a part
 * deep inside the vessel is selected by cutting down to it.
 */

/** Index into a part's group: 0 is untagged, n is CAD_GROUPS[n - 1]. */
export type GroupIndex = number;
export type ViewMode = 'groups' | 'original';

interface Part {
	id: string;
	meshes: THREE.Mesh[];
	/** World-space bounds. */
	box: THREE.Box3;
	center: THREE.Vector3;
	triangles: number;
	/** Rotation-invariant fingerprint for "select similar": surface area (m²) and enclosed volume (m³). */
	area: number;
	volume: number;
}

export interface TaggerSnapshot {
	parts: number;
	/** Parts per group index; [0] is untagged. */
	counts: number[];
	selected: number;
	/** Details of the selection when it is a single part. */
	single: { id: string; group: GroupIndex; triangles: number; size: [number, number, number] } | null;
	hidden: number;
	isolated: boolean;
	canUndo: boolean;
	canRedo: boolean;
}

const PART_NAME = /^p\d{5}(-\d+)?$/;
/** Pointer travel, in CSS pixels, below which a press counts as a click rather than a drag. */
const CLICK_SLOP = 4;

export class PartTagger extends CadViewer {
	/** Fires after any change the panel shows. */
	onChange: (() => void) | null = null;
	/** Fires after the tags themselves change, for saving. */
	onTagsChange: (() => void) | null = null;

	mode: ViewMode = 'groups';
	/** Per group index; [0] is untagged. */
	readonly groupVisible: boolean[] = [true, ...CAD_GROUPS.map(() => true)];

	private parts: Part[] = [];
	private groupOf = new Uint8Array(0);
	private selected = new Set<number>();
	/** Hidden by hand (H) to reach what's behind; a view state, never saved. */
	private hiddenParts = new Set<number>();
	/** The parts shown alone by Isolate (I), fixed when it was pressed; null when off. */
	private isolated: Set<number> | null = null;
	private undoStack: [number, GroupIndex][][] = [];
	private redoStack: [number, GroupIndex][][] = [];

	private untaggedMaterial = withCap(
		new THREE.MeshStandardMaterial({ color: 0x9c9ca3, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide })
	);
	private groupMaterials = CAD_GROUPS.map((g) =>
		withCap(new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }))
	);
	private selectionMaterial = withCap(
		new THREE.MeshStandardMaterial({
			color: SELECTION_COLOR,
			emissive: SELECTION_COLOR,
			emissiveIntensity: 0.35,
			roughness: 0.5,
			side: THREE.DoubleSide
		})
	);
	private idMaterials: THREE.MeshBasicMaterial[] = [];
	private pickTarget = new THREE.WebGLRenderTarget(1, 1);

	private marquee: HTMLDivElement;
	private press: { x: number; y: number; shift: boolean; alt: boolean; toggle: boolean } | null = null;

	/** The viewer's cap colour, restored on destroy. */
	private capColor = CAP.capColor.value.clone();

	constructor(host: HTMLElement) {
		super(host);
		this.controls.zoomToCursor = true;
		// Orange caps would read as the Reactivity Controls group: cut in dark grey.
		CAP.capColor.value.set(0.22, 0.22, 0.24);
		this.marquee = document.createElement('div');
		this.marquee.className = 'marquee';
		this.marquee.hidden = true;
		host.appendChild(this.marquee);
		// Capture on the host runs before OrbitControls' own listener on the
		// canvas, so a Shift-drag can switch orbiting off before it starts.
		host.addEventListener('pointerdown', this.onPointerDown, { capture: true });
		addEventListener('pointermove', this.onPointerMove);
		addEventListener('pointerup', this.onPointerUp);
	}

	async load(url: string, onProgress?: (f: number) => void): Promise<CadStats> {
		const stats = await super.load(url, onProgress);
		this.collectParts();
		this.groupOf = new Uint8Array(this.parts.length);
		this.selected.clear();
		this.hiddenParts.clear();
		this.isolated = null;
		this.undoStack = [];
		this.redoStack = [];
		for (const m of this.idMaterials) m.dispose();
		this.idMaterials = this.parts.map((_, i) => {
			const id = i + 1; // 0 is the cleared background
			const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
			m.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, THREE.LinearSRGBColorSpace);
			return m;
		});
		this.refresh();
		return stats;
	}

	// ---- Tags ------------------------------------------------------------

	/** Puts the selection in `group` (0 untags it), then clears the selection so the result shows. */
	assign(group: GroupIndex) {
		if (!this.selected.size) return;
		const ops: [number, GroupIndex][] = [];
		for (const i of this.selected) {
			if (this.groupOf[i] === group) continue;
			ops.push([i, this.groupOf[i]]);
			this.groupOf[i] = group;
		}
		this.selected.clear();
		if (ops.length) {
			this.undoStack.push(ops);
			this.redoStack = [];
			this.onTagsChange?.();
		}
		this.refresh();
	}

	undo() {
		this.replay(this.undoStack, this.redoStack);
	}

	redo() {
		this.replay(this.redoStack, this.undoStack);
	}

	private replay(from: [number, GroupIndex][][], to: [number, GroupIndex][][]) {
		const ops = from.pop();
		if (!ops) return;
		to.push(ops.map(([i]) => [i, this.groupOf[i]]));
		for (const [i, g] of ops) this.groupOf[i] = g;
		this.onTagsChange?.();
		this.refresh();
	}

	toFile(model: string, source: string): CadTagsFile {
		const groups: Record<string, string[]> = {};
		CAD_GROUPS.forEach((g, n) => {
			groups[g.id] = this.parts.filter((_, i) => this.groupOf[i] === n + 1).map((p) => p.id);
		});
		return { model, source, groups };
	}

	/** Applies a saved tags file. Returns how many of its ids don't exist in this model. */
	fromFile(file: CadTagsFile): number {
		const index = new Map(this.parts.map((p, i) => [p.id, i]));
		let missing = 0;
		this.groupOf.fill(0);
		CAD_GROUPS.forEach((g, n) => {
			for (const id of file.groups[g.id] ?? []) {
				const i = index.get(id);
				if (i === undefined) missing++;
				else this.groupOf[i] = n + 1;
			}
		});
		this.undoStack = [];
		this.redoStack = [];
		this.refresh();
		return missing;
	}

	// ---- Selection -------------------------------------------------------

	clearSelection() {
		this.selected.clear();
		this.refresh();
	}

	/** Every visible part in `group`. */
	selectGroup(group: GroupIndex, add = false) {
		if (!add) this.selected.clear();
		this.parts.forEach((_, i) => this.groupOf[i] === group && this.isShown(i) && this.selected.add(i));
		this.refresh();
	}

	/**
	 * Adds every visible part shaped like one already selected: same surface
	 * area and volume within a percent or two, so copies placed and rotated
	 * anywhere (twelve drums, a hundred heat pipes) come in together.
	 */
	selectSimilar() {
		const refs = [...this.selected].map((i) => this.parts[i]);
		if (!refs.length) return;
		const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-9);
		this.parts.forEach((p, i) => {
			if (this.selected.has(i) || !this.isShown(i)) return;
			if (refs.some((r) => near(p.area, r.area, 0.01) && near(p.volume, r.volume, 0.02) && near(p.triangles, r.triangles, 0.1)))
				this.selected.add(i);
		});
		this.refresh();
	}

	/** Hides the selection for this session, to reach what's behind it. */
	hideSelected() {
		for (const i of this.selected) this.hiddenParts.add(i);
		this.selected.clear();
		this.refresh();
	}

	unhideAll() {
		this.hiddenParts.clear();
		this.isolated = null;
		this.refresh();
	}

	/** Shows only the current selection, and back. Selecting within it afterwards doesn't change what's shown. */
	toggleIsolate() {
		this.isolated = this.isolated || !this.selected.size ? null : new Set(this.selected);
		this.refresh();
	}

	frameSelection() {
		const ids = this.selected.size ? [...this.selected] : null;
		if (!ids) return this.frameModel();
		const box = new THREE.Box3();
		for (const i of ids) box.union(this.parts[i].box);
		this.frameBox(box);
	}

	setMode(mode: ViewMode) {
		this.mode = mode;
		this.refresh();
	}

	setGroupVisible(group: GroupIndex, visible: boolean) {
		this.groupVisible[group] = visible;
		if (!visible) for (const i of this.selected) if (this.groupOf[i] === group) this.selected.delete(i);
		this.refresh();
	}

	snapshot(): TaggerSnapshot {
		const counts = new Array(CAD_GROUPS.length + 1).fill(0);
		for (const g of this.groupOf) counts[g]++;
		let single: TaggerSnapshot['single'] = null;
		if (this.selected.size === 1) {
			const i = this.selected.values().next().value as number;
			const p = this.parts[i];
			const s = p.box.getSize(new THREE.Vector3());
			single = { id: p.id, group: this.groupOf[i], triangles: p.triangles, size: [s.x, s.y, s.z] };
		}
		return {
			parts: this.parts.length,
			counts,
			selected: this.selected.size,
			single,
			hidden: this.hiddenParts.size,
			isolated: this.isolated !== null,
			canUndo: this.undoStack.length > 0,
			canRedo: this.redoStack.length > 0
		};
	}

	// ---- Internals -------------------------------------------------------

	private collectParts() {
		this.parts = [];
		const visit = (o: THREE.Object3D) => {
			if (PART_NAME.test(o.name)) {
				const meshes: THREE.Mesh[] = [];
				o.traverse((c) => (c as THREE.Mesh).isMesh && meshes.push(c as THREE.Mesh));
				if (meshes.length) this.parts.push(measure(o.name, o, meshes));
				return;
			}
			for (const c of o.children) visit(c);
		};
		if (this.model) visit(this.model);
	}

	private isShown(i: number) {
		return (
			this.groupVisible[this.groupOf[i]] && !this.hiddenParts.has(i) && (!this.isolated || this.isolated.has(i))
		);
	}

	/** Re-derives every part's material and visibility from the state. */
	private refresh() {
		for (let i = 0; i < this.parts.length; i++) {
			const shown = this.isShown(i);
			const g = this.groupOf[i];
			for (const mesh of this.parts[i].meshes) {
				mesh.visible = shown;
				mesh.material = this.selected.has(i)
					? this.selectionMaterial
					: this.mode === 'original'
						? (this.originals.get(mesh) ?? mesh.material)
						: g
							? this.groupMaterials[g - 1]
							: this.untaggedMaterial;
			}
		}
		this.dirty = true;
		this.onChange?.();
	}

	/** Part indices visible inside a canvas-space rectangle (CSS pixels). */
	private pickRect(x: number, y: number, w: number, h: number): Set<number> {
		const canvas = this.renderer.domElement;
		const W = canvas.clientWidth;
		const H = canvas.clientHeight;
		x = Math.max(0, Math.floor(x));
		y = Math.max(0, Math.floor(y));
		w = Math.max(1, Math.min(W - x, Math.ceil(w)));
		h = Math.max(1, Math.min(H - y, Math.ceil(h)));

		this.parts.forEach((p, i) => p.meshes.forEach((m) => (m.material = this.idMaterials[i])));
		this.pickTarget.setSize(w, h);
		this.camera.setViewOffset(W, H, x, y, w, h);
		const clear = this.renderer.getClearColor(new THREE.Color());
		const alpha = this.renderer.getClearAlpha();
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.setRenderTarget(this.pickTarget);
		this.renderer.render(this.scene, this.camera);
		const buf = new Uint8Array(w * h * 4);
		this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, w, h, buf);
		this.renderer.setRenderTarget(null);
		this.renderer.setClearColor(clear, alpha);
		this.camera.clearViewOffset();

		const found = new Set<number>();
		for (let k = 0; k < buf.length; k += 4) {
			const id = buf[k] | (buf[k + 1] << 8) | (buf[k + 2] << 16);
			if (id) found.add(id - 1);
		}
		this.refresh();
		return found;
	}

	/**
	 * Parts whose centre falls inside the rectangle, hidden behind others or
	 * not: for grabbing a whole buried cluster at once. Still skips parts
	 * that are hidden or sit on the cut-away side of the section.
	 */
	private pickRectThrough(x: number, y: number, w: number, h: number): Set<number> {
		const canvas = this.renderer.domElement;
		const W = canvas.clientWidth;
		const H = canvas.clientHeight;
		const cut = this.renderer.clippingPlanes.length ? this.plane : null;
		const v = new THREE.Vector3();
		const found = new Set<number>();
		this.parts.forEach((p, i) => {
			if (!this.isShown(i) || (cut && cut.distanceToPoint(p.center) < 0)) return;
			v.copy(p.center).project(this.camera);
			if (v.z > 1) return;
			const sx = ((v.x + 1) / 2) * W;
			const sy = ((1 - v.y) / 2) * H;
			if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) found.add(i);
		});
		return found;
	}

	private local(e: PointerEvent) {
		const r = this.renderer.domElement.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	private onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 || e.target !== this.renderer.domElement) return;
		// The canvas can't take focus, so a panel control (the model picker)
		// would keep it and swallow the tagging keys.
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		const { x, y } = this.local(e);
		this.press = { x, y, shift: e.shiftKey, alt: e.altKey, toggle: e.shiftKey || e.metaKey || e.ctrlKey };
		// Shift-drag draws a marquee instead of panning.
		this.controls.enabled = !e.shiftKey;
	};

	private onPointerMove = (e: PointerEvent) => {
		if (!this.press?.shift) return;
		const { x, y } = this.local(e);
		const m = this.marquee;
		m.hidden = false;
		m.style.left = `${Math.min(x, this.press.x)}px`;
		m.style.top = `${Math.min(y, this.press.y)}px`;
		m.style.width = `${Math.abs(x - this.press.x)}px`;
		m.style.height = `${Math.abs(y - this.press.y)}px`;
	};

	private onPointerUp = (e: PointerEvent) => {
		const press = this.press;
		this.press = null;
		this.controls.enabled = true;
		this.marquee.hidden = true;
		if (!press || e.button !== 0) return;
		const { x, y } = this.local(e);
		const moved = Math.hypot(x - press.x, y - press.y) > CLICK_SLOP;

		if (press.shift && moved) {
			const rx = Math.min(x, press.x);
			const ry = Math.min(y, press.y);
			const rw = Math.abs(x - press.x);
			const rh = Math.abs(y - press.y);
			const hits = press.alt ? this.pickRectThrough(rx, ry, rw, rh) : this.pickRect(rx, ry, rw, rh);
			for (const i of hits) this.selected.add(i);
			this.refresh();
			return;
		}
		if (moved) return; // an orbit, not a click

		const hit = this.pickRect(x, y, 1, 1).values().next().value;
		if (press.toggle) {
			if (hit !== undefined) {
				if (this.selected.has(hit)) this.selected.delete(hit);
				else this.selected.add(hit);
			}
		} else {
			this.selected.clear();
			if (hit !== undefined) this.selected.add(hit);
		}
		this.refresh();
	};

	destroy() {
		this.host.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
		removeEventListener('pointermove', this.onPointerMove);
		removeEventListener('pointerup', this.onPointerUp);
		this.marquee.remove();
		for (const m of [...this.idMaterials, ...this.groupMaterials, this.untaggedMaterial, this.selectionMaterial]) m.dispose();
		this.pickTarget.dispose();
		CAP.capColor.value.copy(this.capColor);
		super.destroy();
	}
}

/** Bounds, triangle count and the area/volume fingerprint of one part, all in world space. */
function measure(id: string, root: THREE.Object3D, meshes: THREE.Mesh[]): Part {
	const box = new THREE.Box3().setFromObject(root);
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	const ab = new THREE.Vector3();
	const ac = new THREE.Vector3();
	let triangles = 0;
	let area = 0;
	let volume = 0;
	for (const mesh of meshes) {
		const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
		const index = mesh.geometry.index;
		const count = index ? index.count : pos.count;
		const m = mesh.matrixWorld;
		triangles += count / 3;
		for (let k = 0; k < count; k += 3) {
			a.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(m);
			b.fromBufferAttribute(pos, index ? index.getX(k + 1) : k + 1).applyMatrix4(m);
			c.fromBufferAttribute(pos, index ? index.getX(k + 2) : k + 2).applyMatrix4(m);
			ab.subVectors(b, a);
			ac.subVectors(c, a);
			area += ab.cross(ac).length() / 2;
			volume += a.dot(b.cross(c)) / 6;
		}
	}
	return { id, meshes, box, center: box.getCenter(new THREE.Vector3()), triangles, area, volume: Math.abs(volume) };
}
