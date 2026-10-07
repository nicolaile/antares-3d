import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Type-only: these three passes ship off and are imported on demand in
// `addOptionalPasses`, so their shader source stays out of the bundle
// unless a scene actually turns one on.
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import type { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ContactShadow } from './ContactShadow';
import { createGrainPass } from './GrainPass';
import {
	DEFAULT_STOPS,
	GradientMapPass,
	type GradientStop,
	type MixSpace,
	type RepeatMode
} from './GradientMapPass';
import { applySurfaceVariation } from './surfaceVariation';
import { SweepPass, type SweepOptions } from './SweepPass';
import {
	applyStudioShade,
	shadeDirection,
	SHADE_DEFAULTS,
	type StudioShadeOptions,
	type StudioShadeUniforms
} from './studioShade';

/**
 * Surface finishes. Values are lifted from gentle.systems' Bingo scene, which
 * is the reference for this look, then adjusted for a single-material model.
 *
 *  satin     – matte plastic with a thin clearcoat sheen (the red dog)
 *  metal     – polished coloured metal, big soft highlights
 *  glass     – real refraction; the scene behind bends through the shell
 *  diffusion – translucent, light scatters inside and tints with thickness
 */
export type MaterialPreset = 'satin' | 'metal' | 'glass' | 'diffusion';

/** Half the height of a group's glow front (`setGlow`'s sweep), metres. */
const GLOW_SOFT = 0.25;

/**
 * A group's glow from within (its emissive), by height in the authored
 * frame: everything above the front (below it, with `uGlowUp`, for a glow
 * rising), a band at it brighter by the crest.
 */
function glowFromWithin(
	shader: THREE.WebGLProgramParametersWithUniforms,
	uniforms: {
		uGlowFront: { value: number };
		uGlowCrest: { value: number };
		uGlowSoft: { value: number };
		uGlowUp: { value: number };
		uGlowFrame: { value: THREE.Matrix4 };
	}
) {
	Object.assign(shader.uniforms, uniforms);
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nuniform mat4 uGlowFrame;\nvarying float vGlowY;')
		.replace(
			'#include <project_vertex>',
			/* glsl */ `#include <project_vertex>
			{
				vec4 glowAt = vec4( transformed, 1.0 );
				#ifdef USE_INSTANCING
					glowAt = instanceMatrix * glowAt;
				#endif
				vGlowY = ( uGlowFrame * modelMatrix * glowAt ).y;
			}`
		);
	shader.fragmentShader = shader.fragmentShader
		.replace(
			'#include <common>',
			/* glsl */ `#include <common>
			uniform float uGlowFront;
			uniform float uGlowCrest;
			uniform float uGlowSoft;
			uniform float uGlowUp;
			varying float vGlowY;`
		)
		.replace(
			'#include <emissivemap_fragment>',
			/* glsl */ `#include <emissivemap_fragment>
			{
				float above = smoothstep( uGlowFront - uGlowSoft, uGlowFront + uGlowSoft, vGlowY );
				float lit = mix( above, 1.0 - above, uGlowUp );
				float band = ( vGlowY - uGlowFront ) / uGlowSoft;
				totalEmissiveRadiance *= lit + exp( -band * band ) * uGlowCrest;
			}`
		);
}

export interface ModelViewerOptions {
	/**
	 * Path to the optimised .glb (meshopt-compressed, GPU-instanced), or
	 * several that make one model between them (the CAD's groups), loaded
	 * together and placed as authored.
	 */
	url: string | string[];
	/** Equirectangular .hdr for image-based lighting. Omit to fall back to the procedural studio. */
	hdr?: string;
	material?: MaterialPreset;
	/** Base colour for the preset. */
	color?: THREE.ColorRepresentation;
	/** Multiplier on the auto-computed framing distance. */
	fitOffset?: number;
	/** Scales the whole HDRI contribution; 1 = as authored. */
	environmentIntensity?: number;
	bloom?: { strength: number; threshold: number } | false;
	/** Screen-space ambient occlusion for crevice contrast. */
	ao?: boolean;
	/** Soft depth-based ground shadow. */
	contactShadow?: boolean;
	/** Slow vertical drift so a still frame never reads as frozen. */
	breathe?: boolean;
	/** Steady horizontal spin in radians per second; 0 disables. */
	autoRotate?: number;
	/** 0..1 while the model streams in. */
	onProgress?: (fraction: number) => void;
	/** Film-grain amount in display space. `false` omits the pass entirely. */
	grain?: number | false;
	/** Directional shadow from the key onto the floor (in addition to the contact shadow). */
	groundShadow?: boolean;
	/** World-space roughness/albedo variation; 0 disables. */
	surfaceVariation?: number;
	/**
	 * Luminance-to-colour gradient map, applied last in display space.
	 * The pass is always built so its controls stay live; `on` sets the
	 * starting state of the toggle.
	 */
	gradientMap?: {
		on?: boolean;
		stops?: GradientStop[];
		repeat?: RepeatMode;
		space?: MixSpace;
		amount?: number;
		/** Drive the ramp offset from pointer position. */
		followPointer?: boolean;
		/** Seconds for the pointer value to catch up; higher is smoother. */
		followDamping?: number;
	} | false;
	/**
	 * Starting values for any live render parameter — same names as the
	 * controls panel, so a look dialled in there transfers here verbatim.
	 * Applied last, so it wins over every other option.
	 */
	params?: Partial<RenderParams>;
	/**
	 * Studio look: a lit backdrop sweep behind the model (SweepPass) plus a
	 * single-softbox shadow term on the material (studioShade). Independent
	 * of the gradient map. Always built so its controls stay live; `on` sets
	 * the starting state of the toggle, which also applies `STUDIO_PRESET`.
	 */
	studio?: ({ on?: boolean; shade?: StudioShadeOptions } & SweepOptions) | false;
	/** Screen-space reflections on the model's own surfaces. `false` disables. */
	ssr?: { opacity?: number } | false;
	/** Depth of field, focused on the camera target. `false` disables. */
	dof?: { maxblur?: number } | false;
	/**
	 * Join every non-instanced part into one mesh at load. They all share one
	 * material, so the split into 110 draws was an accident of the export,
	 * and each scene render per frame (shadow, beauty) paid for it. Default on.
	 */
	mergeMeshes?: boolean;
	/**
	 * The model's groups, by node name (the CAD's f1_cradle, f2_drives, …):
	 * each is merged on its own and gets its own copy of the material, so it
	 * can be brightened, dimmed, hidden or cut open apart from the rest
	 * (`setGroup`). Replaces the one merge across the whole model.
	 */
	groups?: string[];
	/**
	 * Where the cutaway's axis stands, [x, z] in the model's authored frame:
	 * the vessel's centre line. Default the origin, where both CAD files
	 * put theirs.
	 */
	cutAxis?: [number, number];
	/**
	 * Groups to split into pieces that move apart (`setGroup`'s `out`): into
	 * `fold` sectors round the axis (12 for the drums, a piece each), the
	 * first centred on `phase` (radians, in the model's authored frame from x
	 * towards z; without it, read from the group's own pattern), into its
	 * `layers` by height (a core's), or into its `columns`, one piece per
	 * upright run (a heat pipe each). Needs the CAD's per-vertex part index
	 * (`_part`).
	 */
	explode?: Record<string, { fold?: number; phase?: number; layers?: boolean; columns?: boolean }>;
	/**
	 * New groups carved out of others: the parts of `from` whose middles lie
	 * in the box `min`–`max` (the authored frame), and no bigger than
	 * `maxSize` across if it's given, become a group of their own, named by
	 * the key, to show or cut apart from the rest. Carves run in order, so
	 * one can be carved out of an earlier one. List the
	 * name in `groups` too. Needs the CAD's part index (`_part`).
	 */
	carve?: Record<string, { from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }>;
	/**
	 * Groups whose cut (`setGroup`'s `cut`) is a half-section rather than the
	 * wedge: one plane through the axis at `at` running `along` (authored
	 * frame), facing the camera, `radius` the part's own; 0 shut, 1 cut to
	 * the axis.
	 */
	sections?: Record<string, { at: [number, number, number]; along: [number, number, number]; radius: number }>;
	/** Cap on the device pixel ratio. Phones pass less: their GPUs pay per pixel. Default 2. */
	maxPixelRatio?: number;
	/** Resolution of the occlusion pass relative to the frame; 0.5 is a quarter of the pixels. Default 1. */
	aoScale?: number;
}

/**
 * Every render parameter the on-screen controls can change. All of these take
 * effect on the next frame — nothing here needs a reload. Deliberately does NOT
 * include surface variation or the material preset, which are baked at load.
 */
export interface RenderParams {
	color: string;
	roughness: number;
	metalness: number;
	clearcoat: number;
	coatRoughness: number;
	materialEnv: number;
	key: number;
	rim: number;
	ambient: number;
	environment: number;
	exposure: number;
	bloom: number;
	bloomThreshold: number;
	ao: number;
	grain: number;
	shadow: number;
	/** 0/1 toggle for the gradient map. */
	gradient: number;
	gradientAmount: number;
	gradientScatter: number;
	gradientFrequency: number;
	gradientOffset: number;
	/** 0/1 toggle for pointer-driven ramp offset. */
	gradientTrack: number;
	/** 0/1 master toggle for the studio look: sweep pass, shade term and lighting preset. */
	studio: number;
	sweepLight: string;
	sweepDark: string;
	sweepAngle: number;
	sweepMid: number;
	sweepSpread: number;
	sweepFalloff: number;
	shadeAzimuth: number;
	shadeElevation: number;
	shadeCoverage: number;
	shadeSoftness: number;
	shadeDepth: number;
	studioGrain: number;
	sweepCurve: number;
	sweepLift: number;
	/** Backdrop light picked up at grazing angles. */
	studioBounce: number;
	/** Grain cell size, device pixels. */
	studioGrainSize: number;
	/** Grain re-rolls per second; 0 = static. */
	studioGrainSpeed: number;
	/** 0/1: the real key light follows the shade direction, so cast shadows agree with the terminator. */
	studioKey: number;
}

/**
 * Applied when the studio look is switched on, and undone when it goes off.
 * The default rig is near-chrome under a bright HDRI, which shows the
 * environment rather than a diffuse terminator; the shade term needs a
 * matte-leaning surface with the surround pulled down to read.
 */
const STUDIO_PRESET: Partial<RenderParams> = {
	metalness: 0.2,
	roughness: 0.55,
	clearcoat: 0.3,
	coatRoughness: 0.5,
	materialEnv: 0.8,
	key: 9,
	rim: 0,
	ambient: 0,
	environment: 0.3
};
const STUDIO_KEYS = Object.keys(STUDIO_PRESET) as (keyof RenderParams)[];

/**
 * Framework-agnostic three.js scene. Deliberately does NOT own a rAF loop —
 * `render()` is called from the shared GSAP ticker so Lenis, ScrollTrigger and
 * the renderer all advance on one clock. See `$lib/scroll.ts`.
 */
/** The lens the establishing shot is composed for, in degrees. */
const DEFAULT_FOV = 38;
/** Draw rate for a turn that is only the slow auto-rotation (60: a smooth turn, at the cost of a frame each refresh). */
const SPIN_FPS = 60;
/** Frames longer than this (under ~55 fps) step adaptive quality down (`keepPace`). */
const SLOW_FRAME_MS = 18;
/** A step down has to make frames at least this much faster to stay (`keepPace`, `probe`). */
const STEP_GAIN = 0.92;
/** The pixel ratios adaptive resolution steps down through. */
const PIXEL_RATIOS = [2, 1.5, 1.25, 1];

export class ModelViewer {
	readonly scene = new THREE.Scene();
	readonly camera: THREE.PerspectiveCamera;
	readonly renderer: THREE.WebGLRenderer;
	/** Wrapper around the loaded glTF root — animate this, not the glTF node. */
	readonly root = new THREE.Group();
	/** Point the camera is kept aimed at; safe for GSAP to tween. */
	readonly target = new THREE.Vector3();
	/**
	 * Rotation is two layers summed every frame: the scroll timeline tweens
	 * `scrollRotation`, the cursor drag accumulates into `userRotation`.
	 * Neither overwrites the other, so you can spin the model mid-scroll.
	 * `z` leans the whole model sideways about the line of sight, after its
	 * spin and tilt (the root turns Z-last: `ZXY`), so it leans the same
	 * way on screen however it has turned.
	 */
	readonly scrollRotation = { x: 0, y: 0, z: 0 };
	readonly userRotation = { x: 0, y: 0 };
	/** Gates `autoRotate` without losing the angle it has reached — a pause. */
	spinning = true;
	/** How far the slow turn (`autoRotate`) has taken the model, radians. */
	get autoTurn() {
		return this.autoRotation;
	}
	/** The one material every part shares. Tweak live: viewer.material.roughness = … */
	material!: THREE.MeshPhysicalMaterial;
	/** Where the model sits in `root`: its authored frame, recentred (`toRoot`). */
	private offset = new THREE.Vector3();
	/**
	 * A point in the model's authored frame (the glTF's world space, as on
	 * /cad) moved into `root`'s, so it turns with the model.
	 */
	toRoot(at: THREE.Vector3) {
		return at.clone().add(this.offset);
	}

	/** Passes over the finished frame (`addOverlay`), each with whether it moves on its own. */
	private overlays: (() => boolean)[] = [];
	/**
	 * A pass over the finished frame, after tone mapping, so its colours
	 * come out as authored (the landing's energy trails): before the grain
	 * and the backdrop. While `animated` says so, frames keep coming.
	 */
	addOverlay(pass: Pass, animated: () => boolean) {
		this.composer.insertPass(pass, this.composer.passes.indexOf(this.outputPass) + 1);
		this.overlays.push(animated);
		this.overlayPasses.add(pass);
		this.invalidate();
		// Its programs built now, while it draws nothing, not the first time it lights up.
		if (this.warmed) void this.warmUp({ groups: false });
	}
	private overlayPasses = new Set<Pass>();
	/** Whether `warmUp` has run: overlays added later warm up on their own. */
	private warmed = false;

	/** The model's depth as last drawn, cutaways and all. */
	get sceneDepth(): THREE.DepthTexture | null {
		return this.beauty.depthTexture;
	}

