import * as THREE from 'three';
import gsap from 'gsap';
import { CadViewer } from './CadViewer';

/**
 * The landing page's isometric view of R1: Mark-0 and the power conversion
 * system assembled (CadViewer.loadAssembly), drawn as lines on a 4° lens,
 * near enough orthographic to read as a drawing. `pose` sets the camera,
 * from the front elevation the section diagram is drawn in (0) round to
 * the isometric (1), so the switch between the two views can turn one into
 * the other; `rotate` adds the visitor's own turn and tilt on top.
 *
 * Every diagram marker is pinned to the model here (ANCHORS); four of
 * them only approximately, as their parts aren't in the CAD.
 */

/**
 * Where each diagram marker sits on the assembled model, by its label: the
 * assembled frame, Y-up metres, about 1 cm proud of a surface the
 * isometric camera sees (picked by raycasting from the default view).
 *
 * Only three are real. The CAD's skid holds a single shell-and-tube vessel,
 * its pipework, valves, frame and an end panel; the turbine, compressor
 * and alternator (one shaft unit in the product video) and the waste heat
 * rejection aren't modelled. Those four stand where they plausibly would,
 * following the section's reading order, and need confirming with Antares.
 */
export const ANCHORS: Record<string, [number, number, number]> = {
	// The exchanger's shell under its dome (cadLabels point 5, lifted onto the reactor).
	'Primary heat exchanger': [0.46, 4.09, 0.46],
	// The shield vessel's side, level with the core inside it.
	'Nuclear core': [0.787, 1.9, 0.787],
	// The skid's shell-and-tube vessel, on its end facing the camera.
	Recuperator: [1.547, 1.308, -3.746],
	// Approximate: where the hot leg from the exchanger comes down into the skid.
	Turbine: [-0.023, 1.204, -3.128],
	// Approximate: the valve cluster along the top of the skid.
	Compressor: [0.827, 2.663, -4.125],
	// Approximate: further along the top of the skid, towards its far end.
	Alternator: [2.452, 2.442, -4.23],
	// Approximate: the skid's end panel.
	'Waste heat rejection': [3.8, 1.499, -3.925]
};

/** The isometric: turned 45° from the elevation, looking down 30°. */
const ISO = { turn: THREE.MathUtils.degToRad(45), tilt: THREE.MathUtils.degToRad(30) };
/** How far the visitor may tilt the view: from just above level to well above, radians. */
const TILT_RANGE = [THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(70)] as const;

/** The camera's direction from its target, and the view's right and up, for a turn and tilt. */
function axes(turn: number, tilt: number) {
	const dir = new THREE.Vector3(Math.cos(tilt) * Math.cos(turn), Math.sin(tilt), Math.cos(tilt) * Math.sin(turn));
	const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
	const up = new THREE.Vector3().crossVectors(right, dir.clone().negate()).normalize();
	return { dir, right, up };
}

/**
 * How much of the view's height or width the model fills: about as much as
 * the section drawing fills its frame, which leaves stage above and below.
 */
const FILL = 0.72;

export class IsoDrawing extends CadViewer {
	private posed = 0;
	private corners = Array.from({ length: 8 }, () => new THREE.Vector3());

	constructor(host: HTMLElement) {
		super(host);
		// The anchors are picked to be seen, but through the skid's frame and
		// pipework: much of the patch round one can be covered by thin bars.
		this.anchorThresholds = { hide: 0.1, show: 0.3 };
		this.controls.enabled = false;
		// OrbitControls claims touches on the canvas; give them back to the page.
		this.renderer.domElement.style.touchAction = '';
	}

	/** Where the marker labelled `label` sits on the model, or null if its part isn't in the CAD. */
	static anchor(label: string) {
		const at = ANCHORS[label];
		return at ? new THREE.Vector3(...at) : null;
	}

	/** Loads the assembly and shows it as a drawing at the current pose. */
	async open(onProgress?: (f: number) => void) {
		await this.loadAssembly(onProgress);
		// Loading frames the model with a (zero-length) tween; the pose decides instead.
		gsap.killTweensOf([this.camera.position, this.controls.target]);
		this.setLines(true, false);
		this.pose(this.posed);
	}

	/** The visitor's turn about the vertical and tilt, radians, on top of the isometric's own (`rotate`). */
	private turned = { turn: 0, tilt: 0 };

	/**
	 * Turns the isometric by `turn` about the vertical (any amount) and tilts
	 * it by `tilt`, held so the view looks down between TILT_RANGE. Scaled
	 * with the pose, so on the way back to the elevation it unwinds.
	 */
	rotate(turn: number, tilt: number) {
		this.turned = { turn, tilt };
		this.pose(this.posed);
	}

	/** The tilt offsets `rotate` allows, radians. */
	readonly tiltRange = [TILT_RANGE[0] - ISO.tilt, TILT_RANGE[1] - ISO.tilt] as const;

	/**
	 * Places the camera between the front elevation (0: looking along −x,
	 * the reactor on the left and the skid on the right, as the section has
	 * them) and the isometric (1), fitting the model to the view at each.
	 * The fit is made at the pose without the visitor's turn, and kept as it
	 * turns, so the model doesn't grow and shrink while it's being turned.
	 */
	pose(t: number) {
		this.posed = t;
		if (this.box.isEmpty()) return;
		const center = this.box.getCenter(new THREE.Vector3());

		// The model's extent across and up the view, from its bounding box's corners.
		const fit = axes(ISO.turn * t, ISO.tilt * t);
		const { min, max } = this.box;
		let i = 0;
		for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) this.corners[i++].set(x, y, z);
		let [r0, r1, u0, u1] = [Infinity, -Infinity, Infinity, -Infinity];
		for (const c of this.corners) {
			const v = c.clone().sub(center);
			const r = v.dot(fit.right);
			const u = v.dot(fit.up);
			[r0, r1, u0, u1] = [Math.min(r0, r), Math.max(r1, r), Math.min(u0, u), Math.max(u1, u)];
		}
		const half = Math.max((u1 - u0) / 2, (r1 - r0) / 2 / this.camera.aspect) / FILL;
		const distance = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));

		const tilt = THREE.MathUtils.clamp((ISO.tilt + this.turned.tilt) * t, 0, TILT_RANGE[1]);
		const { dir, right, up } = axes((ISO.turn + this.turned.turn) * t, tilt);
		const target = center
			.clone()
			.addScaledVector(right, (r0 + r1) / 2)
			.addScaledVector(up, (u0 + u1) / 2);

		this.controls.target.copy(target);
		this.camera.position.copy(target).addScaledVector(dir, distance);
		this.camera.up.set(0, 1, 0);
		this.camera.lookAt(target);
		this.dirty = true;
	}

	/** Holds the pose through a resize, which changes the aspect it was fitted to. */
	protected override resize() {
		super.resize();
		this.pose(this.posed);
	}
}