	/**
	 * The model's groups (`groups` option): each merged on its own, with
	 * its own copy of the material and its own cutaway planes.
	 */
	private groups = new Map<
		string,
		{
			node: THREE.Object3D;
			material: THREE.MeshPhysicalMaterial;
			planes: THREE.Plane[];
			level: number;
			cut: number;
			out: number;
			up: number;
			pieces: Piece[];
			/** Split into pieces (`explode`): the sectors' pattern, the first's angle in the axis's plane (x to z). */
			fold?: number;
			phase?: number;
		}
	>();

	/**
	 * Where a split group opens between two of its pieces, nearest to
	 * `angle`: angles about the axis, in the model's authored frame, from x
	 * towards z. Null for a group that isn't split.
	 */
	seamNear(name: string, angle: number) {
		const g = this.groups.get(name);
		if (!g?.fold) return null;
		const step = (Math.PI * 2) / g.fold;
		const first = g.phase! + step / 2;
		return first + Math.round((angle - first) / step) * step;
	}

	/** The group names the model was loaded with that it actually has. */
	get groupNames() {
		return [...this.groups.keys()];
	}

	/**
	 * A group lit from within, `amount` 0 for not (the landing's 04: the
	 * core and its heat pipes warming as the pipes seat): its own glow, in
	 * the scene, so tone mapped with the rest. With a `sweep`, only what's
	 * above `front` (a height in the authored frame, metres) glows, or below
	 * it with `up` (the glow rising, as into 05's exchanger), a band at the
	 * front brighter by `crest` (1: twice as bright); without, all of it
	 * evenly.
	 */
	setGlow(
		name: string,
		amount: number,
		color: THREE.ColorRepresentation,
		sweep?: { front: number; crest: number; up?: boolean }
	) {
		const g = this.groups.get(name);
		if (!g) return;
		g.material.emissive.set(color);
		g.material.emissiveIntensity = amount;
		const u = g.material.userData.glow;
		u.uGlowFront.value = sweep?.front ?? -1e4;
		u.uGlowCrest.value = sweep?.crest ?? 0;
		u.uGlowUp.value = sweep?.up ? 1 : 0;
		this.invalidate();
	}
	/** World to the authored frame, for the groups' glow: their heights, whatever the turn. */
	private glowFrame = { value: new THREE.Matrix4() };
	private toAuthored = new THREE.Matrix4();

	/**
	 * Sets how a group shows. `level` is its opacity, 1 solid, fading to 0
	 * where it's gone (and stops being drawn at all). `cut` opens a wedge in it facing the
	 * camera, about its axis (`cutAxis`): 0 closed, 1 open 160°. `out`
	 * moves its pieces (`explode`) that far from the axis, each along its own
	 * spoke, and `up` lifts the whole group, both in metres.
	 */
	setGroup(name: string, state: { level?: number; cut?: number; out?: number; up?: number }) {
		const g = this.groups.get(name);
		if (!g) return;
		if (state.level !== undefined) g.level = state.level;
		if (state.cut !== undefined) g.cut = state.cut;
		if (state.out !== undefined) g.out = state.out;
		if (state.up !== undefined) g.up = state.up;
		this.syncGroup(g);
		for (const piece of g.pieces) this.placePiece(piece, g);
		this.invalidate();
	}

	/** A piece where its group's taking apart and its own lift put it. */
	private placePiece(piece: Piece, g: { out: number; up: number }) {
		piece.mesh.position
			.copy(piece.base)
			.addScaledVector(piece.out, g.out)
			.addScaledVector(piece.up, g.up + (piece.lift ?? 0));
	}

	/**
	 * A group's pieces (`explode`), each with how far it is from the axis,
	 * for moving them one by one (`liftPiece`).
	 */
	piecesOf(name: string) {
		return (this.groups.get(name)?.pieces ?? []).map((p, index) => ({ index, away: p.away ?? 0 }));
	}

	/** Lifts one of a group's pieces on its own, metres, on top of the group's `up`. */
	liftPiece(name: string, index: number, lift: number) {
		const g = this.groups.get(name);
		const piece = g?.pieces[index];
		if (!g || !piece) return;
		piece.lift = lift;
		this.placePiece(piece, g);
		this.invalidate();
	}

	/** Whether a group is drawn at all (`setGroup`'s level above 0). */
	groupShown(name: string) {
		const g = this.groups.get(name);
		return !g || g.node.visible;
	}

	/**
	 * Moves the parts of group `from` whose middles lie in a box into a new
	 * group `name`: the source keeps the rest of its triangles, the new
	 * group's mesh the box's, sharing the vertex data, placed where the
	 * source draws them.
	 */
	private async carveGroup(
		model: THREE.Object3D,
		name: string,
		spec: { from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }
	) {
		const node = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(spec.from));
		if (!node) return;
		model.updateMatrixWorld(true);
		const box = new THREE.Box3(new THREE.Vector3(...spec.min), new THREE.Vector3(...spec.max));
		const holder = new THREE.Group();
		holder.name = THREE.PropertyBinding.sanitizeNodeName(name);
		model.add(holder);
		const meshes: THREE.Mesh[] = [];
		node.traverse((o) => {
			if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('_part')) meshes.push(o as THREE.Mesh);
		});
		const v = new THREE.Vector3();
		for (const mesh of meshes) {
			const geometry = mesh.geometry;
			const { n, part, lo, hi } = await partBounds(mesh);
			const inside = new Uint8Array(n);
			for (let p = 0; p < n; p++) {
				v.set((lo[p * 3] + hi[p * 3]) / 2, (lo[p * 3 + 1] + hi[p * 3 + 1]) / 2, (lo[p * 3 + 2] + hi[p * 3 + 2]) / 2);
				const size = Math.max(hi[p * 3] - lo[p * 3], hi[p * 3 + 1] - lo[p * 3 + 1], hi[p * 3 + 2] - lo[p * 3 + 2]);
				inside[p] = box.containsPoint(v) && size <= (spec.maxSize ?? Infinity) ? 1 : 0;
			}
			const [keep, take] = await trianglesBy(geometry, part, 2, (p) => inside[p]);
			if (!take.length) continue;
			const shared = (tris: Uint32Array | Uint16Array) => {
				const g = new THREE.BufferGeometry();
				for (const [key, attribute] of Object.entries(geometry.attributes)) g.setAttribute(key, attribute);
				g.setIndex(new THREE.BufferAttribute(tris, 1));
				shareBounds(geometry, g);
				return g;
			};
			mesh.geometry = shared(keep);
			const carved = new THREE.Mesh(shared(take), mesh.material);
			// The model's frame is the world's here (it isn't placed yet).
			mesh.matrixWorld.decompose(carved.position, carved.quaternion, carved.scale);
			holder.add(carved);
		}
	}

	/**
	 * Each group merged on its own and given a copy of the material that
	 * shares its shader patches and their uniforms (studio shade, surface
	 * variation), so it compiles to the same program; two clipping planes
	 * each for the cutaway, there from the start (meeting edge on, so
	 * nothing is cut) so opening it never recompiles.
	 */
	private async splitGroups(model: THREE.Object3D) {
		this.renderer.localClippingEnabled = true;
		for (const name of this.opts.groups ?? []) {
			await yieldToMain();
			if (this.disposed) return;
			let node = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
			if (!node || this.groups.has(name)) continue;
			const split = this.opts.explode?.[name];
			let pieces: Piece[] = [];
			let phase: number | undefined;
			if (split) {
				// Split into pieces, under a holder that takes the group's place
				// (its node can be the mesh itself, which the split replaces).
				const holder = new THREE.Group();
				holder.name = node.name;
				holder.position.copy(node.position);
				holder.quaternion.copy(node.quaternion);
				holder.scale.copy(node.scale);
				node.parent!.add(holder);
				node.removeFromParent();
				node.position.set(0, 0, 0);
				node.quaternion.identity();
				node.scale.set(1, 1, 1);
				holder.add(node);
				({ pieces, phase } = await this.splitPieces(holder, split));
				node = holder;
			} else mergeStaticMeshes(node, this.material);
			const material = this.material.clone();
			// Its own glow from within (`setGlow`), on the shared shading.
			const base = this.material.onBeforeCompile;
			const baseKey = this.material.customProgramCacheKey;
			const glow = {
				uGlowFront: { value: -1e4 },
				uGlowCrest: { value: 0 },
				uGlowSoft: { value: GLOW_SOFT },
				uGlowUp: { value: 0 },
				uGlowFrame: this.glowFrame
			};
			material.userData.glow = glow;
			material.onBeforeCompile = (shader, renderer) => {
				base.call(material, shader, renderer);
				glowFromWithin(shader, glow);
			};
			material.customProgramCacheKey = () => baseKey.call(material) + '|glow';
			const planes = [new THREE.Plane(), new THREE.Plane()];
			material.clippingPlanes = planes;
			material.clipIntersection = true;
			material.clipShadows = true;
			// Drawn see-through, a group's own surfaces would blend in whatever
			// order they come, flickering as the view turns: while it fades, a
			// depth-only copy of each mesh goes first (renderOrder −1, among the
			// see-through things), so only its nearest surface takes colour.
			const depth = new THREE.MeshBasicMaterial({
				colorWrite: false,
				transparent: true,
				clippingPlanes: planes,
				clipIntersection: true
			});
			const meshes: THREE.Mesh[] = [];
			node.traverse((o) => {
				if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
			});
			for (const mesh of meshes) {
				mesh.material = material;
				const first = new THREE.Mesh(mesh.geometry, depth);
				first.renderOrder = -1;
				first.visible = false;
				first.castShadow = first.receiveShadow = false;
				first.userData.depthFirst = true;
				mesh.add(first);
			}
			// Unsplit, the group lifts as one.
			if (!pieces.length) pieces.push(piece(node, new THREE.Vector3()));
			const g = { node, material, planes, level: 1, cut: 0, out: 0, up: 0, pieces, fold: split?.fold, phase };
			this.groups.set(name, g);
			this.syncGroup(g);
		}
	}

	/**
	 * Splits a group's meshes into pieces by their parts (`_part`), each
	 * part going whole to one piece:
	 *
	 *  - round the axis (`fold`): equal sectors, centred on `phase` or else
	 *    set to the group's own pattern (the phase of its parts' angles,
	 *    `fold` times over), so each sector takes one drum and everything of
	 *    it. Parts close to the axis stay put as a piece of their own. Each
	 *    piece moves out along its sector's spoke.
	 *  - by height (`layers`): the distinct heights of its broad parts (a
	 *    core's block layers), every part with the nearest. The pieces move
	 *    apart up and down about the middle one, a step each.
	 *
	 * The pieces share the mesh's vertex data, each with its own triangles.
	 */
	private async splitPieces(
		node: THREE.Object3D,
		split: { fold?: number; phase?: number; layers?: boolean; columns?: boolean }
	): Promise<{ pieces: Piece[]; phase?: number }> {
		const [ax, az] = this.opts.cutAxis ?? [0, 0];
		const meshes: THREE.Mesh[] = [];
		node.traverse((o) => {
			if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('_part')) meshes.push(o as THREE.Mesh);
		});
		const pieces: Piece[] = [];
		const v = new THREE.Vector3();
		let phase: number | undefined;
		for (const mesh of meshes) {
			const geometry = mesh.geometry;
			mesh.updateWorldMatrix(true, false);
			// Each part's bounds, in the model's authored frame.
			const { n, part, lo, hi } = await partBounds(mesh);
			const mid = (p: number, k: number) => (lo[p * 3 + k] + hi[p * 3 + k]) / 2;

			/** Which piece each part goes to, and which way each piece moves (authored frame). */
			let classOf: (x: number, y: number, z: number) => number;
			const ways: THREE.Vector3[] = [];
			const away: number[] = [];
			if (split.columns) {
				// The upright runs: the plan positions of the tall parts, every
				// part with the nearest.
				const columns: [number, number][] = [];
				for (let p = 0; p < n; p++) {
					if (hi[p * 3 + 1] - lo[p * 3 + 1] < 0.5) continue;
					const x = mid(p, 0);
					const z = mid(p, 2);
					if (!columns.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 0.03)) columns.push([x, z]);
				}
				classOf = (x, _y, z) => {
					let best = 0;
					columns.forEach(([cx, cz], k) => {
						if (Math.hypot(cx - x, cz - z) < Math.hypot(columns[best][0] - x, columns[best][1] - z)) best = k;
					});
					return best;
				};
				for (const [x, z] of columns) {
					ways.push(new THREE.Vector3());
					away.push(Math.hypot(x - ax, z - az));
				}
			} else if (split.layers) {
				const levels: number[] = [];
				for (let p = 0; p < n; p++) {
					if (Math.max(hi[p * 3] - lo[p * 3], hi[p * 3 + 2] - lo[p * 3 + 2]) < 0.1) continue;
					const y = mid(p, 1);
					if (!levels.some((l) => Math.abs(l - y) < 0.05)) levels.push(y);
				}
				levels.sort((a, b) => a - b);
				classOf = (_x, y) => {
					let best = 0;
					levels.forEach((l, k) => Math.abs(l - y) < Math.abs(levels[best] - y) && (best = k));
					return best;
				};
				levels.forEach((_, k) => ways.push(new THREE.Vector3(0, k - (levels.length - 1) / 2, 0)));
			} else {
				const fold = split.fold ?? 1;
				let sin = 0;
				let cos = 0;
				for (let p = 0; p < n; p++) {
					const x = mid(p, 0) - ax;
					const z = mid(p, 2) - az;
					if (Math.hypot(x, z) <= 0.15) continue;
					sin += Math.sin(fold * Math.atan2(z, x));
					cos += Math.cos(fold * Math.atan2(z, x));
				}
				const first = split.phase ?? Math.atan2(sin, cos) / fold;
				phase = first;
				const step = (Math.PI * 2) / fold;
				classOf = (x, _y, z) => {
					if (Math.hypot(x - ax, z - az) <= 0.15) return fold;
					return (((Math.round((Math.atan2(z - az, x - ax) - first) / step) % fold) + fold) % fold);
				};
				for (let k = 0; k < fold; k++) ways.push(new THREE.Vector3(Math.cos(first + k * step), 0, Math.sin(first + k * step)));
				// The axis's own piece stays.
				ways.push(new THREE.Vector3());
			}
			const pieceOfPart = new Int32Array(n);
			for (let p = 0; p < n; p++) pieceOfPart[p] = classOf(mid(p, 0), mid(p, 1), mid(p, 2));

			// Triangles by piece.
			const buckets = await trianglesBy(geometry, part, ways.length, (p) => pieceOfPart[p]);
			// Directions in the mesh's parent's frame, which carries the file's Z-up turn.
			const toLocal = new THREE.Matrix3().setFromMatrix4(mesh.parent!.matrixWorld).invert();
			buckets.forEach((tris, k) => {
				const g = new THREE.BufferGeometry();
				for (const [key, attribute] of Object.entries(geometry.attributes)) g.setAttribute(key, attribute);
				g.setIndex(new THREE.BufferAttribute(tris, 1));
				shareBounds(geometry, g);
				const m = new THREE.Mesh(g, mesh.material);
				m.position.copy(mesh.position);
				m.quaternion.copy(mesh.quaternion);
				m.scale.copy(mesh.scale);
				m.castShadow = m.receiveShadow = true;
				m.visible = tris.length > 0;
				mesh.parent!.add(m);
				pieces.push({ ...piece(m, ways[k].clone().applyMatrix3(toLocal)), way: ways[k], away: away[k] });
			});
			mesh.removeFromParent();
		}
		return { pieces, phase };
	}

	/**
	 * Draws the model once in every state it can be shown in, before it's
	 * seen: see-through (each group fading, with its depth-first copy) and
	 * solid, through the whole chain of passes and the shadow map. The first
	 * frame of anything new otherwise pays for it on the spot, mid-move:
	 * a shader linking, buffers uploading, the GPU building a pipeline for a
	 * blend it hasn't drawn with. A tenth to a third of a second, the first
	 * time 02 took the reactor apart or 05 brought the other model on. The
	 * programs compile in parallel first (compileAsync), so the draws that
	 * follow find them ready; each draw is a task of its own. Call it once
	 * the look is final and the camera is on its first shot; it leaves the
	 * canvas blank, for the first real frame.
	 */
	async warmUp({ groups = true } = {}) {
		if (this.disposed) return;
		this.warmed = true;
		const canvas = this.renderer.domElement;
		const visibility = canvas.style.visibility;
		canvas.style.visibility = 'hidden';
		// The overlays switched off for now (the energy trails, until they
		// light up) draw too, straight after, into the composer's buffers.
		const idle = [...this.overlayPasses].filter((p) => !p.enabled);
		const draw = () => {
			if (this.disposed || this.contextLost) return;
			this.root.updateMatrixWorld();
			this.renderer.shadowMap.needsUpdate = true;
			this.composer.render();
			for (const p of idle) p.render(this.renderer, this.composer.writeBuffer, this.composer.readBuffer, 0, false);
		};
		// See-through, then as they are. The groups' own levels are left alone
		// (a tween may set them meanwhile): the see-through state is put on
		// their materials only, and taken off again from their real level.
		await this.compilePasses();
		if (this.disposed) return;
		// Each group first on its own, a task each: a part's first draw sets up
		// its buffers and bindings, and all of them in one frame held the main
		// thread for a tenth of a second on a slower laptop.
		const all = [...this.groups.values()];
		for (const seeThrough of groups ? [true, false] : [false]) {
			const set = (g: (typeof all)[number]) => this.syncGroup(seeThrough ? { ...g, level: 0.5 } : g);
			all.forEach(set);
			await this.renderer.compileAsync(this.scene, this.camera);
			if (this.disposed) return;
			for (const g of groups ? all : []) {
				for (const other of all) other.node.visible = other === g;
				await nextFrame();
				if (this.disposed) return;
				draw();
			}
			all.forEach(set);
			await nextFrame();
			if (this.disposed) return;
			draw();
		}
		if (this.disposed) return;
		// Out of sight still: where the GPU can keep up.
		if (groups) await this.probe(draw);
		if (this.disposed) return;
		this.renderer.setRenderTarget(null);
		this.renderer.clear();
		canvas.style.visibility = visibility;
		this.invalidate();
		// The reveal's first frames still settle in: not a measure of the GPU.
		this.pace.settleUntil = performance.now() + 2000;
	}

	/**
	 * A group's finish from the shared material, at its level: below 1 it
	 * turns see-through, its opacity the level (and its light, in the last
	 * stretch), so it fades into whatever is behind it (the backdrop, or the
	 * parts inside) and is gone by 0. While
	 * see-through it casts no shadow, which can't fade with it.
	 */
	private syncGroup(g: { node: THREE.Object3D; material: THREE.MeshPhysicalMaterial; level: number }) {
		const base = this.material;
		const m = g.material;
		const k = g.level;
		// The light it gives back dims too, below a tenth: the canvas is
		// composited over the backdrop with its colour as drawn, so a highlight
		// on a part all but gone would still glint at full strength, and a
		// faint ghost reads darker for it. Above that it keeps its full light.
		const light = Math.min(1, k / 0.1);
		m.color.copy(base.color).multiplyScalar(light);
		m.roughness = base.roughness;
		m.metalness = base.metalness;
		m.clearcoat = base.clearcoat * light;
		m.clearcoatRoughness = base.clearcoatRoughness;
		m.envMapIntensity = base.envMapIntensity * light;
		m.opacity = k;
		const fading = k < 0.999;
		if (m.transparent !== fading) {
			// Opaque and see-through compile apart (three's OPAQUE define); each is cached after its first use.
			m.transparent = fading;
			m.needsUpdate = true;
			g.node.traverse((o) => {
				if (o.userData.depthFirst) o.visible = fading;
				else o.castShadow = !fading;
			});
		}
		g.node.visible = k > 0.001;
	}

	/**
	 * Turns each group's cutaway to face the camera: two vertical planes
	 * through the axis, either side of the line to the camera, clipping
	 * only where both do, so the wedge between them goes.
	 */
	private aimCuts() {
		if (!this.groups.size) return;
		this.findEye();
		const [x, z] = this.opts.cutAxis ?? [0, 0];
		const axis = this.cutPoint.set(x, 0, z).add(this.offset).applyMatrix4(this.root.matrixWorld);
		const dx = this.eye.x - axis.x;
		const dz = this.eye.z - axis.z;
		const toCamera = Math.atan2(dz, dx);
		for (const [name, g] of this.groups) {
			const section = this.opts.sections?.[name];
			if (section) {
				this.aimSection(g, section);
				continue;
			}
			// 0 to 80° each side: the planes meet edge on when closed.
			const half = g.cut * THREE.MathUtils.degToRad(80);
			const a = toCamera + half + Math.PI / 2;
			const b = toCamera - half - Math.PI / 2;
			g.planes[0].setFromNormalAndCoplanarPoint(this.cutNormal.set(Math.cos(a), 0, Math.sin(a)), axis);
			g.planes[1].setFromNormalAndCoplanarPoint(this.cutNormal.set(Math.cos(b), 0, Math.sin(b)), axis);
		}
	}
	private cutPoint = new THREE.Vector3();
	private cutNormal = new THREE.Vector3();

	/**
	 * Where cuts face: the camera as the model would see it undragged. The
	 * cuts follow the shots and the slow turn round to the camera, but a
	 * drag turns them with the model, as a real cutaway would: the camera's
	 * place in the model's frame without the drag, put back into the world
	 * with it.
	 */
	private findEye() {
		const r = this.root;
		this.eyeRotation.set(this.scrollRotation.x, this.scrollRotation.y + this.autoRotation, this.scrollRotation.z, 'ZXY');
		this.eyeMatrix.compose(r.position, this.eyeQuaternion.setFromEuler(this.eyeRotation), r.scale).invert();
		this.eye.copy(this.camera.position).applyMatrix4(this.eyeMatrix).applyMatrix4(r.matrixWorld);
	}
	private eye = new THREE.Vector3();
	private eyeRotation = new THREE.Euler();
	private eyeQuaternion = new THREE.Quaternion();
	private eyeMatrix = new THREE.Matrix4();

	/**
	 * A half-section facing the camera: both planes the same, through the
	 * axis, its normal pointing away from the camera square to the axis, so
	 * the near half goes. Shut, it's moved out by the radius, past the part.
	 */
	private aimSection(
		g: { cut: number; planes: THREE.Plane[] },
		section: { at: [number, number, number]; along: [number, number, number]; radius: number }
	) {
		const at = this.sectionAt.set(...section.at).add(this.offset).applyMatrix4(this.root.matrixWorld);
		const along = this.sectionAlong.set(...section.along).transformDirection(this.root.matrixWorld);
		const away = this.sectionAway.copy(at).sub(this.eye);
		away.addScaledVector(along, -away.dot(along)).normalize();
		for (const plane of g.planes) {
			plane.setFromNormalAndCoplanarPoint(away, at);
			plane.constant += (1 - g.cut) * section.radius * 1.05;
		}
	}
	private sectionAt = new THREE.Vector3();
	private sectionAlong = new THREE.Vector3();
	private sectionAway = new THREE.Vector3();

	/** Addressable for live tuning: viewer.lights.key.intensity = … */
	readonly lights: { key: THREE.DirectionalLight; rim: THREE.DirectionalLight; hemi: THREE.HemisphereLight };

	private container: HTMLElement;
	private pmrem: THREE.PMREMGenerator;
	private envRT: THREE.WebGLRenderTarget | null = null;
	private composer: EffectComposer;
	private renderPass: Pass;
	/** The scene's own multisampled target, colour and depth (BeautyPass). */
	private beauty: THREE.WebGLRenderTarget;
	private outputPass: OutputPass;
	private bloom: UnrealBloomPass | null = null;
	private gtao: GTAOPass | null = null;
	private contact: ContactShadow | null = null;
	private ground: THREE.Mesh | null = null;
	private grain: ReturnType<typeof createGrainPass> | null = null;
	private gradient: GradientMapPass | null = null;
	/** Normalised pointer over the canvas, plus the smoothed ramp offset it feeds. */
	private pointer = { x: 0.5, y: 0.5, seen: false };
	private pointerOffset = 0;
	private gradientUserOffset = 0;
	private gradientFollow = true;
	/** Seconds for the pointer-driven offset to catch up. */
	private gradientTau = 0.18;
	/** Editable ramp; the panel drives these and `setStops` re-uploads. */
	private gradientStops: GradientStop[] = DEFAULT_STOPS.map((s) => ({ ...s }));
	/** Cached so pointermove never forces a layout read. */
	private canvasRect: DOMRect | null = null;
	private sweep: SweepPass | null = null;
	private shade: StudioShadeUniforms | null = null;
	/** Kept as angles so the sliders read back what they set. */
	private shadeAngles: { azimuth: number; elevation: number } = {
		azimuth: SHADE_DEFAULTS.azimuth,
		elevation: SHADE_DEFAULTS.elevation
	};
	private studioOn = false;
	/** Values the preset displaced, restored when the look is switched off. */
	private studioSaved: Partial<RenderParams> | null = null;
	private studioKeyFollow = true;
	/** Where the key sat before the look took it over. */
	private keyHome = new THREE.Vector3();
	private tmpDir = new THREE.Vector3();
	private ssr: SSRPass | null = null;
	private bokeh: BokehPass | null = null;
	private get bokehUniforms() {
		return this.bokeh!.uniforms as Record<'focus' | 'aperture' | 'maxblur', THREE.IUniform<number>>;
	}
	private clock = new THREE.Clock();
	/** Accumulated auto-rotation — a third layer under scroll and drag. */
	private autoRotation = 0;
	private lastTime = 0;
	/** Bytes per download; progress is reported as one byte-weighted fraction. */
	private bytes = { glb: [0, 0], hdr: [0, 0] };
	private observer: ResizeObserver;
	private disposed = false;

	/*
	 * Render on demand. Every tick still advances the rotation, but the frame
	 * is only drawn when something visible changed since the last one — a
	 * paused model costs nothing. A turn that is only the slow auto-rotation
	 * is drawn at SPIN_FPS: 60, so it glides like everything else on the
	 * page; on faster displays the moves still draw every refresh.
	 */
	private dirty = true;
	private lastView: number[] = [];
	private lastSpin = NaN;
	private lastDrawn = -Infinity;
	/** Frames actually drawn — for measuring. */
	framesDrawn = 0;
	private contextLost = false;
	private lostHandlers = new Set<() => void>();

	/** Distance that frames the whole model — useful defaults for GSAP tweens. */
	radius = 10;

	/** Vertical FOV the shot list is composed at; widened only when too narrow to fit. */
	private baseFov = DEFAULT_FOV;
	/** Bounding-sphere radius of the model; 0 until `load()` resolves. */
	private fitRadius = 0;
	/** Camera distance of the establishing shot — the framing `baseFov` is designed for. */
	private fitDistance = 0;

	private drag = { active: false, x: 0, y: 0 };
	private dragEndHandlers = new Set<() => void>();
	private studioHandlers = new Set<(on: boolean) => void>();

	/**
	 * Fires if the GPU drops the WebGL context — mobile Safari does this to
	 * backgrounded tabs and under memory pressure. Nothing drawn afterwards
	 * would show, so the host should dispose this viewer and build another.
	 */
	onContextLost(fn: () => void) {
		this.lostHandlers.add(fn);
		return () => this.lostHandlers.delete(fn);
	}

	private handleContextLost = (e: Event) => {
		e.preventDefault();
		this.contextLost = true;
		for (const fn of this.lostHandlers) fn();
	};

	/** Forces the next tick to draw — for changes made behind the viewer's back, e.g. from the console. */
	invalidate() {
		this.dirty = true;
	}

	/**
	 * Fires whenever the studio look toggles, however it was toggled — the
	 * controls panel, the constructor options, or the console. Lets the host
	 * react to it (the stage goes full bleed) without polling `readParams`.
	 */
	onStudioChange(fn: (on: boolean) => void) {
		this.studioHandlers.add(fn);
		return () => this.studioHandlers.delete(fn);
	}

	/** True while the studio look is on. */
	get isStudio() {
		return this.studioOn;
	}

	/**
	 * Fires once whenever a drag ends — however it ended. Use this rather than
	 * listening for `pointerup` on the canvas: a release that happens off the
	 * canvas never reaches it.
	 */
	onDragEnd(fn: () => void) {
		this.dragEndHandlers.add(fn);
		return () => this.dragEndHandlers.delete(fn);
	}

	private onPointerDown = (e: PointerEvent) => {
		// Primary button only — a right-click drag shouldn't spin the model.
		if (e.button !== 0) return;
		this.drag.active = true;
		this.drag.x = e.clientX;
		this.drag.y = e.clientY;
		this.renderer.domElement.style.cursor = 'grabbing';
	};
	private onPointerMove = (e: PointerEvent) => {
		const rect = this.canvasRect;
		if (rect) {
			this.pointer.x = (e.clientX - rect.left) / Math.max(1, rect.width);
			this.pointer.y = (e.clientY - rect.top) / Math.max(1, rect.height);
			this.pointer.seen = true;
		}
		if (!this.drag.active) return;
		const el = this.renderer.domElement;
		// One full drag across the canvas = one full turn.
		const dx = ((e.clientX - this.drag.x) / el.clientWidth) * Math.PI * 2;
		const dy = ((e.clientY - this.drag.y) / el.clientHeight) * Math.PI;
		this.drag.x = e.clientX;
		this.drag.y = e.clientY;
		this.applySpin(dx, dy);
	};
	private endDrag = () => {
		if (!this.drag.active) return;
		this.drag.active = false;
		this.renderer.domElement.style.cursor = 'grab';
		for (const fn of this.dragEndHandlers) fn();
	};

	constructor(
		container: HTMLElement,
		private opts: ModelViewerOptions
	) {
		this.container = container;

		// alpha:true so the page's own background shows through untouched —
		// tone mapping would otherwise shift a solid scene.background colour.
		// antialias:false is deliberate. Every frame reaches the canvas as a
		// fullscreen quad from the composer, whose own 8× MSAA target does
		// the antialiasing; multisampling the canvas as well only bought a
		// second set of sample buffers and a resolve per frame.
		this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.maxPixelRatio ?? 2));
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.95;
		// Refraction renders the scene once more behind glass; three-quarter
		// resolution is imperceptible on a blurred sample and much cheaper.
		this.renderer.transmissionResolutionScale = 0.75;
		// VSM is the one shadow type with a real blur radius; PCF's `radius`
		// is a no-op on the soft variant. Slight light-bleed is the trade.
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		// Manual: three re-renders the shadow map on EVERY scene render, so a
		// pass that draws the scene again would redraw it (and its VSM blur)
		// for one image. `render()` flags it once; the scene pass consumes it.
		this.renderer.shadowMap.autoUpdate = false;
		// The composer runs several passes per frame; with autoReset the stats
		// would only ever describe the last one (a fullscreen quad = 1 call).
		this.renderer.info.autoReset = false;
		container.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.1, 500);
		this.camera.position.set(12, 8, 14);

		this.scene.background = null;
		// The HDRI is fill, not key. In three's physical light units a
		// directional at ~1 next to an HDRI at 1 barely registers; to have the
		// light *drive* the image the ratio has to invert — key ≈ 5–6, HDRI < 0.5.
		this.scene.environmentIntensity = opts.environmentIntensity ?? 0.5;

		this.pmrem = new THREE.PMREMGenerator(this.renderer);

		// Key from upper-left-front carries form and casts the soft shadow;
		// a rim from behind-right separates the silhouette; hemisphere lifts
		// the shadow side a touch so it never goes to black.
		const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.2);
		this.scene.add(hemi);

		const key = new THREE.DirectionalLight(0xffffff, 6);
		key.position.set(-6, 10, 8);
		key.castShadow = true;
		// The shadow is all penumbra, so 1024 holds it: half 2048's texels,
		// with the blur's radius halved too to keep its width in the scene,
		// and a quarter of the fill for the map and its two blur passes.
		key.shadow.mapSize.set(1024, 1024);
		// A wide penumbra reads as a large softbox rather than a bare bulb.
		key.shadow.radius = 4.5;
		key.shadow.blurSamples = 16;
		key.shadow.bias = -0.0002;
		key.shadow.normalBias = 0.04;
		this.scene.add(key);

		const rim = new THREE.DirectionalLight(0xffffff, 1.2);
		rim.position.set(8, 4, -10);
		this.scene.add(rim);

		this.lights = { key, rim, hemi };

		this.scene.add(this.root);

		// Post: scene (multisampled) -> AO -> bloom -> tone map + sRGB.
		// OutputPass owns tone mapping, so the scene pass sees linear HDR.
		const size = new THREE.Vector2();
		this.renderer.getDrawingBufferSize(size);
		// Only the scene is multisampled, into a target of its own (BeautyPass);
		// the composer's ping-pong buffers stay single-sampled. Multisampling
		// those too made every full-screen pass after the scene write and
		// resolve 4× the samples: half the frame's cost, for nothing, since a
		// full-screen quad has no edges to smooth. 4×, what Apple GPUs top out
		// at (8× was asked for, and silently clamped to 4 there); at a pixel
		// ratio of 2 that holds the thin rails steady under the slow turn.
		const samples = Math.min(4, this.renderer.capabilities.maxSamples);
		this.beauty = new THREE.WebGLRenderTarget(size.x, size.y, {
			type: THREE.HalfFloatType,
			samples,
			depthTexture: new THREE.DepthTexture(size.x, size.y)
		});
		const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
		this.composer = new EffectComposer(this.renderer, rt);
		// The optional passes (SSR, DoF, bloom) are added in load(), once their
		// modules have been fetched — see addOptionalPasses. Only what is
		// always on is built here.
		this.renderPass = new BeautyPass(this.scene, this.camera, this.beauty);
		this.composer.addPass(this.renderPass);
		if (opts.ao !== false) {
			// Occlusion multiplies onto scene colour; its alpha is the scene's
			// own, so the transparent backdrop survives the pass. It reads the
			// scene pass's own depth, normals rebuilt from it (SceneGTAOPass):
			// GTAO would otherwise draw the whole model a second time for its
			// normals, and that copy ignored the cutaways, shading the inside of
			// a cut part as if its cover were still there.
			const gtao = new SceneGTAOPass(this.scene, this.camera, size.x, size.y);
			gtao.setGBuffer(this.beauty.depthTexture!, gtao.normals.texture);
			this.gtao = gtao;
			this.gtao.output = GTAOPass.OUTPUT.Default;
			this.gtao.blendIntensity = 0.9;
			this.composer.addPass(this.gtao);
		}
		// Adaptive quality's steps, least seen first: occlusion at half
		// resolution (its upsample keeps the edges; only fine gaps soften),
		// then the pixel ratio down, then occlusion off.
		const ratio = this.renderer.getPixelRatio();
		const ao = opts.ao === false ? 0 : (opts.aoScale ?? 1);
		const ratios = [ratio, ...PIXEL_RATIOS.filter((r) => r < ratio - 0.01)];
		this.ladder = [{ ratio, ao }];
		if (ao > 0.5) this.ladder.push({ ratio, ao: 0.5 });
		for (const r of ratios.slice(1)) this.ladder.push({ ratio: r, ao: Math.min(ao, 0.5) });
		if (ao > 0) this.ladder.push({ ratio: ratios[ratios.length - 1], ao: 0 });
		this.aoScale = ao;
		this.outputPass = new OutputPass();
		this.composer.addPass(this.outputPass);
		if (opts.grain !== false) {
			this.grain = createGrainPass(opts.grain ?? 0.03);
			this.composer.addPass(this.grain);
		}

		if (opts.gradientMap !== false) {
			const g = opts.gradientMap ?? {};
			if (g.stops) this.gradientStops = g.stops.map((x) => ({ ...x }));
			this.gradient = new GradientMapPass(this.gradientStops);
			this.gradient.repeatMode = g.repeat ?? 'none';
			this.gradient.mixSpace = g.space ?? 'oklab';
			this.gradient.amount = g.amount ?? 1;
			this.gradientFollow = g.followPointer ?? true;
			this.gradientTau = g.followDamping ?? 0.18;
			this.gradient.enabled = g.on ?? false;
			this.composer.addPass(this.gradient);
		}

		if (opts.studio !== false) {
			// Last: it paints the backdrop, so nothing after it may assume a
			// transparent canvas. Enabled by the toggle in load(), once the
			// material exists for the preset and the shade term.
			this.sweep = new SweepPass(opts.studio ?? {});
			this.composer.addPass(this.sweep);
		}

		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(container);
		this.resize();

		const el = this.renderer.domElement;
		el.addEventListener('webglcontextlost', this.handleContextLost);
		el.style.cursor = 'grab';
		// pan-y keeps vertical touch scrolling alive on mobile; drag is a cursor affordance.
		el.style.touchAction = 'pan-y';
		el.addEventListener('pointerdown', this.onPointerDown);
		// Move and release listen on the WINDOW, not the canvas. Releasing off
		// the canvas — over the mode bar, over the controls, or outside the
		// window entirely — otherwise never ends the drag: `active` stays true,
		// the model keeps spinning with the button up, and it never resets.
		// (Pointer capture is deliberately not used; it does not reliably
		// survive the pointer leaving the window.) `blur` covers alt-tabbing
		// away mid-drag, where no pointerup is ever delivered.
		window.addEventListener('pointermove', this.onPointerMove);
		window.addEventListener('pointerup', this.endDrag);
		window.addEventListener('pointercancel', this.endDrag);
		window.addEventListener('blur', this.endDrag);
	}

	private applySpin(dx: number, dy: number) {
		this.userRotation.y += dx;
		this.userRotation.x = THREE.MathUtils.clamp(this.userRotation.x + dy, -0.6, 0.6);
	}

	private report(key: 'glb' | 'hdr', e: ProgressEvent) {
		if (!e.lengthComputable) return;
		this.bytes[key] = [e.loaded, e.total];
		const [l1, t1] = this.bytes.glb;
		const [l2, t2] = this.bytes.hdr;
		// Until a total is known for a file, weight it as "not started" —
		// the bar never runs backwards when the second response arrives.
		const total = t1 + t2;
		if (total > 0) this.opts.onProgress?.((l1 + l2) / total);
	}

	/**
	 * SSR, depth of field and bloom are dynamic imports so that a scene which
	 * ships them off — this one — never downloads their shader source. They
	 * slot into the chain where the constructor used to put them: SSR takes
	 * over from the RenderPass at the front; DoF and bloom go just before
	 * OutputPass, in that order.
	 */
	private async addOptionalPasses() {
		const opts = this.opts;
		const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
		const beforeOutput = () => this.composer.passes.indexOf(this.outputPass);

		if (opts.ssr !== false) {
			const { SSRPass } = await import('three/examples/jsm/postprocessing/SSRPass.js');
			if (this.disposed) return;
			// SSRPass renders the beauty pass itself, so it stands in for
			// RenderPass. Selective: reflections are computed only on the model
			// (set after load), never on the shadow planes or empty backdrop.
			this.ssr = new SSRPass({
				renderer: this.renderer,
				scene: this.scene,
				camera: this.camera,
				width: size.x,
				height: size.y,
				selects: [],
				groundReflector: null
			});
			this.ssr.opacity = opts.ssr?.opacity ?? 0.35;
			this.composer.removePass(this.renderPass);
			this.composer.insertPass(this.ssr, 0);
		}
		if (opts.dof !== false) {
			const { BokehPass } = await import('three/examples/jsm/postprocessing/BokehPass.js');
			if (this.disposed) return;
			this.bokeh = new BokehPass(this.scene, this.camera, {
				focus: 20,
				aperture: 0.0007,
				maxblur: opts.dof?.maxblur ?? 0.006
			});
			// Stock BokehShader forces alpha to 1, which would turn the
			// transparent canvas into an opaque black rectangle. Dropping that
			// line keeps the blurred alpha — and on a premultiplied canvas,
			// averaging RGBA jointly is exactly the correct edge math.
			this.bokeh.materialBokeh.fragmentShader = this.bokeh.materialBokeh.fragmentShader.replace(
				'gl_FragColor.a = 1.0;',
				''
			);
			this.bokeh.materialBokeh.needsUpdate = true;
			this.composer.insertPass(this.bokeh, beforeOutput());
		}
		if (opts.bloom !== false) {
			const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
			if (this.disposed) return;
			const b = opts.bloom ?? { strength: 0.55, threshold: 0.96 };
			// Threshold sits just under white so only the hottest HDR
			// highlights bloom — a halo on the specular, not a glow on the body.
			this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), b.strength, 0.4, b.threshold);
			this.composer.insertPass(this.bloom, beforeOutput());
		}
	}

	async load(): Promise<THREE.Group> {
		const [model] = await Promise.all([this.loadModel(), this.loadEnvironment(), this.addOptionalPasses()]);
		if (this.disposed) return model;

		// One shared material for every part: one shader program, and one
		// object to tune. The glTF's own material is dropped.
		this.material = createMaterial(this.opts.material ?? 'satin', this.opts.color ?? 0xf24a2e);
		if ((this.opts.surfaceVariation ?? 1) > 0) {
			const v = this.opts.surfaceVariation ?? 1;
			applySurfaceVariation(this.material, { roughness: 0.08 * v, albedo: 0.02 * v });
		}
		if (this.opts.studio !== false) {
			const sh = this.opts.studio?.shade ?? {};
			this.shadeAngles.azimuth = sh.azimuth ?? this.shadeAngles.azimuth;
			this.shadeAngles.elevation = sh.elevation ?? this.shadeAngles.elevation;
			this.shade = applyStudioShade(this.material, this.sweep!.sweepUniforms, { ...sh, on: false });
		}
		model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			const old = mesh.material as THREE.Material;
			mesh.material = this.material;
			old.dispose();
			mesh.frustumCulled = true;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		});
		// One step at a time, handing the main thread back between them, so
		// the page keeps scrolling smoothly while the model is put together.
		await yieldToMain();
		for (const [name, spec] of Object.entries(this.opts.carve ?? {})) {
			await this.carveGroup(model, name, spec);
			await yieldToMain();
		}
		if (this.opts.groups?.length) await this.splitGroups(model);
		else if (this.opts.mergeMeshes !== false) mergeStaticMeshes(model, this.material);
		if (this.disposed) return model;

		// Recentre on the origin so rotations spin about the vessel's own axis
		// rather than the exporter's origin. Bounds read from the typed arrays
		// first: three's own walk goes vertex by vertex through accessors.
		model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.isMesh && !mesh.geometry.boundingBox) shareBounds(mesh.geometry, mesh.geometry);
		});
		const box = new THREE.Box3().setFromObject(model);
		const size = box.getSize(new THREE.Vector3());
		const centre = box.getCenter(new THREE.Vector3());
		model.position.sub(centre);
		this.offset.copy(model.position);

		this.root.add(model);

		this.radius = Math.max(size.x, size.y, size.z) * (this.opts.fitOffset ?? 1.95);

		// Shadow frustum hugs the model's bounds — a loose one wastes the
		// map on empty space and the shadow goes blotchy.
		// 1.1× so the key's shadow on the floor, which falls away from the light
		// by roughly the model's height, is inside the map.
		const half = Math.max(size.x, size.y, size.z) * 1.1;
		const { key } = this.lights;
		key.position.normalize().multiplyScalar(this.radius * 1.2);
		const sc = key.shadow.camera;
		sc.left = sc.bottom = -half;
		sc.right = sc.top = half;
		sc.near = 0.1;
		sc.far = this.radius * 3;
		sc.updateProjectionMatrix();

		const extent = Math.max(size.x, size.y, size.z);
		if (this.ssr) {
			const meshes: THREE.Mesh[] = [];
			model.traverse((o) => {
				if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
			});
			this.ssr.selects = meshes;
			// Defaults are sized for a 180-unit demo scene; ours is ~9 units.
			this.ssr.maxDistance = extent * 2;
			this.ssr.thickness = extent * 0.01;
		}
		if (this.bokeh) {
			// Full blur one model-extent away from the focal plane — shallow
			// enough to feel photographic, deep enough that the vessel stays sharp.
			const u = this.bokehUniforms;
			u.aperture.value = u.maxblur.value / (extent * 0.9);
		}
		if (this.gtao) {
			// Radius in world units, sized to the gap between rails and deck —
			// a screen-space radius would swell and shrink with camera distance.
			this.gtao.updateGtaoMaterial({
				radius: extent * 0.045,
				distanceExponent: 1,
				thickness: 1,
				scale: 1.1,
				samples: 16,
				distanceFallOff: 1,
				screenSpaceRadius: false
			});
			this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
		}

		const groundY = -size.y / 2 - 0.02;
		if (this.opts.groundShadow !== false) {
			// Receives the key's VSM shadow. The contact shadow says "touching
			// the floor"; this says "standing in a lit room".
			this.ground = new THREE.Mesh(
				new THREE.PlaneGeometry(extent * 6, extent * 6),
				new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.16, transparent: true, depthWrite: false })
			);
			this.ground.rotation.x = -Math.PI / 2;
			this.ground.position.y = groundY - 0.01;
			this.ground.receiveShadow = true;
			this.ground.renderOrder = -2;
			this.scene.add(this.ground);
		}

		if (this.opts.contactShadow !== false) {
			this.contact = new ContactShadow(this.renderer, {
				// The ground plane would read as a solid floor at depth 0 —
				// a fully dark shadow everywhere — so it sits out the depth pass.
				exclude: this.ground ? [this.ground] : [],
				size: Math.max(size.x, size.z) * 2.4,
				// Only the lower half of the model darkens the floor; the deck
				// hardware is too far up to plausibly cast onto it.
				far: size.y * 0.55,
				blur: 5,
				opacity: 0.55,
				// Slightly warm near-black: pure black shadows read dead on a light ground.
				color: 0x1c1517
			});
			// Ground = model's lowest point (model is centred on the origin).
			this.contact.group.position.y = groundY;
			this.scene.add(this.contact.group);
		}

		this.camera.position.set(this.radius * 0.8, this.radius * 0.45, this.radius * 0.95);

		// Bounding *sphere*, so the fit is independent of how the model is turned.
		this.fitRadius = size.length() / 2;
		this.fitDistance = this.camera.position.length();

		// Depth precision is governed by the NEAR plane, not the far/near ratio:
		// resolution at distance z is roughly z² / (near · 2^bits). The default
		// 0.1 near spends almost the whole 24-bit buffer on empty space in front
		// of the camera, leaving too little where the model actually is — so
		// CAD parts that touch exactly z-fight, and the breathing animation
		// turns that into a constant flicker. Derived from the model instead:
		// still ~3× clear of the closest shot, with ~10× the precision.
		this.camera.near = this.fitRadius * 0.15;
		this.camera.far = this.fitDistance + this.fitRadius * 4;
		// Re-run framing now the model's size is known.
		this.resize();

		// Applied last: every pass and the material now exist, so any parameter
		// is settable. Doing it before `compileAsync` means shaders compile
		// against the final state rather than recompiling on the first frame.
		if (this.opts.params) {
			for (const [k, v] of Object.entries(this.opts.params)) {
				this.setParam(k as keyof RenderParams, v as number | string);
			}
		}
		// After params, so the preset saves (and later restores) the dialled-in look.
		if (this.opts.studio !== false && this.opts.studio?.on) this.setParam('studio', 1);

		// Compile every material variant now, off the first frame. Without
		// this the reveal animation stutters through its opening beats while
		// physical + shadow + depth programs link one after another. The
		// see-through ones, and everything a frame needs beyond the scene's
		// own materials, compile in `warmUp`.
		await this.renderer.compileAsync(this.scene, this.camera);
		if (!this.disposed) this.opts.onProgress?.(1);

		return model;
	}

	private async loadModel() {
		const loader = new GLTFLoader();
		// Required: the asset uses EXT_meshopt_compression + KHR_mesh_quantization.
		// EXT_mesh_gpu_instancing is handled natively and yields InstancedMesh.
		loader.setMeshoptDecoder(MeshoptDecoder);
		// Decoded off the main thread (several megabytes of it), in two
		// workers shared by every viewer on the page.
		MeshoptDecoder.useWorkers(2);
		const urls = typeof this.opts.url === 'string' ? [this.opts.url] : this.opts.url;
		// Each file's bytes, summed into one figure for the progress bar.
		const files: [number, number][] = urls.map(() => [0, 0]);
		const loaded = await Promise.all(
			urls.map((url, i) =>
				loader.loadAsync(url, (e) => {
					if (!e.lengthComputable) return;
					files[i] = [e.loaded, e.total];
					const sum = files.reduce((a, f) => [a[0] + f[0], a[1] + f[1]], [0, 0]);
					this.report('glb', { lengthComputable: true, loaded: sum[0], total: sum[1] } as ProgressEvent);
				})
			)
		);
		if (loaded.length === 1) return loaded[0].scene;
		const model = new THREE.Group();
		for (const gltf of loaded) model.add(gltf.scene);
		return model;
	}

	/**
	 * Image-based lighting. The model is a single material, so the environment
	 * does most of the visual work: with a flat one it reads as grey plastic.
	 * Prefers the HDRI (a real studio with soft boxes and contrast); falls back
	 * to a procedural strip-light room when none is configured.
	 */
	private async loadEnvironment() {
		if (this.opts.hdr) {
			const tex = await new RGBELoader().loadAsync(this.opts.hdr, (e) => this.report('hdr', e));
			if (this.disposed) return;
			tex.mapping = THREE.EquirectangularReflectionMapping;
			this.envRT = this.pmrem.fromEquirectangular(tex);
			tex.dispose();
		} else {
			const envScene = createStudioEnvironment();
			this.envRT = this.pmrem.fromScene(envScene, 0.02);
			disposeScene(envScene);
		}
		this.scene.environment = this.envRT.texture;
		this.invalidate();
	}

	get isDragging() {
		return this.drag.active;
	}

	/**
	 * Prepare the drag layer to be tweened back to zero.
	 *
	 * Wraps Y to its shortest equivalent angle so the unwind is at most half a
	 * turn rather than every full turn the user spun. Wrapping is visually
	 * free — rotation is periodic in 2π.
	 */
	settleUserRotation() {
		const y = this.userRotation.y;
		this.userRotation.y = Math.atan2(Math.sin(y), Math.cos(y));
	}

	/** True once the drag layer is close enough to zero to ignore. */
	get userRotationSettled() {
		return Math.abs(this.userRotation.x) < 1e-4 && Math.abs(this.userRotation.y) < 1e-4;
	}

	/** Current value of every live-tunable render parameter. */
	readParams(): RenderParams {
		const m = this.material;
		return {
			color: '#' + m.color.getHexString(),
			roughness: m.roughness,
			metalness: m.metalness,
			clearcoat: m.clearcoat,
			coatRoughness: m.clearcoatRoughness,
			materialEnv: m.envMapIntensity,
			key: this.lights.key.intensity,
			rim: this.lights.rim.intensity,
			ambient: this.lights.hemi.intensity,
			environment: this.scene.environmentIntensity,
			exposure: this.renderer.toneMappingExposure,
			bloom: this.bloom?.strength ?? 0,
			bloomThreshold: this.bloom?.threshold ?? 1,
			ao: this.gtao?.blendIntensity ?? 0,
			grain: (this.grain?.uniforms.uAmount.value as number) ?? 0,
			shadow: this.contact?.opacity ?? 0,
			gradient: this.gradient?.enabled ? 1 : 0,
			gradientAmount: this.gradient?.amount ?? 1,
			gradientScatter: this.gradient?.scatter ?? 0,
			gradientFrequency: this.gradient?.frequency ?? 2,
			gradientOffset: this.gradientUserOffset,
			gradientTrack: this.gradientFollow ? 1 : 0,
			studio: this.studioOn ? 1 : 0,
			sweepLight: this.sweep?.light ?? '#dfe6e6',
			sweepDark: this.sweep?.dark ?? '#061012',
			sweepAngle: this.sweep?.angle ?? 0,
			sweepMid: this.sweep?.mid ?? 0.49,
			sweepSpread: this.sweep?.spread ?? 0.45,
			sweepFalloff: this.sweep?.falloff ?? 0,
			shadeAzimuth: this.shadeAngles.azimuth,
			shadeElevation: this.shadeAngles.elevation,
			shadeCoverage: this.shade?.uShadeCoverage.value ?? 0,
			shadeSoftness: this.shade?.uShadeSoftness.value ?? SHADE_DEFAULTS.softness,
			shadeDepth: this.shade?.uShadeDepth.value ?? 0,
			studioGrain: this.sweep?.grain ?? 0,
			sweepCurve: this.sweep?.curve ?? 1,
			sweepLift: this.sweep?.lift ?? 0,
			studioBounce: this.shade?.uBounce.value ?? 0,
			studioGrainSize: this.sweep?.grainSize ?? 1,
			studioGrainSpeed: this.sweep?.grainSpeed ?? 0,
			studioKey: this.studioKeyFollow ? 1 : 0
		};
	}

	/**
	 * Parameters actually backed by a live pass. Anything omitted here has no
	 * effect — a disabled pass leaves its setter a silent no-op, so the
	 * controls panel hides those rows rather than showing a dead slider.
	 */
	/** True once the gradient pass exists, so the stops editor can show itself. */
	get hasGradient() {
		return this.gradient !== null;
	}

	/** Current ramp stops, as copies safe to mutate. Colours are `#rrggbb`. */
	readGradientStops(): GradientStop[] {
		return this.gradientStops.map((s) => ({
			position: s.position,
			color: hex(s.color),
			alpha: s.alpha
		}));
	}

	/**
	 * Replace the ramp. 2–8 stops; `setStops` sorts and pads them, so callers
	 * need not keep them ordered.
	 */
	setGradientStops(stops: GradientStop[]) {
		this.invalidate();
		this.gradientStops = stops.map((s) => ({ position: s.position, color: s.color, alpha: s.alpha }));
		this.gradient?.setStops(this.gradientStops);
	}

	availableParams(): Set<keyof RenderParams> {
		const keys: (keyof RenderParams)[] = [
			'color',
			'roughness',
			'metalness',
			'clearcoat',
			'coatRoughness',
			'materialEnv',
			'key',
			'rim',
			'ambient',
			'environment',
			'exposure'
		];
		if (this.bloom) keys.push('bloom', 'bloomThreshold');
		if (this.gtao) keys.push('ao');
		if (this.grain) keys.push('grain');
		if (this.contact) keys.push('shadow');
		if (this.gradient) {
			keys.push(
				'gradient',
				'gradientAmount',
				'gradientScatter',
				'gradientFrequency',
				'gradientOffset',
				'gradientTrack'
			);
		}
		if (this.sweep && this.shade) {
			keys.push(
				'studio',
				'sweepLight',
				'sweepDark',
				'sweepAngle',
				'sweepMid',
				'sweepSpread',
				'sweepFalloff',
				'shadeAzimuth',
				'shadeElevation',
				'shadeCoverage',
				'shadeSoftness',
				'shadeDepth',
				'studioGrain',
				'sweepCurve',
				'sweepLift',
				'studioBounce',
				'studioGrainSize',
				'studioGrainSpeed',
				'studioKey'
			);
		}
		return new Set(keys);
	}

	/** Apply one parameter. `value` is a hex string for `color`, a number otherwise. */
	setParam(key: keyof RenderParams, value: number | string) {
		this.invalidate();
		const m = this.material;
		const n = typeof value === 'number' ? value : 0;
		switch (key) {
			case 'color':
				m.color.set(value as string);
				break;
			case 'roughness':
				m.roughness = n;
				break;
			case 'metalness':
				m.metalness = n;
				break;
			case 'clearcoat':
				m.clearcoat = n;
				break;
			case 'coatRoughness':
				m.clearcoatRoughness = n;
				break;
			case 'materialEnv':
				m.envMapIntensity = n;
				break;
			case 'key':
				this.lights.key.intensity = n;
				break;
			case 'rim':
				this.lights.rim.intensity = n;
				break;
			case 'ambient':
				this.lights.hemi.intensity = n;
				break;
			case 'environment':
				this.scene.environmentIntensity = n;
				break;
			case 'exposure':
				this.renderer.toneMappingExposure = n;
				break;
			case 'bloom':
				if (this.bloom) this.bloom.strength = n;
				break;
			case 'bloomThreshold':
				if (this.bloom) this.bloom.threshold = n;
				break;
			case 'ao':
				if (this.gtao) this.gtao.blendIntensity = n;
				break;
			case 'grain':
				if (this.grain) this.grain.uniforms.uAmount.value = n;
				break;
			case 'shadow':
				if (this.contact) this.contact.opacity = n;
				break;
			case 'gradient':
				if (this.gradient) this.gradient.enabled = n > 0.5;
				break;
			case 'gradientAmount':
				if (this.gradient) this.gradient.amount = n;
				break;
			case 'gradientScatter':
				if (this.gradient) this.gradient.scatter = n;
				break;
			case 'gradientFrequency':
				if (this.gradient) this.gradient.frequency = n;
				break;
			case 'gradientOffset':
				// A bias on top of the pointer value, so the slider stays useful
				// whether or not tracking is on.
				this.gradientUserOffset = n;
				if (this.gradient && !this.gradientFollow) this.gradient.offset = n;
				break;
			case 'gradientTrack':
				this.gradientFollow = n > 0.5;
				break;
			case 'studio':
				this.setStudio(n > 0.5);
				break;
			case 'sweepLight':
				if (this.sweep) this.sweep.light = value as string;
				break;
			case 'sweepDark':
				if (this.sweep) this.sweep.dark = value as string;
				break;
			case 'sweepAngle':
				if (this.sweep) this.sweep.angle = n;
				break;
			case 'sweepMid':
				if (this.sweep) this.sweep.mid = n;
				break;
			case 'sweepSpread':
				if (this.sweep) this.sweep.spread = n;
				break;
			case 'sweepFalloff':
				if (this.sweep) this.sweep.falloff = n;
				break;
			case 'shadeAzimuth':
				this.shadeAngles.azimuth = n;
				this.updateShadeDir();
				break;
			case 'shadeElevation':
				this.shadeAngles.elevation = n;
				this.updateShadeDir();
				break;
			case 'shadeCoverage':
				if (this.shade) this.shade.uShadeCoverage.value = n;
				break;
			case 'shadeSoftness':
				if (this.shade) this.shade.uShadeSoftness.value = n;
				break;
			case 'shadeDepth':
				if (this.shade) this.shade.uShadeDepth.value = n;
				break;
			case 'studioGrain':
				if (this.sweep) this.sweep.grain = n;
				break;
			case 'sweepCurve':
				if (this.sweep) this.sweep.curve = n;
				break;
			case 'sweepLift':
				if (this.sweep) this.sweep.lift = n;
				break;
			case 'studioBounce':
				if (this.shade) this.shade.uBounce.value = n;
				break;
			case 'studioGrainSize':
				if (this.sweep) this.sweep.grainSize = n;
				break;
			case 'studioGrainSpeed':
				if (this.sweep) this.sweep.grainSpeed = n;
				break;
			case 'studioKey':
				this.studioKeyFollow = n > 0.5;
				// Letting go of the key puts it back where the rig had it.
				if (!this.studioKeyFollow && this.studioOn) this.lights.key.position.copy(this.keyHome);
				break;
		}
		// The groups' copies follow the shared material.
		for (const g of this.groups.values()) this.syncGroup(g);
	}

	/**
	 * Aim the real key from the shade direction, so the soft cast shadows
	 * (deck hardware onto the vessel) fall the same way the terminator does.
	 * The direction is view-space; rotating it by the camera puts it in world
	 * space, and it is re-done every frame because the scroll shots move the
	 * camera. Distance is kept, so the shadow frustum set up in load() holds.
	 */
	private aimKey() {
		const { key } = this.lights;
		const dist = this.keyHome.length();
		shadeDirection(this.shadeAngles.azimuth, this.shadeAngles.elevation, this.tmpDir)
			.applyQuaternion(this.camera.quaternion)
			.multiplyScalar(dist);
		key.position.copy(this.tmpDir).add(key.target.position);
	}

	private updateShadeDir() {
		if (!this.shade) return;
		shadeDirection(this.shadeAngles.azimuth, this.shadeAngles.elevation, this.shade.uShadeDir.value);
	}

	/**
	 * The master toggle. On: enable the sweep pass and the shade term, and
	 * swap the rig to STUDIO_PRESET, remembering what it displaced. Off: put
	 * those values back. Idempotent, so a repeated "on" cannot overwrite the
	 * saved values with the preset itself.
	 */
	private setStudio(on: boolean) {
		if (on === this.studioOn) return;
		this.studioOn = on;
		if (this.sweep) this.sweep.enabled = on;
		if (this.shade) this.shade.uShadeOn.value = on ? 1 : 0;
		if (on) {
			const current = this.readParams();
			this.studioSaved = Object.fromEntries(STUDIO_KEYS.map((k) => [k, current[k]]));
			for (const [k, v] of Object.entries(STUDIO_PRESET)) this.setParam(k as keyof RenderParams, v);
			this.keyHome.copy(this.lights.key.position);
		} else {
			if (this.studioSaved) {
				for (const [k, v] of Object.entries(this.studioSaved)) this.setParam(k as keyof RenderParams, v);
				this.studioSaved = null;
			}
			this.lights.key.position.copy(this.keyHome);
		}
		for (const fn of this.studioHandlers) fn(on);
	}

	/** Count of real draw calls from the last frame — handy while tuning. */
	get drawCalls() {
		return this.renderer.info.render.calls;
	}

	/**
	 * The lens: vertical field of view in degrees. Longer lenses (smaller
	 * values) flatten perspective; pull the camera back to keep the framing.
	 * Cheap to set every frame — only the projection updates.
	 */
	get fov() {
		return this.baseFov;
	}
	set fov(deg: number) {
		this.baseFov = deg;
		this.updateFov();
	}

	private updateFov() {
		const aspect = this.camera.aspect;
		// Aspect-aware framing. three's `fov` is the VERTICAL angle, so visible
		// height is the same at any aspect — but visible width is height ×
		// aspect, which collapses on a tall, narrow stage and crops the model's
		// sides. Widen the vertical FOV until the bounding sphere fits both
		// axes. `max` with the base FOV means wide viewports keep the composed
		// framing exactly; only narrow ones pull back.
		if (this.fitRadius > 0) {
			// A longer lens is used from further back (see `fov`), so the guard
			// measures from the distance that keeps the framing, not the default.
			const half = (deg: number) => Math.tan(THREE.MathUtils.degToRad(deg) / 2);
			const distance = (this.fitDistance * half(DEFAULT_FOV)) / half(this.baseFov);
			const theta = Math.asin(Math.min(1, (this.fitRadius * 1.08) / distance));
			const needed = 2 * Math.max(theta, Math.atan(Math.tan(theta) / aspect));
			this.camera.fov = Math.max(this.baseFov, THREE.MathUtils.radToDeg(needed));
		}

		this.camera.updateProjectionMatrix();
	}

	resize() {
		const { clientWidth: w, clientHeight: h } = this.container;
		if (!w || !h) return;
		this.camera.aspect = w / h;
		this.updateFov();
		this.canvasRect = this.container.getBoundingClientRect();
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h);
		// composer.setSize just sized occlusion to the full frame; scale it back.
		const aoScale = this.aoScale;
		if (this.gtao && aoScale > 0 && aoScale < 1) {
			const pr = this.renderer.getPixelRatio();
			this.gtao.setSize(Math.round(w * pr * aoScale), Math.round(h * pr * aoScale));
		}
		this.invalidate();
		// composer.setSize just pushed bloom to full resolution — put it back to
		// half. Full-res bloom is where its blocky mip artifacts come from.
		if (this.bloom) {
			const pr = this.renderer.getPixelRatio();
			this.bloom.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
		}
	}

	render() {
		if (this.disposed || this.contextLost) return;
		if (this.opts.breathe !== false) {
			// ~1% of the model's height over a 7s period. The contact shadow
			// lightens as it rises, which is what sells the motion.
			const t = this.clock.getElapsedTime();
			this.root.position.y = Math.sin(t * 0.9) * this.radius * 0.006;
		}
		// Third rotation layer, summed with the other two. Paused while dragging
		// so the model holds still under the cursor, and the per-frame delta is
		// clamped so returning to a backgrounded tab doesn't jump it round.
		const now = this.clock.getElapsedTime();
		const dt = Math.min(0.1, now - this.lastTime);
		this.lastTime = now;
		if (this.opts.autoRotate && this.spinning && !this.drag.active) this.autoRotation += this.opts.autoRotate * dt;

		if (this.gradient) {
			// Averaging both axes gives 0 at top-left and 1 at bottom-right with
			// equal weight regardless of aspect — the behaviour the source's
			// brief describes (its shipped code only used X).
			//
			// The target is held while dragging: the pointer is busy turning the
			// model, and letting it sweep the ramp at the same time couples two
			// unrelated things. It resumes from wherever the pointer ended up.
			if (this.gradientFollow && this.pointer.seen && !this.drag.active) {
				const aim = (this.pointer.x + this.pointer.y) / 2;
				// Frame-rate independent easing, so the feel is identical at 30 or 120fps.
				this.pointerOffset += (aim - this.pointerOffset) * (1 - Math.exp(-dt / this.gradientTau));
			}
			this.gradient.offset = this.gradientUserOffset + (this.gradientFollow ? this.pointerOffset : 0);
		}

		this.root.rotation.set(
			this.scrollRotation.x + this.userRotation.x,
			this.scrollRotation.y + this.userRotation.y + this.autoRotation,
			this.scrollRotation.z,
			'ZXY'
		);
		this.camera.lookAt(this.target);
		// The far plane follows the camera, so a shot from further out than
		// the opening one (or a model taken apart) never runs past it; the
		// near plane stays put, where the depth precision is.
		if (this.fitRadius > 0) {
			const far = this.camera.position.length() + this.fitRadius * 4;
			if (Math.abs(far - this.camera.far) > this.fitRadius * 0.01) {
				this.camera.far = far;
				this.camera.updateProjectionMatrix();
			}
		}
		if (this.groups.size) {
			this.root.updateMatrixWorld();
			this.aimCuts();
			this.glowFrame.value.copy(this.root.matrixWorld).invert().premultiply(this.toAuthored.makeTranslation(-this.offset.x, -this.offset.y, -this.offset.z));
		}
		if (this.studioOn && this.studioKeyFollow) this.aimKey();
		// Focus rides the camera target, so whatever the scroll shot frames is sharp.
		if (this.bokeh) this.bokehUniforms.focus.value = this.camera.position.distanceTo(this.target);
		this.renderer.info.reset();
		if (this.grain) this.grain.uniforms.uTime.value = this.clock.getElapsedTime();
		if (this.sweep) this.sweep.time = this.clock.getElapsedTime();
		if (!this.shouldDraw(now)) {
			this.pace.drew = false;
			return;
		}
		this.contact?.update(this.scene);
		// One shadow pass per frame, consumed by the scene render.
		this.renderer.shadowMap.needsUpdate = true;
		this.composer.render();
		this.framesDrawn++;
		this.keepPace();
	}

	/**
	 * Adaptive quality, for GPUs the full frame is too much for (an
	 * integrated laptop GPU at a pixel ratio of 2): the aim is frames at the
	 * display's rate, 60 at least. The steps (`ladder`), least seen first:
	 * occlusion at half resolution, the pixel ratio down through 1.5 and 1.25
	 * to 1, then occlusion off.
	 *
	 * It starts where the GPU can keep up: `warmUp` times a few frames before
	 * the model is seen (`probe`) and steps down until one fits. Then, while
	 * frames are drawn back to back (a camera move, a reveal, the slow turn on
	 * a 60 Hz display), the median of the
	 * last 40 intervals is checked: under ~55 fps, one step down. A step that
	 * doesn't make frames at least 8% faster is undone, and that's where it
	 * stays: the time is going somewhere a smaller frame can't help (the CPU,
	 * the vertices). Never back up, so it settles rather than hunts. A GPU
	 * with headroom never leaves the first step.
	 */
	private keepPace() {
		const p = this.pace;
		const t = performance.now();
		const dt = t - p.last;
		const steady = p.drew && !document.hidden && dt < 1000 && t > p.settleUntil;
		p.last = t;
		p.drew = true;
		if (!steady || p.done) return;
		p.intervals.push(dt);
		if (p.intervals.length < 40) return;
		const median = [...p.intervals].sort((a, b) => a - b)[20];
		p.intervals.length = 0;
		if (p.stepped && median > p.stepped.median * STEP_GAIN) {
			// A smaller frame didn't buy faster frames: back, and stop there.
			this.setStep(p.stepped.from);
			p.done = true;
			if (import.meta.env.DEV) console.info(`[viewer] no faster at step ${p.step + 1}: back to step ${p.stepped.from}`);
			return;
		}
		p.stepped = null;
		if (median < SLOW_FRAME_MS || p.step >= this.ladder.length - 1) return;
		p.stepped = { from: p.step, median };
		this.setStep(p.step + 1);
		p.settleUntil = t + 1500;
		if (import.meta.env.DEV) console.info(`[viewer] ${median.toFixed(1)} ms frames: step ${p.step}`, this.ladder[p.step]);
	}

	/**
	 * Times a few frames to the GPU's finish, without stalling the main
	 * thread (a fence, polled), and steps down until one takes less than
	 * SLOW_FRAME_MS less a margin (about 14 ms, room for 60 fps), as long as
	 * each step helps. For `warmUp`,
	 * out of sight. The polling rounds up by a few milliseconds: the fastest
	 * of three counts.
	 */
	private async probe(draw: () => void) {
		const gl = this.renderer.getContext();
		if (!(gl instanceof WebGL2RenderingContext)) return;
		// Four frames back to back, timed to the last one's finish: a single
		// frame's time is mostly the GPU waking up and the queue ahead of it
		// (a fast GPU read as 15 ms for a 3 ms frame), four in a row its
		// throughput. The better of two.
		const time = async () => {
			let best = Infinity;
			for (let k = 0; k < 2; k++) {
				await nextFrame();
				if (this.disposed) return 0;
				const t = performance.now();
				// In two pairs, the page given the main thread between them (the
				// GPU busy with the first meanwhile): four draws' submission in one
				// task held a slow laptop's main thread for 70 ms.
				for (let f = 0; f < 4; f++) {
					draw();
					if (f === 1) await yieldToMain();
				}
				const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
				if (!sync) return 0;
				gl.flush();
				while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && !this.disposed) await new Promise((r) => setTimeout(r, 1));
				gl.deleteSync(sync);
				best = Math.min(best, (performance.now() - t) / 4);
			}
			return best;
		};
		let ms = await time();
		while (ms > SLOW_FRAME_MS * 0.8 && this.pace.step < this.ladder.length - 1 && !this.disposed) {
			const from = this.pace.step;
			this.setStep(from + 1);
			const next = await time();
			if (import.meta.env.DEV) console.info(`[viewer] out of sight, ${ms.toFixed(1)} → ${next.toFixed(1)} ms at step ${this.pace.step}`, this.ladder[this.pace.step]);
			// No faster for it (the time is the CPU's, say): back, and leave it to `keepPace`.
			if (next > ms * STEP_GAIN) {
				this.setStep(from);
				break;
			}
			ms = next;
		}
	}

	/**
	 * Compiles the passes' own shaders (occlusion, its normals and upsample,
	 * the backdrop, the copies) in parallel, as `compileAsync` does the
	 * model's: their first draw would otherwise compile them on the spot, a
	 * stall of tens of milliseconds on a slower laptop, in the middle of the
	 * page scrolling. Each as a full-screen quad, both into a render target
	 * and onto the canvas, as the passes draw them.
	 */
	private async compilePasses() {
		const materials = new Set<THREE.Material>();
		const collect = (o: unknown, depth = 0) => {
			if (!o || typeof o !== 'object' || depth > 1) return;
			for (const value of Object.values(o)) {
				if ((value as THREE.Material)?.isMaterial) materials.add(value as THREE.Material);
				else if (value instanceof FullScreenQuad && value.material) materials.add(value.material);
				else if (depth === 0 && value && typeof value === 'object' && !(value as THREE.Object3D).isObject3D) collect(value, depth + 1);
			}
		};
		for (const pass of this.composer.passes) collect(pass);
		const scene = new THREE.Scene();
		const plane = new THREE.PlaneGeometry(2, 2);
		for (const m of materials) scene.add(new THREE.Mesh(plane, m));
		const target = this.renderer.getRenderTarget();
		for (const into of [this.composer.readBuffer, null]) {
			this.renderer.setRenderTarget(into);
			await this.renderer.compileAsync(scene, this.camera);
			if (this.disposed) break;
		}
		this.renderer.setRenderTarget(target);
		plane.dispose();
	}

	/** Moves to step `i` of the ladder. */
	private setStep(i: number) {
		this.pace.step = i;
		const { ratio, ao } = this.ladder[i];
		this.aoScale = ao;
		this.renderer.setPixelRatio(ratio);
		this.composer.setPixelRatio(ratio);
		if (this.gtao) this.gtao.enabled = ao > 0;
		this.resize();
	}

	/** The steps adaptive quality goes down through, from the full frame. */
	private ladder: { ratio: number; ao: number }[] = [];
	/** The occlusion's resolution, a share of the frame's (`aoScale`, then adaptive quality's). */
	private aoScale = 1;
	private pace = {
		last: 0,
		drew: false,
		/** Intervals between frames drawn back to back, ms. */
		intervals: [] as number[],
		settleUntil: 0,
		/** Where on the ladder it is. */
		step: 0,
		/** The last step down, to judge whether it helped. */
		stepped: null as { from: number; median: number } | null,
		/** Settled: no more steps. */
		done: false
	};

	/** Whether anything visible moved since the last drawn frame. */
	private shouldDraw(now: number) {
		const c = this.camera.position;
		const t = this.target;
		const r = this.root;
		// Everything a frame depends on apart from the auto-rotation.
		const view = [
			c.x, c.y, c.z, t.x, t.y, t.z, this.camera.fov, this.camera.aspect,
			r.rotation.x, this.scrollRotation.y + this.userRotation.y, r.rotation.z, r.scale.x, r.position.y,
			this.gradient?.offset ?? 0
		];
		// Effects that change with time alone have to draw every frame.
		const timed =
			this.opts.breathe !== false ||
			!!this.grain?.enabled ||
			!!(this.sweep?.enabled && this.sweep.grainSpeed > 0) ||
			this.overlays.some((animated) => animated());
		const moved = this.dirty || timed || view.some((v, i) => v !== this.lastView[i]);
		const spun = this.autoRotation !== this.lastSpin;
		if (!moved && !(spun && now - this.lastDrawn >= 1 / SPIN_FPS - 0.004)) return false;
		this.dirty = false;
		this.lastView = view;
		this.lastSpin = this.autoRotation;
		this.lastDrawn = now;
		return true;
	}

	dispose() {
		this.disposed = true;
		for (const g of this.groups.values()) g.material.dispose();
		this.observer.disconnect();
		const el = this.renderer.domElement;
		el.removeEventListener('webglcontextlost', this.handleContextLost);
		el.removeEventListener('pointerdown', this.onPointerDown);
		window.removeEventListener('pointermove', this.onPointerMove);
		window.removeEventListener('pointerup', this.endDrag);
		window.removeEventListener('pointercancel', this.endDrag);
		window.removeEventListener('blur', this.endDrag);
		this.dragEndHandlers.clear();
		this.studioHandlers.clear();
		this.scene.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.isMesh) m.geometry?.dispose();
		});
		this.material?.dispose();
		if (this.ground) {
			this.ground.geometry.dispose();
			(this.ground.material as THREE.Material).dispose();
		}
		this.contact?.dispose();
		this.gtao?.dispose();
		this.gradient?.dispose();
		this.sweep?.dispose();
		this.ssr?.dispose();
		this.renderPass.dispose();
		this.bokeh?.dispose();
		this.composer.dispose();
		this.envRT?.dispose();
		this.pmrem.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}

/**
 * Something of a group that moves (`setGroup`'s `out` and `up`): where it
 * rests, and which way out and up are, in its parent's frame.
 */
type Piece = {
	mesh: THREE.Object3D;
	base: THREE.Vector3;
	out: THREE.Vector3;
	up: THREE.Vector3;
	/** `out`'s direction in the model's authored frame, to carry points with the piece. */
	way?: THREE.Vector3;
	/** How far it stands from the axis (a column's), metres. */
	away?: number;
	/** Its own lift on top of its group's `up` (`liftPiece`), metres. */
	lift?: number;
};

/**
 * Ambient occlusion from the scene pass's own depth (GTAOPass), made cheap
 * without changing a pixel of it, and able to run at a lower resolution:
 *
 *  - Normals once. With only depth to go on, GTAO and its denoiser rebuild a
 *    surface normal from nine depth reads wherever they need one, and the
 *    denoiser needs one for each of its 17 taps: some 150 depth reads a
 *    pixel, most of the occlusion's cost. Here a pass rebuilds each pixel's
 *    normal once, the same way, into a texture both read instead.
 *  - At a lower resolution (`aoScale`, phones), a joint bilateral upsample:
 *    each pixel takes the occlusion of the four nearest low-resolution
 *    samples, weighted as bilinear would but also by how close each one's
 *    depth is to its own (allowing for the surface's slope), so a sample from
 *    the surface behind a silhouette doesn't bleed across it, and edges keep
 *    the frame's resolution rather than stepping.
 *  - The stock pass's copy of the frame and its multiply folded into one draw.
 */
class SceneGTAOPass extends GTAOPass {
	/** The view normals, rebuilt once a frame from the depth (`setGBuffer` with it). */
	readonly normals = new THREE.WebGLRenderTarget(1, 1, {
		type: THREE.HalfFloatType,
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		depthBuffer: false
	});
	private rebuildNormals = new THREE.ShaderMaterial({
		uniforms: {
			tDepth: { value: null },
			cameraProjectionMatrixInverse: { value: new THREE.Matrix4() }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,
		// GTAOShader's own reconstruction, word for word.
		fragmentShader: /* glsl */ `
			#include <packing>
			uniform highp sampler2D tDepth;
			uniform mat4 cameraProjectionMatrixInverse;
			varying vec2 vUv;
			vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
				vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
				return viewSpacePosition.xyz / viewSpacePosition.w;
			}
			float fetchDepth( const ivec2 uv ) {
				return texelFetch( tDepth, uv.xy, 0 ).x;
			}
			vec3 computeNormalFromDepth( const vec2 uv ) {
				vec2 size = vec2( textureSize( tDepth, 0 ) );
				ivec2 p = ivec2( uv * size );
				float c0 = fetchDepth( p );
				float l2 = fetchDepth( p - ivec2( 2, 0 ) );
				float l1 = fetchDepth( p - ivec2( 1, 0 ) );
				float r1 = fetchDepth( p + ivec2( 1, 0 ) );
				float r2 = fetchDepth( p + ivec2( 2, 0 ) );
				float b2 = fetchDepth( p - ivec2( 0, 2 ) );
				float b1 = fetchDepth( p - ivec2( 0, 1 ) );
				float t1 = fetchDepth( p + ivec2( 0, 1 ) );
				float t2 = fetchDepth( p + ivec2( 0, 2 ) );
				float dl = abs( ( 2.0 * l1 - l2 ) - c0 );
				float dr = abs( ( 2.0 * r1 - r2 ) - c0 );
				float db = abs( ( 2.0 * b1 - b2 ) - c0 );
				float dt = abs( ( 2.0 * t1 - t2 ) - c0 );
				vec3 ce = getViewPosition( uv, c0 ).xyz;
				vec3 dpdx = ( dl < dr ) ? ce - getViewPosition( ( uv - vec2( 1.0 / size.x, 0.0 ) ), l1 ).xyz : - ce + getViewPosition( ( uv + vec2( 1.0 / size.x, 0.0 ) ), r1 ).xyz;
				vec3 dpdy = ( db < dt ) ? ce - getViewPosition( ( uv - vec2( 0.0, 1.0 / size.y ) ), b1 ).xyz : - ce + getViewPosition( ( uv + vec2( 0.0, 1.0 / size.y ) ), t1 ).xyz;
				return normalize( cross( dpdx, dpdy ) );
			}
			void main() {
				gl_FragColor = vec4( packNormalToRGB( computeNormalFromDepth( vUv ) ), 1.0 );
			}`,
		depthTest: false,
		depthWrite: false,
		blending: THREE.NoBlending
	});
	private normalQuad = new FullScreenQuad(this.rebuildNormals);

	private composite = new THREE.ShaderMaterial({
		uniforms: {
			tDiffuse: { value: null },
			tAO: { value: null },
			tDepth: { value: null },
			uIntensity: { value: 1 },
			cameraNear: { value: 0.1 },
			cameraFar: { value: 100 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,
		fragmentShader: /* glsl */ `
			#include <packing>
			uniform sampler2D tDiffuse;
			uniform sampler2D tAO;
			uniform sampler2D tDepth;
			uniform float uIntensity;
			uniform float cameraNear;
			uniform float cameraFar;
			varying vec2 vUv;

			float viewZ( vec2 uv ) {
				return perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cameraNear, cameraFar );
			}

			void main() {
				vec4 scene = texture2D( tDiffuse, vUv );
				vec2 size = vec2( textureSize( tAO, 0 ) );
				// At the frame's own resolution: nothing to upsample.
				if ( size == vec2( textureSize( tDepth, 0 ) ) ) {
					vec3 ao = texelFetch( tAO, ivec2( vUv * size ), 0 ).rgb;
					gl_FragColor = vec4( scene.rgb * mix( vec3( 1.0 ), ao, uIntensity ), scene.a );
					return;
				}
				vec2 p = vUv * size - 0.5;
				vec2 base = floor( p );
				vec2 f = p - base;
				float z = viewZ( vUv );
				// How fast depth changes across this pixel's own surface, from
				// the nearer neighbour on each axis (so a silhouette beside it
				// doesn't count): samples a low-resolution texel away on the same
				// surface, however steeply it's seen, lie within a few of these.
				vec2 px = 1.0 / vec2( textureSize( tDepth, 0 ) );
				float slope =
					min( abs( viewZ( vUv + vec2( px.x, 0.0 ) ) - z ), abs( z - viewZ( vUv - vec2( px.x, 0.0 ) ) ) ) +
					min( abs( viewZ( vUv + vec2( 0.0, px.y ) ) - z ), abs( z - viewZ( vUv - vec2( 0.0, px.y ) ) ) );
				float tolerance = max( abs( z ) * 0.003, slope * 3.0 );
				vec3 sum = vec3( 0.0 );
				float total = 0.0;
				vec3 nearest = vec3( 1.0 );
				float nearestGap = 1e9;
				for ( int i = 0; i < 4; i ++ ) {
					vec2 o = vec2( float( i - ( i / 2 ) * 2 ), float( i / 2 ) );
					ivec2 texel = ivec2( clamp( base + o, vec2( 0.0 ), size - 1.0 ) );
					vec3 ao = texelFetch( tAO, texel, 0 ).rgb;
					// The depth the sample was worked out at: the frame's, at its centre.
					float gap = abs( viewZ( ( vec2( texel ) + 0.5 ) / size ) - z );
					float bilinear = ( o.x > 0.5 ? f.x : 1.0 - f.x ) * ( o.y > 0.5 ? f.y : 1.0 - f.y );
					float same = exp( - ( gap / tolerance ) * ( gap / tolerance ) );
					float w = bilinear * same;
					sum += ao * w;
					total += w;
					if ( gap < nearestGap ) {
						nearestGap = gap;
						nearest = ao;
					}
				}
				vec3 ao = total > 1e-6 ? sum / total : nearest;
				gl_FragColor = vec4( scene.rgb * mix( vec3( 1.0 ), ao, uIntensity ), scene.a );
			}`,
		depthTest: false,
		depthWrite: false,
		blending: THREE.NoBlending
	});

	render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, delta: number, maskActive: boolean) {
		// The normals, at the depth's own resolution.
		const depth = this.depthTexture as THREE.DepthTexture;
		const { width, height } = depth.image as { width: number; height: number };
		if (this.normals.width !== width || this.normals.height !== height) this.normals.setSize(width, height);
		this.rebuildNormals.uniforms.tDepth.value = depth;
		this.rebuildNormals.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
		renderer.setRenderTarget(this.normals);
		this.normalQuad.render(renderer);
		// The stock pass works out and denoises the occlusion only…
		const output = this.output;
		this.output = GTAOPass.OUTPUT.Off;
		super.render(renderer, writeBuffer, readBuffer, delta, maskActive);
		this.output = output;
		// …and this draws the frame with it.
		const u = this.composite.uniforms;
		u.tDiffuse.value = readBuffer.texture;
		u.tAO.value = this.pdRenderTarget.texture;
		u.tDepth.value = this.depthTexture;
		u.uIntensity.value = this.blendIntensity;
		u.cameraNear.value = (this.camera as THREE.PerspectiveCamera).near;
		u.cameraFar.value = (this.camera as THREE.PerspectiveCamera).far;
		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
		this.quad.render(renderer);
	}
	private quad = new FullScreenQuad(this.composite);

	dispose() {
		super.dispose();
		this.composite.dispose();
		this.quad.dispose();
		this.normals.dispose();
		this.rebuildNormals.dispose();
		this.normalQuad.dispose();
	}
}

/**
 * The scene, drawn into its own multisampled target (`target`, with a depth
 * texture the occlusion and the energy trails read), then resolved into the
 * composer's single-sampled read buffer for the passes after it. Stands in
 * for RenderPass, which would draw straight into the composer's buffers and
 * so make them multisampled too.
 */
class BeautyPass extends Pass {
	private copy = new THREE.ShaderMaterial({
		uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
		vertexShader: CopyShader.vertexShader,
		fragmentShader: CopyShader.fragmentShader,
		blending: THREE.NoBlending,
		depthTest: false,
		depthWrite: false
	});
	private quad = new FullScreenQuad(this.copy);

	constructor(
		private scene: THREE.Scene,
		private camera: THREE.Camera,
		private target: THREE.WebGLRenderTarget
	) {
		super();
		this.needsSwap = false;
	}

	setSize(width: number, height: number) {
		this.target.setSize(width, height);
	}

	render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.setRenderTarget(this.target);
		renderer.clear();
		renderer.render(this.scene, this.camera);
		this.copy.uniforms.tDiffuse.value = this.target.texture;
		renderer.setRenderTarget(this.renderToScreen ? null : read);
		this.quad.render(renderer);
		renderer.autoClear = autoClear;
	}

	dispose() {
		this.copy.dispose();
		this.quad.dispose();
		this.target.dispose();
	}
}

function piece(mesh: THREE.Object3D, out: THREE.Vector3): Piece {
	mesh.updateWorldMatrix(true, false);
	const toLocal = mesh.parent ? new THREE.Matrix3().setFromMatrix4(mesh.parent.matrixWorld).invert() : new THREE.Matrix3();
	return { mesh, base: mesh.position.clone(), out, up: new THREE.Vector3(0, 1, 0).applyMatrix3(toLocal) };
}

/**
 * Collapse the model's non-instanced parts into a single mesh.
 *
 * Every part shares one material, so nothing distinguishes 110 draws from
 * one except the exporter's node structure — and each frame renders the
 * scene twice (shadow depth, beauty). Instanced
 * parts are left alone: they are already one draw each.
 *
 * The quantised attributes (Int16 positions, Int8 normals from
 * KHR_mesh_quantization) are widened to float first. Baking a node's world
 * transform into a normalised Int16 attribute would clamp everything to
 * [-1, 1]; widening is exact, so the vertices land where the vertex shader
 * would have put them. UVs are dropped: the material samples no textures
 * and the surface-variation noise is world-space, so they were dead weight
 * and their mixed types (Uint16 / Float32) would have blocked the merge.
 */
function mergeStaticMeshes(model: THREE.Object3D, material: THREE.Material) {
	model.updateMatrixWorld(true);
	const toModel = model.matrixWorld.clone().invert();
	const parts: THREE.Mesh[] = [];
	model.traverse((o) => {
		const m = o as THREE.Mesh;
		if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) parts.push(m);
	});
	if (parts.length < 2) return;

	const widen = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
		const k = attr.itemSize;
		const out = new Float32Array(attr.count * k);
		for (let i = 0; i < attr.count; i++) {
			out[i * k] = attr.getX(i);
			if (k > 1) out[i * k + 1] = attr.getY(i);
			if (k > 2) out[i * k + 2] = attr.getZ(i);
		}
		return new THREE.BufferAttribute(out, k);
	};
	const rel = new THREE.Matrix4();
	const geometries = parts.map((m) => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', widen(m.geometry.attributes.position));
		g.setAttribute('normal', widen(m.geometry.attributes.normal));
		if (m.geometry.index) g.setIndex(m.geometry.index.clone());
		rel.copy(toModel).multiply(m.matrixWorld);
		g.applyMatrix4(rel);
		return g;
	});
	const merged = mergeGeometries(geometries, false);
	geometries.forEach((g) => g.dispose());
	if (!merged) return; // incompatible attributes — leave the parts as they were
	merged.computeBoundingSphere();

	for (const m of parts) {
		m.removeFromParent();
		m.geometry.dispose();
	}
	const mesh = new THREE.Mesh(merged, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = 'merged-static';
	model.add(mesh);
}

/*
 * Loading works on the CAD's vertex data directly, as typed arrays. The
 * groups run to hundreds of thousands of vertices; through three's per-
 * vertex accessors (getX, fromBufferAttribute: a call, a normalisation and a
 * bounds check per component) carving and splitting them held the main
 * thread for a third of a second, mid-scroll.
 */

/** An attribute's raw storage: quantised (KHR_mesh_quantization) or not, interleaved or not. */
function attributeView(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
	const inter = (attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute;
	const array = (inter ? (attr as THREE.InterleavedBufferAttribute).data.array : (attr as THREE.BufferAttribute).array) as ArrayLike<number>;
	const stride = inter ? (attr as THREE.InterleavedBufferAttribute).data.stride : attr.itemSize;
	const offset = inter ? (attr as THREE.InterleavedBufferAttribute).offset : 0;
	// Normalised integers map to [0, 1] or [−1, 1], as three's own denormalize.
	const scale = !attr.normalized
		? 0
		: array instanceof Int8Array
			? 127
			: array instanceof Uint8Array
				? 255
				: array instanceof Int16Array
					? 32767
					: array instanceof Uint16Array
						? 65535
						: 0;
	const signed = array instanceof Int8Array || array instanceof Int16Array;
	return { array, stride, offset, scale, signed };
}

/** The bounds of each part of a mesh (its `_part` index), in world space, and each vertex's part. */
type PartBounds = { n: number; part: Uint32Array; lo: Float32Array; hi: Float32Array };
/** Per position attribute (shared by a group's carved and split meshes), with the matrix they were measured under. */
const partBoundsCache = new WeakMap<object, { matrix: string; bounds: PartBounds }>();

async function partBounds(mesh: THREE.Mesh): Promise<PartBounds> {
	const geometry = mesh.geometry;
	const position = geometry.getAttribute('position');
	const e = mesh.matrixWorld.elements;
	const matrix = e.join(',');
	const cached = partBoundsCache.get(position);
	if (cached?.matrix === matrix) return cached.bounds;

	const count = position.count;
	const slice = slicer();
	const P = attributeView(geometry.getAttribute('_part'));
	const part = new Uint32Array(count);
	let n = 1;
	for (let i = 0; i < count; i++) {
		const p = P.array[i * P.stride + P.offset];
		part[i] = p;
		if (p + 1 > n) n = p + 1;
	}
	const lo = new Float32Array(n * 3).fill(Infinity);
	const hi = new Float32Array(n * 3).fill(-Infinity);
	const V = attributeView(position);
	const { array, stride, offset, scale, signed } = V;
	for (let i = 0; i < count; i++) {
		if ((i & 0x3fff) === 0) await slice();
		const at = i * stride + offset;
		let x = array[at];
		let y = array[at + 1];
		let z = array[at + 2];
		if (scale) {
			x /= scale;
			y /= scale;
			z /= scale;
			if (signed) {
				x = Math.max(x, -1);
				y = Math.max(y, -1);
				z = Math.max(z, -1);
			}
		}
		// To world space (an affine matrix: no divide).
		const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
		const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
		const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
		const p = part[i] * 3;
		if (wx < lo[p]) lo[p] = wx;
		if (wx > hi[p]) hi[p] = wx;
		if (wy < lo[p + 1]) lo[p + 1] = wy;
		if (wy > hi[p + 1]) hi[p + 1] = wy;
		if (wz < lo[p + 2]) lo[p + 2] = wz;
		if (wz > hi[p + 2]) hi[p + 2] = wz;
	}
	const bounds = { n, part, lo, hi };
	partBoundsCache.set(position, { matrix, bounds });
	return bounds;
}

/**
 * A geometry's triangles sorted into `count` buckets by the part of their
 * first vertex (`bucketOf` a part), each as an index array of the smallest
 * type that holds the vertex count.
 */
async function trianglesBy(geometry: THREE.BufferGeometry, part: Uint32Array, count: number, bucketOf: (part: number) => number) {
	const slice = slicer();
	const index = geometry.index?.array;
	const vertices = geometry.getAttribute('position').count;
	const triangles = index ? index.length / 3 : vertices / 3;
	const bucket = new Uint32Array(triangles);
	const sizes = new Uint32Array(count);
	for (let t = 0; t < triangles; t++) {
		if ((t & 0x3fff) === 0) await slice();
		const k = bucketOf(part[index ? index[t * 3] : t * 3]);
		bucket[t] = k;
		sizes[k] += 3;
	}
	const Index = vertices > 65535 ? Uint32Array : Uint16Array;
	const out = Array.from(sizes, (size) => new Index(size));
	const at = new Uint32Array(count);
	for (let t = 0; t < triangles; t++) {
		if ((t & 0x3fff) === 0) await slice();
		const k = bucket[t];
		const o = out[k];
		const i = at[k];
		o[i] = index ? index[t * 3] : t * 3;
		o[i + 1] = index ? index[t * 3 + 1] : t * 3 + 1;
		o[i + 2] = index ? index[t * 3 + 2] : t * 3 + 2;
		at[k] = i + 3;
	}
	return out;
}

/**
 * Gives a geometry made of some of `source`'s triangles (sharing its vertex
 * data) the source's bounds: whole-buffer bounds are what three would
 * compute for it anyway (its bounds ignore the index), only once rather than
 * by walking every shared vertex again for each piece. Read straight from
 * the typed array.
 */
function shareBounds(source: THREE.BufferGeometry, g: THREE.BufferGeometry) {
	if (!source.boundingBox) {
		const position = source.getAttribute('position');
		const { array, stride, offset, scale, signed } = attributeView(position);
		const lo = [Infinity, Infinity, Infinity];
		const hi = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < position.count; i++)
			for (let k = 0; k < 3; k++) {
				const v = array[i * stride + offset + k];
				if (v < lo[k]) lo[k] = v;
				if (v > hi[k]) hi[k] = v;
			}
		// Denormalising is monotonic: the raw extremes map to the real ones.
		const real = (v: number) => (scale ? (signed ? Math.max(v / scale, -1) : v / scale) : v);
		source.boundingBox = new THREE.Box3(new THREE.Vector3(...lo.map(real)), new THREE.Vector3(...hi.map(real)));
	}
	if (!source.boundingSphere) source.boundingSphere = source.boundingBox.getBoundingSphere(new THREE.Sphere());
	g.boundingBox = source.boundingBox;
	g.boundingSphere = source.boundingSphere;
}

/**
 * Waits for the next frame to be drawn, then a moment more: for work that
 * should land one piece per frame (the warm-up's draws), however the tasks
 * between frames fall. Two in one frame made a frame twice as long.
 */
function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * For a long loop: `await slice()` every so many iterations hands the main
 * thread back once `budget` milliseconds have gone since the last time, so
 * the loop runs in slices of about that length however fast the machine.
 */
function slicer(budget = 8) {
	let since = performance.now();
	return async () => {
		if (performance.now() - since < budget) return;
		await yieldToMain();
		since = performance.now();
	};
}

/**
 * Hands the main thread back for a moment (scroll, input, a frame), then
 * carries on: between the steps of putting a model together, none of which
 * should hold it longer than a frame or two.
 */
function yieldToMain() {
	const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
	if (scheduler?.yield) return scheduler.yield();
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Normalise a stop colour to a `#rrggbb` string for the colour inputs. */
function hex(color: number | string | undefined): string {
	if (typeof color === 'number') return '#' + color.toString(16).padStart(6, '0');
	return color ?? '#000000';
}

function createMaterial(preset: MaterialPreset, color: THREE.ColorRepresentation) {
	const m = new THREE.MeshPhysicalMaterial({ color });
	switch (preset) {
		case 'satin':
			// Semi-gloss industrial coating: a matte base under a real lacquer
			// layer. The clearcoat carries the environment reflection; the base
			// carries the colour and the soft diffuse shading.
			m.metalness = 0;
			m.roughness = 0.42;
			m.clearcoat = 0.55;
			m.clearcoatRoughness = 0.28;
			m.envMapIntensity = 1.0;
			break;
		case 'metal':
			m.metalness = 0.75;
			m.roughness = 0.32;
			m.envMapIntensity = 1.6;
			break;
		case 'glass':
			// Transmission needs metalness 0 — metals don't transmit.
			m.metalness = 0;
			m.roughness = 0.05;
			m.transmission = 1.0;
			m.thickness = 0.6;
			m.ior = 1.3;
			m.envMapIntensity = 0.45;
			break;
		case 'diffusion':
			// Partial transmission with depth: light enters, scatters, and
			// picks up the attenuation tint the further it travels.
			m.metalness = 0;
			m.roughness = 0.55;
			m.transmission = 0.72;
			m.thickness = 2.2;
			m.attenuationColor = new THREE.Color(color).multiplyScalar(0.6);
			m.attenuationDistance = 3;
			m.envMapIntensity = 0.5;
			break;
	}
	return m;
}

/**
 * Fallback lighting when no HDRI is configured: a mid-grey room with a few
 * bright strips. A mid grey is deliberate — match it to the page background
 * and the model washes out, take it near black and it reads as a silhouette.
 */
function createStudioEnvironment(): THREE.Scene {
	const env = new THREE.Scene();
	const geo = new THREE.BoxGeometry();

	// Values above 1.0 are intentional — PMREM wants HDR input.
	const emissive = (color: number, intensity: number) =>
		new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });

	const room = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6b7178, side: THREE.BackSide }));
	room.scale.setScalar(60);
	env.add(room);

	const panel = (
		scale: [number, number, number],
		pos: [number, number, number],
		color: number,
		intensity: number
	) => {
		const m = new THREE.Mesh(geo, emissive(color, intensity));
		m.scale.set(...scale);
		m.position.set(...pos);
		env.add(m);
	};

	panel([1, 34, 14], [17, 6, 2], 0xffffff, 7); // key strip, camera right
	panel([1, 30, 9], [-18, 2, -6], 0x9ec4ff, 2.4); // cool fill, camera left
	panel([26, 1, 26], [0, 20, 0], 0xffffff, 1.6); // soft overhead
	panel([1, 22, 5], [4, 4, -20], 0xffe3c0, 2); // warm kicker behind
	panel([30, 1, 18], [0, -16, 0], 0x9aa0a8, 1); // faint floor bounce

	return env;
}

function disposeScene(scene: THREE.Scene) {
	scene.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!m.isMesh) return;
		m.geometry.dispose();
		(m.material as THREE.Material).dispose();
	});
}
