import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
// The stack: how Mark-0 and the power conversion system join (see assembly.ts).
import { FILLER, PHX_LIFT, liftOf, turnOf } from './assembly';

/**
 * The systems page's scene, laid out and lit as the product video shows
 * it: one column, the reactor (Mark-0) at the bottom and the primary heat
 * exchanger stacked on top of it inside a single shield, standing in its
 * cradle; the Brayton skid behind with the turbo-alternator at its front.
 * Built from the grouped web models
 * (scripts/web-model.mjs). Each group is one mesh; per-part motion comes
 * from attributes derived here from the models' `_part` index:
 *
 *   aDrum  – which of the 12 control drums a vertex belongs to (−1: none),
 *            so the drums turn about their own axes in the vertex shader
 *   aLayer – the core layer a block sits in, so the stack can assemble
 *   aKind  – 1 fuel plug, 2 alternate finish (copper, the cradle's yellow lock)
 *   aGhost – 1 where a part dissolves when its group goes see-through
 *
 * Mark-0 first stands alone, whole, drive motors and all (points 1–4); then
 * the power conversion system docks onto it (`dock`, point 5): the
 * exchanger lowers onto the reactor's deck where the drives stood, and the
 * skid appears behind. Only from then on are the two shown joined, where
 * the camera never looks closely at the joint (see assembly.ts for how
 * far apart the two files really are).
 *
 * While Mark-0 stands alone, a drag turns it on a turntable, as the
 * homepage's model does, and it settles back when let go; once docked, a
 * drag turns the camera about the shot instead.
 *
 * The heat follows the video's single path: up the column on one front
 * (core → heat pipes → the exchanger's dome), then as a pulse down the
 * outlet pipe into the turbo-alternator and along its shaft. The video's
 * distribution cabinet isn't in the CAD, so the last point is the whole
 * system rather than a stand-in for it.
 *
 * Everything the page animates is a plain number on `state`, so GSAP
 * tweens it directly and `render()` maps it onto uniforms and the camera.
 * Geometry is baked to world space on load: no per-vertex matrices.
 *
 * On top of the shots, the visitor can drag to look around (see above).
 */

export const DEFAULT_STATE = {
	/**
	 * Position along the camera path set by `setCameraPath`, in keyframes
	 * (0 the first shot). −1 places the camera from camX…tgtZ directly.
	 */
	cam: -1,
	// The opening: Mark-0 alone, in its cradle, drive motors to the top of frame.
	camX: 7.0,
	camY: 4.1,
	camZ: 8.0,
	tgtX: 0,
	tgtY: 1.6,
	tgtZ: 0,
	fov: 30,
	/**
	 * The power conversion system docking onto Mark-0, 0 → 1: the drive
	 * motors go, the exchanger lowers onto the deck, the skid appears.
	 * 0, Mark-0 alone; 1, the whole system.
	 */
	dock: 0,
	/** The shield's upper half closing over the docked exchanger (a stand-in; not in the CAD): 0 open, 1 closed. */
	cap: 0,
	/**
	 * The cutaway in the column: a wedge through the shield, the reflector
	 * and the exchanger, always facing the camera. 0 closed, 1 open 110°.
	 */
	cut: 0,
	/** Shield vessel: 1 solid, 0 dissolved; ghost is its outline's strength. */
	shield: 1,
	shieldGhost: 0,
	/** Radial reflector blocks between core and drums. */
	refl: 1,
	reflGhost: 0,
	drums: 1,
	drumsGhost: 0,
	/** Drum rotation, radians. */
	drumTurn: 0,
	/** Graphite blocks: 1 solid, 0 dissolved (the fuel plugs stay). */
	core: 1,
	coreGhost: 0,
	/** Core assembly: 0 layers lifted apart, 1 stacked. */
	stack: 1,
	coreHeat: 0,
	/** Warm glow in the fuel channels, before the core heats. */
	fuel: 0,
	/** The heat pipes: Mark-0's in the core and their upper ends under the dome. */
	pipes: 1,
	pipesGhost: 0,
	/** The heat front up the column: strength, and height in metres. */
	heat: 0,
	heatY: 0,
	/** The exchanger's shell (dissolves) and its dome and header (`phxInner`). */
	phxShell: 1,
	phxGhost: 0,
	phxInner: 1,
	/** The gas pulse from the dome down the outlet pipe to the turbo-alternator, 0 → 1. */
	gas: 0,
	gasFront: 0,
	/** The turbo-alternator stand-in: casing, outline, half-section (0 → 1), and heat along its shaft (0 → 1). */
	turbo: 1,
	turboGhost: 0,
	turboCut: 0,
	turboHeat: 0,
	turboFront: 0,
	/**
	 * The low-key look (see SystemSceneOptions.look), 0 → 1, for the
	 * close-ups: slate backdrop, strip lights, near-monochrome
	 * finishes, heat without colour, bevel highlights. Without the look on,
	 * this and the three below do nothing.
	 */
	lowkey: 0,
	/** Under the look: the column alone, the cradle and skid gone (0 → 1). */
	soloColumn: 0,
	/** Under the look: the turbo-alternator alone, in its own shot, its supports gone (0 → 1). */
	soloTurbo: 0,
	/** Under the look: the turbo-alternator's exploded view, 0 → 1. */
	turboExplode: 0,
	/** Depth of field: 0 off (overviews), 1 full. Focus is always the camera's look-at target. */
	dof: 0,
	/**
	 * Everything round the column (cradle, skid, turbo-alternator):
	 * 1 shown, 0 dissolved, for the beats the video plays on an empty stage.
	 */
	world: 1,
	/**
	 * Moves the framing to clear the copy, in fractions of the frame: right
	 * on wide screens, where it sits on the left, up on narrow ones, where it
	 * sits below. Set by the page from the layout, not tweened.
	 */
	shift: 0,
	shiftY: 0
};
export type SystemState = typeof DEFAULT_STATE;
const STATE_KEYS = Object.keys(DEFAULT_STATE) as (keyof SystemState)[];

/** The exchanger's dome and header sit above this height; its shell below. */
const DOME_FROM = 3.6 + PHX_LIFT;

/**
 * What loads when, as files of static/models/cad/web/<model>/<group>.glb
 * (scripts/step-to-glb.sh --tags). First what the opening shots show, the
 * outside of the column and the skid; then, while the visitor reads, the
 * insides the walkthrough reveals from point 2 on.
 */
const STAGES: [model: string, group: string][][] = [
	[
		['mark-0', 'f1_cradle'],
		['mark-0', 'f2_drives']
	],
	[
		['mark-0', 'f2_reactivity'],
		['mark-0', 'f3_core'],
		['mark-0', 'f4_heatpipes'],
		['mark-0', 'context']
	],
	// Not needed until it docks, at point 5.
	[
		['power-conversion-system', 'f5_phx'],
		['power-conversion-system', 'f4_heatpipes'],
		['power-conversion-system', 'f6_brayton'],
		['power-conversion-system', 'context']
	]
];

/**
 * Quality tiers, best first; adaptive quality steps down them when frames
 * run long and back up when there's headroom. What goes first is what costs
 * most for least: depth of field, then ambient occlusion, then resolution.
 * Shadows stay: switching them off recompiles every material, a visible
 * hitch mid-move, and they only redraw when the scene changes anyway.
 */
const QUALITY = [
	{ name: 'full', dof: true, ao: true, edges: true, pixelRatio: 2 },
	{ name: 'no depth of field', dof: false, ao: true, edges: true, pixelRatio: 2 },
	{ name: 'no occlusion', dof: false, ao: false, edges: true, pixelRatio: 2 },
	{ name: '1.5×', dof: false, ao: false, edges: true, pixelRatio: 1.5 },
	{ name: '1×', dof: false, ao: false, edges: false, pixelRatio: 1 }
];
/** Step down after this long averaging slower than ~45 fps… */
const SLOW_MS = 22;
const SLOW_FOR = 1000;
/**
 * …and back up after this long running at the display's own refresh rate
 * (within 15%: a 60 Hz screen can't show faster), at most twice.
 */
const FAST_RATIO = 1.15;
const FAST_FOR = 6000;
const MAX_UPGRADES = 2;


/**
 * The turbo-alternator stand-in, on the free strip at the front of the
 * skid: the CAD loop has no turbomachinery (its horizontal vessel is a
 * shell-and-tube recuperator). Axis along +x.
 */
const TURBO = { x: 1.4, length: 2.0, y: 1.15, z: -1.75 };
/** Mark-0's groups: what stands alone before the dock, and turns on the turntable. */
const MARK0 = new Set(['f1_cradle', 'cradle', 'context', 'f2_reactivity', 'f2_drives', 'f3_core', 'f4_heatpipes']);
/** The labels on Mark-0's parts, which turn with it. */
const MARK0_ANCHORS = new Set(['shield', 'cradle', 'drum', 'motors', 'absorber', 'blocks', 'fuel', 'pipes', 'source']);
/** The docking: the exchanger and its heat pipe ends lower from this far above the deck; the skid follows. */
const DOCK = { drop: 2.4, exchanger: ['f5_phx', 'pcs_f4_heatpipes'], skid: ['f6_brayton', 'pcs_context', 'turbo', 'turboCore'] };
/** The most labels tested for visibility at once (one point's notes). */
const MAX_ANCHORS = 8;
/**
 * How far behind the nearest surface an anchor may sit and still count as
 * in view, metres (plus 1% of its distance): anchors sit on or just inside
 * their part (the drums' label inside a drum), never a whole part behind.
 */
const ANCHOR_SLACK = 0.25;
/** How far a drag tilts the camera up or down from the shot, radians (the shot's own angle clamps it further). */
const PITCH = 1.4;
/**
 * The turbo-alternator's exploded view (low-key look): how far each piece
 * slides along the shaft, metres. The housings clear the wheels they
 * enclose, and the alternator's housing and stator clear its rotor. The
 * supports (`stand`) dissolve instead, so the machine floats.
 */
const EXPLODE = {
	flange: -0.75,
	compressorCase: -0.55,
	compressorWheel: -0.1,
	bearing: 0,
	turbineWheel: 0.1,
	turbineCase: 0.35,
	alternator: 0.9,
	stand: 9
};
/** Where the notes on the turbo-alternator's parts move to when it explodes. */
const EXPLODE_ANCHORS: Record<string, number> = {
	compressor: EXPLODE.compressorWheel,
	turbine: EXPLODE.turbineWheel,
	alternator: EXPLODE.alternator
};
/**
 * The low-key look's shot of the exploded turbo-alternator (`soloTurbo`): a
 * longer lens, close, the ends running off the frame.
 */
const LOWKEY_SHOT = { pos: new THREE.Vector3(4.9, 2.3, 5.3), tgt: new THREE.Vector3(2.5, 1.12, -1.75), fov: 20 };
/** The low-key look's heat: no hue, white-hot, a touch cool at the low end. Linear RGB. */
const MONO_WARM = new THREE.Color(0.62, 0.68, 0.78);
const MONO_HOT = new THREE.Color(1, 1, 1);

/**
 * The upper shield over the exchanger, profile (radius, height) for a
 * lathe: Mark-0's shell carried up and closed, as the tall two-part
 * cylinder in the video. A stand-in: this section isn't in the CAD.
 */
const UPPER_SHIELD: [number, number][] = [
	[1.1, 2.62],
	[1.1, 5.08],
	[1.08, 5.18],
	[1.02, 5.25],
	[0.92, 5.28],
	[0, 5.28]
];
const SHIELD_JOINT: [number, number][] = [
	[1.1, 2.6],
	[1.155, 2.6],
	[1.155, 2.7],
	[1.1, 2.7]
];

/** The key light: high front right in the studio; raking from above and behind under the low-key look. */
const KEY = { studio: new THREE.Vector3(6, 9, 7), lowkey: new THREE.Vector3(7, 7, -5) };

/** The site's energy ramp (src/lib/energy, dark theme): orange to white-hot. Linear RGB. */
const WARM = new THREE.Color('#ff6a2e');
const HOT = new THREE.Color('#fff1dc');

/**
 * A surface: PBR values, plus `surface`, the procedural character the
 * shader adds in world space (the CAD has no UVs): `scale` is the noise's
 * frequency per axis, so a stretched scale makes streaks (brushing) and an
 * even one grain; `streak` and `blotch` are how far that fine noise and a
 * broad, slow one move the roughness. `sheen` is for powder coat's soft rim.
 */
type Finish = {
	color: string;
	metalness: number;
	roughness: number;
	clearcoat?: number;
	sheen?: number;
	surface?: { scale: [number, number, number]; streak: number; blotch: number };
	/** Bead-blasted: a grain of tiny facets that glint under a raking light (low-key look only). */
	sparkle?: boolean;
};
/** Brushed round the vertical vessels: fine along the height, near-constant around. */
const TURNED_Y = { scale: [1.5, 90, 1.5] as [number, number, number], streak: 0.14, blotch: 0.12 };
const POWDER = { scale: [150, 150, 150] as [number, number, number], streak: 0.18, blotch: 0.08 };
const FINISH: Record<string, Finish> = {
	steel: { color: '#c9cace', metalness: 1, roughness: 0.3, clearcoat: 0.2, surface: TURNED_Y },
	// The turbo-alternator's casing is turned about its own axis, x.
	brushed: { color: '#b4b6ba', metalness: 1, roughness: 0.38, surface: { scale: [90, 1.5, 1.5], streak: 0.14, blotch: 0.1 } },
	graphite: {
		color: '#6c6d74',
		metalness: 0.2,
		roughness: 0.55,
		surface: { scale: [24, 24, 24], streak: 0.22, blotch: 0.15 }
	},
	// The video's drums are black on white; on this dark stage black would
	// vanish, so a dark graphite grey under a clear coat, reading by the
	// softboxes it reflects.
	black: {
		color: '#5a5c62',
		metalness: 0.25,
		roughness: 0.4,
		clearcoat: 0.4,
		surface: { scale: [1.5, 60, 1.5], streak: 0.12, blotch: 0.1 }
	},
	// Satin paint on the skid's pipework and vessels.
	painted: {
		color: '#8f9296',
		metalness: 0.45,
		roughness: 0.46,
		clearcoat: 0.15,
		surface: { scale: [6, 6, 6], streak: 0.12, blotch: 0.18 }
	},
	frame: { color: '#2e2f32', metalness: 0.2, roughness: 0.62, sheen: 0.3, surface: POWDER },
	// Black powder coat: fine orange-peel grain, a soft sheen at grazing angles.
	cradle: { color: '#1f2023', metalness: 0.15, roughness: 0.6, sheen: 0.35, surface: POWDER },
	copper: { color: '#c47a3c', metalness: 1, roughness: 0.3 },
	// The turbo-alternator: satin cast housings with a fine even grain (no
	// brushing to smear on the inner walls), dark steel laminations, and
	// polished machined wheels and shaft.
	cast: {
		color: '#a3a6ab',
		metalness: 0.85,
		roughness: 0.42,
		surface: { scale: [40, 40, 40], streak: 0.14, blotch: 0.14 },
		sparkle: true
	},
	// Black anodised: the alternator's housing and stator.
	lamination: { color: '#303136', metalness: 0.65, roughness: 0.3 },
	machined: { color: '#cfd1d5', metalness: 1, roughness: 0.2 },
	lock: { color: '#e8a800', metalness: 0.3, roughness: 0.4 }
};

interface GroupSpec {
	finish: Finish;
	/** Finish for aKind 2 parts where it differs. */
	alt?: Finish;
	drums?: boolean;
	stack?: boolean;
	/** `front`: a band along `axis` at `uFront` metres; `uniform`: the whole group (the core). */
	heat?: 'front' | 'uniform';
	axis?: [number, number, number];
	/** Scales the heat glow, for groups whose many thin parts add up. */
	glow?: number;
	/** Only parts that stay solid glow: the exchanger's dome, not its shell. */
	glowInside?: boolean;
	/** Which section cut the group takes: the column's wedge, or the turbo's half-section. */
	cut?: 'column' | 'turbo';
	/** Its pieces slide apart along the turbo's shaft (aExplode). */
	explode?: boolean;
	/** It lowers into place as the power conversion system docks (uDrop, metres up). */
	drop?: boolean;
}

const GROUPS: Record<string, GroupSpec> = {
	f1_cradle: { finish: FINISH.steel, cut: 'column' },
	/** The stand-in upper half of the shield and its joint ring, over the docked exchanger. */
	upperShield: { finish: FINISH.steel, cut: 'column' },
	cradle: { finish: FINISH.cradle, alt: FINISH.lock },
	f2_reactivity: { finish: FINISH.black, drums: true },
	/** The drums' drive motors on the deck, until the exchanger docks there. */
	f2_drives: { finish: FINISH.painted },
	f3_core: { finish: FINISH.graphite, stack: true, heat: 'uniform' },
	f4_heatpipes: { finish: FINISH.steel, heat: 'front', glow: 0.45 },
	pcs_f4_heatpipes: { finish: FINISH.steel, heat: 'front', glow: 0.22, drop: true },
	f5_phx: { finish: FINISH.steel, heat: 'front', glow: 0.22, glowInside: true, cut: 'column', drop: true },
	f6_brayton: { finish: FINISH.painted },
	/** The casing: thin-walled, so its half-section opens onto the rotating parts. */
	turbo: { finish: FINISH.cast, alt: FINISH.lamination, cut: 'turbo', explode: true },
	/** Shaft, wheels and windings: never cut, as a cutaway shows the rotating parts whole; they carry the heat. */
	turboCore: { finish: FINISH.machined, alt: FINISH.copper, heat: 'front', axis: [1, 0, 0], glow: 0.55, glowInside: true, explode: true },
	context: { finish: FINISH.graphite, cut: 'column' },
	pcs_context: { finish: FINISH.frame }
};

type Uniforms = Record<string, THREE.IUniform>;
interface Group {
	mesh: THREE.Mesh;
	uniforms: Uniforms;
	ghost: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
	/** Stand-in pieces drawn with the group's materials: the upper shield, the pipe filler. */
	extras: THREE.Mesh[];
	ghostExtras: THREE.Mesh[];
}

interface Path {
	mesh: THREE.Mesh;
	uniforms: Uniforms;
	curve: THREE.CatmullRomCurve3;
}

export interface SystemSceneOptions {
	/** Phones and weak GPUs: lower pixel ratio, lighter bloom, no idle drift. */
	light?: boolean;
	/** Reduced motion: no idle drift. */
	still?: boolean;
	/**
	 * `lowkey` plays the close-ups (points 2–6) in the low-key look: slate,
	 * strip lights, each subject alone, the turbo-alternator exploded.
	 * `studio`, the default, keeps the studio throughout. Switchable live
	 * with `setLook`.
	 */
	look?: 'studio' | 'lowkey';
	onProgress?: (fraction: number) => void;
}

export class SystemScene {
	readonly state: SystemState = { ...DEFAULT_STATE };
	readonly renderer: THREE.WebGLRenderer;
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
	/** Resolves once the second stage, the column's insides, has loaded. */
	interiorReady: Promise<void> = Promise.resolve();

	private composer: EffectComposer;
	private bloom: UnrealBloomPass;
	private bloomStrength: number;
	private gtao: GTAOPass | null = null;
	private dofPass: ShaderPass | null = null;
	private edgePass: ShaderPass | null = null;
	private finishPass: ShaderPass;
	private key: THREE.DirectionalLight;
	/** The state the shadow map was last drawn for; camera moves don't redraw it. */
	private shadowKey = '';
	/**
	 * Lights that ride the heat: up the column with the front, along the gas
	 * path with its pulse, along the shaft. Always present, at
	 * zero when idle: changing the light count would recompile every shader.
	 */
	private heatLights: THREE.PointLight[] = [];
	/** The heat's colours: the brand ramp, drained to white under the low-key look. */
	private warm = WARM.clone();
	private hot = HOT.clone();
	private looks: { studio: THREE.Texture; strips: THREE.Texture };
	private backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
	/** The low-key look's weight, shared by every material (the bead-blast sparkle). */
	private lowkey = { value: 0 };
	private lowkeyOn: boolean;
	private groups = new Map<string, Group>();
	private time = { value: 0 };
	private drumAxes = Array.from({ length: 12 }, () => new THREE.Vector2());
	private gasPath!: Path;

	/** Drag offset from the point's shot, radians. */
	private orbit = { yaw: 0, pitch: 0 };
	private drag: { x: number; y: number; vx: number; vy: number; moved: number; turntable: boolean } | null = null;
	/** Mark-0's turntable, for the drag while it stands alone. */
	private turntable = new THREE.Group();
	private turn = { yaw: 0 };
	/**
	 * The labels' anchors the page has pinned (`setAnchors`), and whether each
	 * was last seen in the open or behind something (`anchorVisible`).
	 */
	private anchors: { name: string; p: [number, number, number] }[] = [];
	private anchorSeen = new Map<string, boolean>();
	private lastAnchorTest = 0;
	private anchorTarget = new THREE.WebGLRenderTarget(MAX_ANCHORS, 1);
	private anchorQuad = new FullScreenQuad(anchorShader());

	private cameraPath: { pos: THREE.CatmullRomCurve3; tgt: THREE.CatmullRomCurve3; count: number } | null = null;
	/** A slow drift on the camera, so a held frame never reads as frozen. */
	private drift: boolean;
	/** The section cuts: a wedge through the column (two planes, clipping where both do), a half-section through the turbo. */
	private cuts = {
		column: [new THREE.Plane(), new THREE.Plane()],
		turbo: [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)]
	};
	private resizeObserver: ResizeObserver;
	private last = '';
	private destroyed = false;
	/** Index into QUALITY. Read it from the console (`__system.quality`) to see where a machine settles. */
	quality = 0;
	private maxPixelRatio: number;
	private frame = { last: 0, average: 16.7, refresh: 16.7, slowSince: 0, fastSince: 0, settleUntil: 0, upgrades: 0 };

	constructor(
		private host: HTMLElement,
		private opts: SystemSceneOptions = {}
	) {
		const light = opts.light ?? false;
		this.drift = !light && !opts.still;
		this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
		this.renderer.localClippingEnabled = true;
		// Up to 2× on desktop: a little supersampling keeps thin pipes and trays steady.
		this.maxPixelRatio = light ? 1.25 : 2;
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxPixelRatio));
		// The backdrop is a screen quad drawn first, not the clear colour: the
		// composer clears its linear target with the sRGB value uncorrected,
		// which the output pass then lifts to mid grey. A quad, not
		// scene.background, so the two looks' backdrops can blend.
		this.backdrop = backdrop();
		this.scene.add(this.backdrop);
		this.lowkeyOn = opts.look === 'lowkey';
		// Neutral (Khronos PBR Neutral) keeps base colours true, so the heat
		// stays the brand's orange: filmic curves pushed it to salmon, and AgX
		// desaturates it to pink. Highlights still roll off to white.
		this.renderer.toneMapping = THREE.NeutralToneMapping;
		this.renderer.toneMappingExposure = 1.15;
		host.appendChild(this.renderer.domElement);

		// Lit by a studio of softboxes (see `studio`), and one key light for shadows.
		this.looks = { studio: studio(this.renderer), strips: strips(this.renderer) };
		this.scene.environment = this.looks.studio;
		this.scene.environmentIntensity = 1.2;
		this.key = new THREE.DirectionalLight(0xfff4ea, 1.4);
		this.key.position.copy(KEY.studio);
		this.key.target.position.set(1, 1.5, -1.5);
		this.scene.add(this.key, this.key.target);
		if (!light) {
			this.renderer.shadowMap.enabled = true;
			this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			// Drawn only when the scene changes (see `render`), not as the camera drifts.
			this.renderer.shadowMap.autoUpdate = false;
			this.key.castShadow = true;
			this.key.shadow.mapSize.set(2048, 2048);
			const c = this.key.shadow.camera;
			[c.left, c.right, c.top, c.bottom, c.near, c.far] = [-7, 7, 7, -7, 1, 30];
			this.key.shadow.bias = -0.0004;
			this.key.shadow.normalBias = 0.02;
			this.key.shadow.radius = 4;
		}
		for (let i = 0; i < 4; i++) {
			// The shaft's light stays inside the machine: short reach.
			const l = new THREE.PointLight(this.warm, 0, i === 3 ? 1.1 : 2.6, 2);
			this.heatLights.push(l);
			this.scene.add(l);
		}

		// MSAA in the composer's own target: the default framebuffer's is lost
		// to post. Its depth feeds the ambient occlusion.
		const target = new THREE.WebGLRenderTarget(1, 1, {
			type: THREE.HalfFloatType,
			samples: light ? 0 : 4,
			depthTexture: new THREE.DepthTexture(1, 1)
		});
		this.composer = new EffectComposer(this.renderer, target);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		// The labels' visibility test reads the depth straight after the scene
		// draws: the passes after it draw full-screen into the same buffers.
		this.composer.addPass(new AnchorTestPass((depth) => this.testAnchors(this.time.value, depth)));
		if (!light) {
			// Ambient occlusion from the beauty pass's own depth, so it honours
			// every cut, dissolve and moving part; its own normal pass would
			// redraw the scene with none of them. Normals come from the depth.
			this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
			this.gtao.output = GTAOPass.OUTPUT.Default;
			this.gtao.blendIntensity = 0.85;
			this.gtao.updateGtaoMaterial({
				radius: 0.35,
				distanceExponent: 1,
				thickness: 1,
				scale: 1.15,
				samples: 16,
				distanceFallOff: 1,
				screenSpaceRadius: false
			});
			this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
			this.composer.addPass(this.gtao);
		}
		// Bevel highlights on the CAD's hard edges, under the low-key look (see `edgeShader`).
		if (!light) {
			this.edgePass = new ShaderPass(edgeShader());
			this.composer.addPass(this.edgePass);
		}
		// Only the heat blooms: the material clamps reflected light below the
		// threshold (see `material`), so steel highlights never cross it.
		if (!light) {
			this.dofPass = new ShaderPass(dofShader());
			this.composer.addPass(this.dofPass);
		}
		this.bloomStrength = light ? 0.75 : 0.9;
		this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.bloomStrength, 0.55, 1.35);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
		// Grain and vignette in display space, then SMAA over everything: it
		// catches the edges post adds and, on phones, stands in for MSAA.
		this.finishPass = new ShaderPass(finishShader());
		this.composer.addPass(this.finishPass);
		this.composer.addPass(new SMAAPass());

		// No floor: the system floats on the black backdrop. The key light's
		// shadows still fall across the parts themselves.

		this.scene.add(this.turntable);
		this.addPaths();
		this.addGroup('cradle', cradleGeometry());
		const turbo = turboGeometry();
		this.addGroup('turbo', turbo.casing);
		this.addGroup('turboCore', turbo.core);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(host);
		this.resize();

		const el = this.renderer.domElement;
		el.addEventListener('pointerdown', this.onPointerDown);
		el.addEventListener('pointermove', this.onPointerMove);
		addEventListener('pointerup', this.onPointerUp);
	}

	/**
	 * Loads the first stage, reporting progress; the
	 * second stage follows in the background (`interiorReady`).
	 */
	async load() {
		const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
		await this.loadStage(loader, STAGES[0], this.opts.onProgress);
		if (this.destroyed) return;
		this.interiorReady = this.loadStage(loader, STAGES[1]).then(() => {
			if (!this.destroyed) return this.loadStage(loader, STAGES[2]);
		});
	}

	private async loadStage(loader: GLTFLoader, files: [string, string][], onProgress?: (f: number) => void) {
		const loaded = files.map(() => 0);
		const totals = files.map(() => 0);
		const gltfs = await Promise.all(
			files.map(([model, group], i) =>
				loader.loadAsync(`/models/cad/web/${model}/${group}.glb`, (e) => {
					loaded[i] = e.loaded;
					totals[i] = e.total;
					const total = totals.reduce((a, b) => a + b, 0);
					if (total && totals.every(Boolean)) onProgress?.(loaded.reduce((a, b) => a + b, 0) / total);
				})
			)
		);
		if (this.destroyed) return;
		gltfs.forEach((gltf, i) => this.addModel(gltf.scene, files[i][0]));
		this.compile();
		// Uploads and compiles stall the next frames: don't judge quality on them.
		this.frame.settleUntil = performance.now() + 2500;
	}

	// ---- Building -----------------------------------------------------------

	private addModel(root: THREE.Object3D, model: string) {
		// Mark-0 turns to meet the exchanger's heat pipes (see assembly.ts).
		root.rotation.y = turnOf(model);
		root.updateMatrixWorld(true);
		const meshes: THREE.Mesh[] = [];
		root.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
		for (const src of meshes) {
			// Both models have a `context` group, and both have heat pipes.
			const pcs = model === 'power-conversion-system';
			const name = pcs && (src.name === 'context' || src.name === 'f4_heatpipes') ? `pcs_${src.name}` : src.name;
			const ids: string[] = src.userData.parts ?? [];
			const lift = (i: number) => liftOf(model, src.name, ids[i]);
			const { geometry, parts } = bake(src, lift);
			this.deriveAttributes(name, geometry, parts);
			const group = this.addGroup(name, geometry);
			src.geometry.dispose();

			if (name === 'f1_cradle') {
				// Its own group, as it closes over the exchanger only once that's docked (`cap`).
				const lathe = (profile: [number, number][]) =>
					withFlags(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 128), 1, 0);
				this.addGroup('upperShield', mergeGeometries([lathe(UPPER_SHIELD), lathe(SHIELD_JOINT)])!);
			}
			if (name === 'f6_brayton') {
				const h = PHX_LIFT + 0.02;
				const pipe = new THREE.CylinderGeometry(FILLER.radius, FILLER.radius, h, 32, 1, true);
				pipe.translate(FILLER.x, FILLER.from + h / 2 - 0.01, FILLER.z);
				this.addExtra(group, pipe);
				// The duct from the down pipe into the turbo-alternator's inlet, a stand-in too.
				this.addExtra(group, ductGeometry());
			}
		}
		this.last = '';
	}

	/** One group: its mesh, its see-through outline, and its uniforms. Geometry is in world space. */
	private addGroup(name: string, geometry: THREE.BufferGeometry): Group {
		const spec = GROUPS[name] ?? GROUPS.context;
		const uniforms = this.uniforms(spec);
		const m = material(spec, uniforms);
		if (spec.cut) {
			m.clippingPlanes = this.cuts[spec.cut];
			m.clipIntersection = true;
		}
		const mesh = new THREE.Mesh(geometry, m);
		mesh.castShadow = mesh.receiveShadow = true;
		mesh.customDepthMaterial = depthMaterial(spec, uniforms, spec.cut ? this.cuts[spec.cut] : null);
		mesh.frustumCulled = false;
		const ghost = new THREE.Mesh(geometry, ghostMaterial());
		ghost.visible = false;
		ghost.renderOrder = 2;
		(MARK0.has(name) ? this.turntable : this.scene).add(mesh, ghost);
		const group: Group = { mesh, uniforms, ghost, extras: [], ghostExtras: [] };
		this.groups.set(name, group);
		return group;
	}

	/** A stand-in piece in world space that dissolves, glows and ghosts with `group`. */
	private addExtra(group: Group, geometry: THREE.BufferGeometry) {
		withFlags(geometry, 1, 0);
		const mesh = new THREE.Mesh(geometry, group.mesh.material);
		mesh.castShadow = mesh.receiveShadow = true;
		mesh.customDepthMaterial = group.mesh.customDepthMaterial;
		const ghost = new THREE.Mesh(geometry, group.ghost.material);
		ghost.visible = false;
		ghost.renderOrder = 2;
		(group.mesh.parent ?? this.scene).add(mesh, ghost);
		group.extras.push(mesh);
		group.ghostExtras.push(ghost);
	}

	private uniforms(spec: GroupSpec): Uniforms {
		return {
			uSolid: { value: 1 },
			uInner: { value: 1 },
			uTime: this.time,
			uDrumTurn: { value: 0 },
			uDrumAxes: { value: this.drumAxes },
			uStack: { value: 1 },
			uLayers: { value: 1 },
			uHeat: { value: 0 },
			uFront: { value: 0 },
			uAxis: { value: new THREE.Vector3(...(spec.axis ?? [0, 1, 0])) },
			uFuel: { value: 0 },
			uGlow: { value: spec.glow ?? 1 },
			uWarm: { value: this.warm },
			uHot: { value: this.hot },
			uCap: { value: 0 },
			uExplode: { value: 0 },
			uSolo: { value: 0 },
			uDrop: { value: 0 },
			uLowkey: this.lowkey,
			uAlt: { value: new THREE.Color(spec.alt?.color ?? spec.finish.color) },
			uAltMetal: { value: new THREE.Vector2(spec.alt?.metalness ?? 0, spec.alt?.roughness ?? 0) }
		};
	}

	/**
	 * Per-vertex attributes from per-part bounds. The rules mirror the
	 * auto-tagger's (scripts/auto-tag-cad.mjs): drums are the Ø0.40 m blocks
	 * on the 0.87 m circle; above 2.45 m sit the drive mechanisms.
	 */
	private deriveAttributes(name: string, g: THREE.BufferGeometry, parts: PartBounds) {
		const count = g.getAttribute('position').count;
		const part = g.getAttribute('aPart') as THREE.BufferAttribute;
		const perPart = (fn: (i: number) => number) => {
			const values = Array.from({ length: parts.count }, (_, i) => fn(i));
			const out = new Float32Array(count);
			for (let v = 0; v < count; v++) out[v] = values[part.getX(v)];
			return new THREE.BufferAttribute(out, 1);
		};
		const center = (i: number) => parts.center(i);
		const size = (i: number) => parts.size(i);
		const longest = (i: number) => Math.max(size(i).x, size(i).y, size(i).z);
		const ghost = (i: number) =>
			// The exchanger dissolves only its shell (wide parts below the dome),
			// so the dome and header stay; the core only its graphite, so the
			// fuel plugs stay lit.
			name === 'f5_phx'
				? Math.max(size(i).x, size(i).z) > 1.0 && center(i).y < DOME_FROM
					? 1
					: 0
				: name === 'f3_core'
					? longest(i) < 0.04
						? 0
						: 1
					: 1;
		let kind = (_: number) => 0;
		let drum = (_: number) => -1;
		let layer = (_: number) => -1;

		if (name === 'f2_reactivity') {
			const axes: THREE.Vector2[] = [];
			for (let i = 0; i < parts.count; i++) {
				const c = center(i);
				const s = size(i);
				// Bounding-box centres: 0.87 m out (the tagger's 0.83 m is the centre of mass,
				// pulled in by each drum's absorber sector).
				if (Math.abs(Math.hypot(c.x, c.z) - 0.87) < 0.02 && Math.abs(Math.max(s.x, s.z) - 0.4) < 0.02)
					if (!axes.some((a) => a.distanceTo(new THREE.Vector2(c.x, c.z)) < 0.05)) axes.push(new THREE.Vector2(c.x, c.z));
			}
			axes.slice(0, 12).forEach((a, i) => this.drumAxes[i].copy(a));
			drum = (i) => {
				const c = center(i);
				if (c.y > 2.45) return -1;
				let best = -1;
				let d = 0.21;
				axes.forEach((a, k) => {
					const dist = Math.hypot(a.x - c.x, a.y - c.z);
					if (dist < d) [best, d] = [k, dist];
				});
				return best;
			};
		}

		if (name === 'f3_core') {
			// Layers: the distinct heights of the graphite blocks; plugs and
			// pins join the nearest.
			const levels: number[] = [];
			for (let i = 0; i < parts.count; i++) {
				if (size(i).x < 0.15) continue;
				const y = center(i).y;
				if (!levels.some((l) => Math.abs(l - y) < 0.05)) levels.push(y);
			}
			levels.sort((a, b) => a - b);
			layer = (i) => {
				const y = center(i).y;
				let best = 0;
				levels.forEach((l, k) => Math.abs(l - y) < Math.abs(levels[best] - y) && (best = k));
				return best;
			};
			kind = (i) => (longest(i) < 0.04 ? 1 : 0);
			g.userData.layers = levels.length;
		}
		g.setAttribute('aGhost', perPart(ghost));
		g.setAttribute('aKind', perPart(kind));
		if (name === 'f2_reactivity') g.setAttribute('aDrum', perPart(drum));
		if (name === 'f3_core') g.setAttribute('aLayer', perPart(layer));
		g.deleteAttribute('aPart');
	}

	/**
	 * The energy path, a tube that only shows where something runs
	 * through them: the hot gas from the dome's outlet, down the outlet pipe
	 * and into the turbo-alternator (wrapping the pipe, as the band on the
	 * black pipe in the video).
	 */
	private addPaths() {
		const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
		this.gasPath = this.path(
			[
				v(0.45, 4.42, 0),
				v(0.46, 4.86, -0.04),
				v(0.5, 5.03, -0.34),
				v(0.52, 5.03, -0.95),
				v(0.56, 4.86, -1.24),
				v(0.56, 4.4, -1.27),
				v(0.56, 2.5, -1.27),
				v(0.6, 1.36, -1.36),
				v(0.92, 1.18, -1.68),
				v(TURBO.x - 0.04, TURBO.y, TURBO.z)
			],
			// Just outside the pipe and duct walls (0.11, 0.1), so the glow wraps them.
			0.118
		);
	}

	private path(points: THREE.Vector3[], radius: number): Path {
		const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
		const uniforms: Uniforms = {
			uAmount: { value: 0 },
			uFront: { value: 0 },
			uWarm: { value: this.warm },
			uHot: { value: this.hot },
			uLowkey: this.lowkey
		};
		const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, radius, 16), pathMaterial(uniforms));
		mesh.visible = false;
		mesh.renderOrder = 3;
		this.scene.add(mesh);
		return { mesh, uniforms, curve };
	}


	/** Compiles every shader up front, so nothing stalls the first time a group appears. */
	private compile() {
		const hidden: THREE.Object3D[] = [];
		this.scene.traverse((o) => {
			if (!o.visible) {
				hidden.push(o);
				o.visible = true;
			}
		});
		this.renderer.compile(this.scene, this.camera);
		for (const o of hidden) o.visible = false;
	}

	// ---- Frame --------------------------------------------------------------

	/** Applies `state` and draws. Skips the frame when nothing moved and nothing glows. */
	render(time: number) {
		this.watchFrames();
		const s = this.state;
		const glowing = s.coreHeat + s.heat + s.gas + s.turboHeat + s.fuel > 0;
		// Only the state's own fields: GSAP adds a `_gsap` cache to what it tweens.
		const o = this.orbit;
		const key = `${STATE_KEYS.map((k) => s[k]).join(',')},${o.yaw},${o.pitch},${this.turn.yaw},${this.lowkeyOn}`;
		if (key === this.last && !glowing && !this.drift) return;
		this.last = key;
		this.time.value = time;

		this.camera.fov = s.fov;
		const path = this.cameraPath;
		const target = new THREE.Vector3(s.tgtX, s.tgtY, s.tgtZ);
		this.camera.position.set(s.camX, s.camY, s.camZ);
		if (path && s.cam >= 0) {
			const u = THREE.MathUtils.clamp(s.cam / Math.max(path.count - 1, 1), 0, 1);
			path.pos.getPoint(u, this.camera.position);
			path.tgt.getPoint(u, target);
		}
		// Under the look, the turbo-alternator's own shot takes over as it comes in.
		const look = this.lowkeyOn ? 1 : 0;
		const k = s.lowkey * look;
		const solo = s.soloTurbo * look;
		if (solo > 0) {
			const ease = solo * solo * (3 - 2 * solo);
			this.camera.position.lerp(LOWKEY_SHOT.pos, ease);
			target.lerp(LOWKEY_SHOT.tgt, ease);
			this.camera.fov = THREE.MathUtils.lerp(s.fov, LOWKEY_SHOT.fov, ease);
		}
		// Narrow frames pull back so the model still fits.
		const pull = Math.max(1, 1.25 / this.camera.aspect);
		if (pull > 1) this.camera.position.sub(target).multiplyScalar(pull).add(target);
		// The visitor's drag, as a turn about the target on top of the shot.
		if (o.yaw || o.pitch) {
			const offset = this.camera.position.clone().sub(target);
			const spherical = new THREE.Spherical().setFromVector3(offset);
			spherical.theta += o.yaw;
			// From nearly overhead to a little below the floor's level; a drag
			// past either end goes no further, so it never has to be undone.
			const phi = THREE.MathUtils.clamp(spherical.phi - o.pitch, 0.08, Math.PI / 2 + 0.35);
			if (this.drag) o.pitch = spherical.phi - phi;
			spherical.phi = phi;
			this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
		}
		if (this.drift) {
			// Slow, incommensurate sways: about 1% of the distance to the subject.
			const d = this.camera.position.distanceTo(target) * 0.012;
			this.camera.position.x += Math.sin(time * 0.23) * d;
			this.camera.position.y += Math.sin(time * 0.31 + 1.3) * d * 0.6;
			this.camera.position.z += Math.cos(time * 0.19) * d;
		}
		this.camera.lookAt(target);
		this.updateCuts();
		const { clientWidth: w, clientHeight: h } = this.host;
		if (s.shift || s.shiftY) this.camera.setViewOffset(w, h, -s.shift * w, s.shiftY * h, w, h);
		else this.camera.clearViewOffset();
		this.camera.updateProjectionMatrix();

		this.applyLook(k);
		this.turntable.rotation.y = this.turn.yaw;
		// The dock: the drives clear off first, the exchanger lowers through the
		// first 70% (fading in high up, where the eye isn't yet), the skid follows.
		const dock = s.dock;
		const drivesIn = 1 - THREE.MathUtils.smoothstep(dock, 0, 0.3);
		const exchangerIn = THREE.MathUtils.smoothstep(dock, 0, 0.25);
		const landing = THREE.MathUtils.clamp(dock / 0.7, 0, 1);
		const drop = DOCK.drop * Math.pow(1 - landing, 3);
		const skidIn = THREE.MathUtils.smoothstep(dock, 0.55, 1);
		const heat = { uHeat: s.heat, uFront: s.heatY };
		const columnCap = { uCap: s.cut > 0.001 ? 1 : 0 };
		this.setGroup('f1_cradle', s.shield, s.shieldGhost, columnCap);
		this.setGroup('upperShield', s.shield * s.cap, s.shieldGhost * s.cap, columnCap);
		this.setGroup('cradle', s.world, 0);
		this.setGroup('context', s.refl, s.reflGhost, columnCap);
		this.setGroup('f2_reactivity', s.drums, s.drumsGhost, { uDrumTurn: s.drumTurn });
		this.setGroup('f2_drives', s.drums * drivesIn, s.drumsGhost * drivesIn);
		this.setGroup('f3_core', s.core, s.coreGhost, { uStack: s.stack, uHeat: s.coreHeat, uFuel: s.fuel });
		this.setGroup('f4_heatpipes', s.pipes, s.pipesGhost, heat);
		this.setGroup('pcs_f4_heatpipes', s.pipes, s.pipesGhost, { ...heat, uDrop: drop });
		this.setGroup('f5_phx', s.phxShell, s.phxGhost, { ...heat, ...columnCap, uInner: s.phxInner, uDrop: drop });
		this.setGroup('f6_brayton', s.world, 0);
		this.setGroup('pcs_context', s.world, 0);
		// Alone, the turbo-alternator explodes rather than opening in section.
		const explode = s.turboExplode * solo;
		this.setGroup('turbo', s.turbo * s.world, s.turboGhost, {
			uCap: s.turboCut * (1 - solo) > 0.001 ? 1 : 0,
			uExplode: explode,
			uSolo: solo
		});
		this.setGroup('turboCore', s.world, 0, {
			uHeat: s.turboHeat,
			uFront: TURBO.x - 0.1 + (TURBO.length + 0.2) * s.turboFront,
			uExplode: explode,
			uSolo: solo
		});
		// Under the look, what isn't the subject leaves the stage: everything
		// but the turbo-alternator for its shot, the cradle and skid for the column's.
		const away = (name: string, by: number) => {
			const g = this.groups.get(name);
			if (!g || by <= 0) return;
			g.uniforms.uSolid.value *= 1 - by;
			g.uniforms.uInner.value *= 1 - by;
			g.mesh.visible &&= by < 0.999;
			for (const m of g.extras) m.visible &&= by < 0.999;
		};
		const column = s.soloColumn * look;
		for (const name of this.groups.keys()) {
			if (!name.startsWith('turbo')) away(name, solo);
			if (['cradle', 'f6_brayton', 'pcs_context', 'turbo', 'turboCore'].includes(name)) away(name, column);
		}
		// Before the dock, the power conversion system isn't there.
		for (const name of DOCK.exchanger) away(name, 1 - exchangerIn);
		for (const name of DOCK.skid) away(name, 1 - skidIn);

		// Gone by the solo's midpoint, or its head would flare white at the inlet.
		this.setPath(this.gasPath, s.gas * skidIn * Math.max(0, 1 - 2 * Math.max(solo, column)), s.gasFront);
		this.placeHeatLights();

		// The shadow map follows the scene, not the camera.
		const shadowKey =
			STATE_KEYS.filter((k) => !k.startsWith('cam') && !k.startsWith('tgt') && k !== 'fov')
				.map((k) => s[k])
				.join(',') + this.lowkeyOn + this.turn.yaw.toFixed(3);
		if (shadowKey !== this.shadowKey) {
			this.shadowKey = shadowKey;
			this.renderer.shadowMap.needsUpdate = true;
		}
		// The composer swaps buffers each frame: point the occlusion and depth of
		// field at the depth of whichever one the beauty pass is about to draw into.
		const depth = this.composer.readBuffer.depthTexture!;
		this.gtao?.setGBuffer(depth);
		if (this.dofPass) {
			const u = this.dofPass.uniforms;
			this.dofPass.enabled = s.dof > 0.01 && QUALITY[this.quality].dof;
			u.tDepth.value = depth;
			u.uFocus.value = this.camera.position.distanceTo(target);
			u.uStrength.value = s.dof;
			u.cameraNear.value = this.camera.near;
			u.cameraFar.value = this.camera.far;
		}
		if (this.edgePass) {
			const u = this.edgePass.uniforms;
			const k = this.lowkeyOn ? s.lowkey : 0;
			this.edgePass.enabled = k > 0.01 && QUALITY[this.quality].edges;
			u.tDepth.value = depth;
			u.uStrength.value = k;
			u.uProjectionInverse.value.copy(this.camera.projectionMatrixInverse);
			// The lights the bevels catch, in view space: the key and the two strips that light edges.
			const view = this.camera.matrixWorldInverse;
			u.uKey.value.copy(this.key.position).sub(this.key.target.position).normalize().transformDirection(view);
			u.uStrips.value[0].copy(STRIP_LIGHTS[0]).transformDirection(view);
			u.uStrips.value[1].copy(STRIP_LIGHTS[1]).transformDirection(view);
		}
		this.finishPass.uniforms.uTime.value = this.opts.still ? 0 : time;

		this.composer.render();
	}

	/**
	 * Aims the column's wedge at the camera and opens it by `state.cut`; slides
	 * the turbo's half-section plane in to the shaft by `state.turboCut`.
	 * A wedge of half-angle a about azimuth t: two planes through the axis,
	 * each with the wedge on its negative side; with clipIntersection only
	 * the wedge, where both are negative, is cut. At a = 0 nothing is.
	 */
	private updateCuts() {
		const s = this.state;
		const t = Math.atan2(this.camera.position.z, this.camera.position.x);
		const a = THREE.MathUtils.degToRad(55) * s.cut;
		const [p1, p2] = this.cuts.column;
		p1.set(new THREE.Vector3(-Math.sin(t + a), 0, Math.cos(t + a)), 0);
		p2.set(new THREE.Vector3(Math.sin(t - a), 0, -Math.cos(t - a)), 0);
		const solo = this.lowkeyOn ? s.soloTurbo : 0;
		this.cuts.turbo[0].constant = TURBO.z + (1 - s.turboCut * (1 - solo)) * 0.6;
	}

	/**
	 * Blends the studio into the low-key look by `k`: the backdrop to slate,
	 * the softboxes to strip lights (swapped at the midpoint, under a dip,
	 * as if the studio lights go down and the strips come up), the key light
	 * round to rake from above and behind, the heat to white.
	 */
	private applyLook(k: number) {
		this.lowkey.value = k;
		this.backdrop.material.uniforms.uMix.value = k;
		this.scene.environment = k < 0.5 ? this.looks.studio : this.looks.strips;
		this.scene.environmentIntensity = THREE.MathUtils.lerp(1.2, 1.1, k) * (0.25 + 0.75 * Math.abs(1 - 2 * k));
		this.key.position.lerpVectors(KEY.studio, KEY.lowkey, k);
		this.key.intensity = THREE.MathUtils.lerp(1.4, 2.4, k);
		this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.15, 1.0, k);
		this.finishPass.uniforms.uVignette.value = THREE.MathUtils.lerp(0.22, 0.5, k);
		// White heat haloes into milk where orange read as glow: half the bloom.
		this.bloom.strength = this.bloomStrength * (1 - 0.5 * k);
		this.warm.lerpColors(WARM, MONO_WARM, k);
		this.hot.lerpColors(HOT, MONO_HOT, k);
	}

	/** Switches the look live, for comparing the two on the close-ups. */
	setLook(look: 'studio' | 'lowkey') {
		this.lowkeyOn = look === 'lowkey';
		this.last = '';
	}

	/** Puts each heat light where its heat is, as bright as it is. */
	private placeHeatLights() {
		const s = this.state;
		const [column, core, gas, shaft] = this.heatLights;
		// Dimmer under the low-key look, as the glow is (see `material`).
		const strength = 9 * (1 - 0.6 * this.lowkey.value);
		column.position.set(0, s.heatY, 0);
		column.intensity = strength * s.heat;
		core.position.set(0, 1.35, 0);
		core.intensity = strength * 0.6 * s.coreHeat;
		this.gasPath.curve.getPoint(THREE.MathUtils.clamp(s.gasFront, 0, 1), gas.position);
		// The gas pulse leaves with the rest of the stage when a subject stands alone.
		const offStage = Math.max(0, 1 - 2 * (this.lowkeyOn ? Math.max(s.soloTurbo, s.soloColumn) : 0));
		gas.intensity = strength * s.gas * offStage * (s.gasFront > 0 && s.gasFront < 1 ? 1 : 0.3);
		shaft.position.set(TURBO.x - 0.1 + (TURBO.length + 0.2) * s.turboFront, TURBO.y, TURBO.z + 0.15);
		for (const l of this.heatLights) l.color.copy(this.warm);
		shaft.intensity = strength * 0.22 * s.turboHeat * s.world;
	}

	private setPath(path: Path, amount: number, front: number) {
		path.mesh.visible = amount > 0.001;
		path.uniforms.uAmount.value = amount;
		path.uniforms.uFront.value = front;
	}

	private setGroup(name: string, solid: number, ghost: number, extra: Record<string, number> = {}) {
		const g = this.groups.get(name);
		if (!g) return;
		g.uniforms.uSolid.value = solid;
		for (const [k, v] of Object.entries(extra)) g.uniforms[k].value = v;
		if (name === 'f3_core') g.uniforms.uLayers.value = g.mesh.geometry.userData.layers ?? 1;
		// Groups whose insides stay while their outside dissolves keep drawing.
		const inside = name === 'f5_phx' || name === 'f3_core';
		g.mesh.visible = solid > 0.001 || inside;
		g.ghost.visible = ghost > 0.001;
		g.ghost.material.uniforms.uOpacity.value = ghost;
		for (const m of g.extras) m.visible = solid > 0.001;
		for (const m of g.ghostExtras) m.visible = ghost > 0.001;
	}

	/**
	 * The camera's route: smooth curves through every shot's position and
	 * look-at target, in order. `state.cam` then moves along it, so the
	 * camera arcs between shots instead of cutting straight through, and
	 * never stops dead except where a shot holds.
	 */
	setCameraPath(keys: { pos: [number, number, number]; tgt: [number, number, number] }[]) {
		const curve = (points: [number, number, number][]) =>
			new THREE.CatmullRomCurve3(
				points.map((p) => new THREE.Vector3(...p)),
				false,
				'centripetal'
			);
		this.cameraPath = { pos: curve(keys.map((k) => k.pos)), tgt: curve(keys.map((k) => k.tgt)), count: keys.length };
		this.last = '';
	}

	// ---- Interaction ----------------------------------------------------------

	/** Eases a drag back to the point's shot; the page calls it as the visitor moves to another point. */
	settle() {
		if (this.drag) return;
		this.settleTurn(1.2, 'power3.inOut');
		if (!this.orbit.yaw && !this.orbit.pitch) return;
		// The short way back: however many turns the drag made, at most half of one.
		this.orbit.yaw = THREE.MathUtils.euclideanModulo(this.orbit.yaw + Math.PI, Math.PI * 2) - Math.PI;
		gsap.to(this.orbit, { yaw: 0, pitch: 0, duration: 1.2, ease: 'power3.inOut', overwrite: true });
	}

	/** Turns Mark-0's turntable back to rest, the short way round, and levels the camera. */
	private settleTurn(duration: number, ease: string) {
		this.turn.yaw = THREE.MathUtils.euclideanModulo(this.turn.yaw + Math.PI, Math.PI * 2) - Math.PI;
		gsap.to(this.turn, { yaw: 0, duration, ease, overwrite: true });
		if (this.orbit.pitch) gsap.to(this.orbit, { pitch: 0, duration, ease, overwrite: 'auto' });
	}

	/**
	 * Screen position (CSS pixels, canvas-relative) of a world point, or null
	 * behind the camera. Pass the anchor's `name` to follow the part it's on
	 * when the turbo-alternator explodes.
	 */
	project(p: [number, number, number], name?: string): { x: number; y: number } | null {
		const v = this.anchorAt(p, name).project(this.camera);
		if (v.z > 1) return null;
		const { clientWidth: w, clientHeight: h } = this.host;
		return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
	}

	/** Where an anchor is now: on its part as the turbo explodes, or as Mark-0 turns. */
	private anchorAt(p: [number, number, number], name?: string) {
		const v = new THREE.Vector3(...p);
		const s = this.state;
		if (name && name in EXPLODE_ANCHORS && this.lowkeyOn) v.x += EXPLODE_ANCHORS[name] * s.turboExplode * s.soloTurbo;
		// Mark-0's labels turn with it on its turntable.
		if (name && MARK0_ANCHORS.has(name) && this.turn.yaw) v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.turn.yaw);
		return v;
	}

	/** The labels to keep testing for visibility: the active point's. */
	setAnchors(anchors: { name: string; p: [number, number, number] }[]) {
		this.anchors = anchors.slice(0, MAX_ANCHORS);
		this.anchorSeen.clear();
		this.lastAnchorTest = 0;
	}

	/** Whether the anchor was last seen in the open: false once its part turns away or something passes in front. */
	anchorVisible(name: string) {
		return this.anchorSeen.get(name) ?? true;
	}

	/**
	 * Tests each anchor against the last frame's depth, at most ten times a
	 * second: one tiny pass writes, per anchor, whether the nearest surface
	 * on screen there is in front of it by more than the slack, and a
	 * one-row readback brings the answers back.
	 */
	private testAnchors(now: number, depth: THREE.DepthTexture | null) {
		if (!this.anchors.length || !depth || now - this.lastAnchorTest < 0.1) return;
		this.lastAnchorTest = now;
		const u = (this.anchorQuad.material as THREE.ShaderMaterial).uniforms;
		const view = new THREE.Vector3();
		this.anchors.forEach(({ name, p }, i) => {
			const world = this.anchorAt(p, name);
			view.copy(world).applyMatrix4(this.camera.matrixWorldInverse);
			const ndc = world.project(this.camera);
			u.uUv.value[i].set((ndc.x + 1) / 2, (ndc.y + 1) / 2);
			// Behind the camera or off screen: tested as hidden.
			const on = view.z < 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
			u.uDistance.value[i] = on ? -view.z : -1;
		});
		u.uCount.value = this.anchors.length;
		u.tDepth.value = depth;
		u.cameraNear.value = this.camera.near;
		u.cameraFar.value = this.camera.far;
		this.renderer.setRenderTarget(this.anchorTarget);
		this.anchorQuad.render(this.renderer);
		const px = new Uint8Array(MAX_ANCHORS * 4);
		this.renderer.readRenderTargetPixels(this.anchorTarget, 0, 0, MAX_ANCHORS, 1, px);
		this.renderer.setRenderTarget(null);
		this.anchors.forEach(({ name }, i) => this.anchorSeen.set(name, px[i * 4] > 127));
	}

	// Touch drags are the page's (a swipe steps); only mouse and pen look around.
	private onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 || e.pointerType === 'touch') return;
		gsap.killTweensOf([this.orbit, this.turn]);
		// Mark-0 alone turns on its turntable; the docked system, the camera.
		this.drag = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, moved: 0, turntable: this.state.dock < 0.5 };
		this.renderer.domElement.setPointerCapture(e.pointerId);
		this.host.dataset.dragging = '';
	};

	private onPointerMove = (e: PointerEvent) => {
		const d = this.drag;
		if (!d) return;
		const dx = e.clientX - d.x;
		const dy = e.clientY - d.y;
		d.x = e.clientX;
		d.y = e.clientY;
		d.vx = dx;
		d.vy = dy;
		d.moved += Math.abs(dx) + Math.abs(dy);
		if (d.turntable) {
			// As on the homepage: one drag across the canvas is one full turn of
			// the model, and it holds still under the cursor. Up and down tilts
			// the camera rather than the reactor, which stands on the floor.
			const el = this.renderer.domElement;
			this.turn.yaw += (dx / el.clientWidth) * Math.PI * 2;
			this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + (dy / el.clientHeight) * Math.PI * 0.5, -0.6, 0.6);
			return;
		}
		// All the way round, as in the CAD viewer; up and down as far as the shot allows (see `render`).
		this.orbit.yaw -= dx * 0.006;
		this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * 0.004, -PITCH, PITCH);
	};

	private onPointerUp = () => {
		const d = this.drag;
		if (!d) return;
		this.drag = null;
		delete this.host.dataset.dragging;
		// A click, not a drag: nothing to settle.
		if (d.moved < 4) return;
		if (d.turntable) {
			// Let go, it eases back to the shot as the homepage's model does.
			this.settleTurn(1.6, 'power2.out');
			return;
		}
		// Coast on the release velocity and stay there, until the next point (`settle`).
		gsap.to(this.orbit, {
			yaw: this.orbit.yaw - d.vx * 0.04,
			pitch: THREE.MathUtils.clamp(this.orbit.pitch + d.vy * 0.03, -PITCH, PITCH),
			duration: 0.9,
			ease: 'power3.out'
		});
	};

	/**
	 * Adaptive quality: a smoothed frame interval, stepping down a tier after
	 * a second of slow frames and back up, cautiously, after six seconds of
	 * headroom. Frames that don't reflect steady rendering are ignored: a
	 * hidden tab, the settling time after a load or a tier change (shader
	 * compiles, resized targets), and one-off hitches.
	 */
	private watchFrames() {
		const now = performance.now();
		const f = this.frame;
		const dt = now - f.last;
		f.last = now;
		if (document.hidden || dt > 250 || now < f.settleUntil) {
			f.slowSince = f.fastSince = 0;
			return;
		}
		f.average += (dt - f.average) * 0.08;
		// The display's frame interval: the shortest steady one seen (up to 144 Hz).
		f.refresh = Math.min(f.refresh, Math.max(f.average, 6.9));
		f.slowSince = f.average > SLOW_MS ? f.slowSince || now : 0;
		f.fastSince = f.average < f.refresh * FAST_RATIO ? f.fastSince || now : 0;
		if (f.slowSince && now - f.slowSince > SLOW_FOR && this.quality < QUALITY.length - 1) {
			this.setQuality(this.quality + 1);
		} else if (f.fastSince && now - f.fastSince > FAST_FOR && this.quality > 0 && f.upgrades < MAX_UPGRADES) {
			f.upgrades++;
			this.setQuality(this.quality - 1);
		}
	}

	/** Moves to a quality tier (also for testing: `__system.setQuality(3)`). */
	setQuality(tier: number) {
		this.quality = THREE.MathUtils.clamp(tier, 0, QUALITY.length - 1);
		const q = QUALITY[this.quality];
		if (this.gtao) this.gtao.enabled = q.ao;
		this.last = '';
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxPixelRatio, q.pixelRatio));
		this.resize();
		const f = this.frame;
		f.settleUntil = performance.now() + 1500;
		f.slowSince = f.fastSince = 0;
		f.average = 16.7;
		if (import.meta.env.DEV) console.info(`[systems] quality: ${q.name}`);
	}

	private resize() {
		const { clientWidth: w, clientHeight: h } = this.host;
		if (!w || !h) return;
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h);
		this.composer.setPixelRatio(this.renderer.getPixelRatio());
		// Occlusion at half resolution: soft by nature, a quarter of the cost.
		const pr = this.renderer.getPixelRatio();
		if (this.dofPass) {
			this.dofPass.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
			this.dofPass.uniforms.uPixelRatio.value = pr;
		}
		if (this.edgePass) {
			this.edgePass.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
			this.edgePass.uniforms.uPixelRatio.value = pr;
		}
		this.gtao?.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.last = '';
	}

	destroy() {
		this.destroyed = true;
		this.resizeObserver.disconnect();
		const el = this.renderer.domElement;
		el.removeEventListener('pointerdown', this.onPointerDown);
		el.removeEventListener('pointermove', this.onPointerMove);
		removeEventListener('pointerup', this.onPointerUp);
		gsap.killTweensOf(this.orbit);
		this.anchorTarget.dispose();
		this.anchorQuad.dispose();
		this.gtao?.dispose();
		this.scene.traverse((o) => {
			const m = o as THREE.Mesh;
			if (!m.isMesh) return;
			m.geometry.dispose();
			for (const mat of [m.material].flat()) mat.dispose();
		});
		this.scene.environment?.dispose();
		this.composer.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}

/**
 * The lighting environment: a dark studio of softboxes, baked once into an
 * environment map. Two tall strips either side give the cylinders the long
 * vertical highlight bands of the product video, a wide box overhead lights
 * the tops, a low strip behind rims the silhouettes, a broad dim fill in
 * front and a faint floor bounce lift the rest. Values are linear radiance.
 */
function studio(renderer: THREE.WebGLRenderer) {
	const env = new THREE.Scene();
	// Not black: polished steel reflects its surroundings, and a black studio
	// would leave it black between the softboxes.
	env.background = new THREE.Color(0.04, 0.04, 0.045);
	const box = (w: number, h: number, radiance: number, at: [number, number, number], tint = [1, 1, 1]) => {
		const m = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ color: new THREE.Color(...tint).multiplyScalar(radiance), side: THREE.DoubleSide })
		);
		m.position.set(...at);
		m.lookAt(0, 2, 0);
		env.add(m);
	};
	box(1.4, 9, 7, [-7, 3.5, 4]);
	box(1.0, 9, 5, [7.5, 3.5, -1]);
	box(9, 4, 3.2, [0, 11, 0]);
	box(12, 1.6, 2.2, [0, 3, -10], [0.85, 0.92, 1]);
	box(30, 30, 0.05, [0, -8, 0]);
	// A broad, dim fill in front, so the steel reads as steel from the front too.
	box(16, 7, 0.45, [2, 3, 12]);
	const pmrem = new THREE.PMREMGenerator(renderer);
	const texture = pmrem.fromScene(env, 0.03).texture;
	pmrem.dispose();
	env.traverse((o) => {
		const m = o as THREE.Mesh;
		if (m.isMesh) {
			m.geometry.dispose();
			(m.material as THREE.Material).dispose();
		}
	});
	return texture;
}

/** A radial gradient with fine noise (so it never bands), as a texture. */
function gradient(centre: [number, number], stops: [number, string][]) {
	const size = 512;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const [cx, cy] = [size * centre[0], size * centre[1]];
	const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.8);
	for (const [at, colour] of stops) g.addColorStop(at, colour);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const pixels = ctx.getImageData(0, 0, size, size);
	for (let i = 0; i < pixels.data.length; i += 4) {
		const n = (Math.random() - 0.5) * 3;
		pixels.data[i] += n;
		pixels.data[i + 1] += n;
		pixels.data[i + 2] += n;
	}
	ctx.putImageData(pixels, 0, 0);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/**
 * The backdrop, drawn in screen space behind everything. The studio's is
 * black: the faintest lift behind the subject, falling off to grey-950 (the
 * page's near-black) at the edges, where the page shows round the canvas;
 * the low-key look's is slate, after the cast-housing reference, lightest
 * up to the right. `uMix` blends them. Values are set for Neutral tone
 * mapping, which crushes the darks and pulls them apart in hue: #232323
 * lands on about #080808, #2e2e2f on #111; #46484e on about #2c2e34.
 */
function backdrop() {
	const studio = gradient([0.5, 0.45], [
		[0, '#2e2e2f'],
		[0.55, '#272727'],
		[1, '#232323']
	]);
	const slate = gradient([0.75, 0.3], [
		[0, '#4d5056'],
		[0.55, '#46484e'],
		[1, '#3d3f44']
	]);
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(2, 2),
		new THREE.ShaderMaterial({
			uniforms: { tStudio: { value: studio }, tSlate: { value: slate }, uMix: { value: 0 } },
			vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 1.0, 1.0);
}`,
			fragmentShader: /* glsl */ `
uniform sampler2D tStudio;
uniform sampler2D tSlate;
uniform float uMix;
varying vec2 vUv;
void main() {
	gl_FragColor = vec4(mix(texture2D(tStudio, vUv).rgb, texture2D(tSlate, vUv).rgb, uMix), 1.0);
}`,
			depthTest: false,
			depthWrite: false
		})
	);
	mesh.frustumCulled = false;
	mesh.renderOrder = -100;
	return mesh;
}

/**
 * The low-key look's lighting: a black room with three long, thin strip
 * lights, as product photographers rake hardware. One runs along the
 * shaft's axis above and in front, so every turned part carries a crisp
 * line of light along its length; one stands upright to the right, for the
 * flange faces and rings; one rims from behind. A faint fill below keeps
 * the shadow side from going to pure black.
 */
/** Where the low-key look's two front strips hang, and the directions to them (for the edge pass). */
const STRIP_AT: [number, number, number][] = [
	[0, 6, 5],
	[9, 1, 2]
];
const STRIP_LIGHTS = STRIP_AT.map((p) => new THREE.Vector3(...p).normalize());

function strips(renderer: THREE.WebGLRenderer) {
	const env = new THREE.Scene();
	env.background = new THREE.Color(0.004, 0.0042, 0.005);
	const strip = (w: number, h: number, radiance: number, at: [number, number, number]) => {
		const m = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ color: new THREE.Color(0.96, 0.98, 1).multiplyScalar(radiance), side: THREE.DoubleSide })
		);
		m.position.set(...at);
		m.lookAt(0, 0, 0);
		env.add(m);
	};
	strip(16, 0.55, 10, STRIP_AT[0]);
	strip(0.6, 12, 7, STRIP_AT[1]);
	strip(16, 0.4, 6, [0, 5, -8]);
	strip(12, 3, 0.12, [0, -4, 8]);
	const pmrem = new THREE.PMREMGenerator(renderer);
	const texture = pmrem.fromScene(env, 0.015).texture;
	pmrem.dispose();
	env.traverse((o) => {
		const m = o as THREE.Mesh;
		if (m.isMesh) {
			m.geometry.dispose();
			(m.material as THREE.Material).dispose();
		}
	});
	return texture;
}

// ---- Geometry -----------------------------------------------------------------

interface PartBounds {
	count: number;
	center(i: number): THREE.Vector3;
	size(i: number): THREE.Vector3;
}

/**
 * Copies a group mesh's geometry into world space as plain floats (the
 * file's are quantized, scaled by the node), raising parts by `lift`, and
 * measures every part.
 */
function bake(src: THREE.Mesh, lift: (part: number) => number): { geometry: THREE.BufferGeometry; parts: PartBounds } {
	const g = src.geometry;
	const pos = g.getAttribute('position');
	const nor = g.getAttribute('normal');
	const part = g.getAttribute('_part');
	const count = pos.count;
	const matrix = src.matrixWorld;
	const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
	const P = new Float32Array(count * 3);
	const N = new Float32Array(count * 3);
	const A = new Uint16Array(count);
	let n = 1;
	if (part) for (let i = 0; i < count; i++) n = Math.max(n, part.getX(i) + 1);
	const min = new Float32Array(n * 3).fill(Infinity);
	const max = new Float32Array(n * 3).fill(-Infinity);
	const v = new THREE.Vector3();
	const lifts = Array.from({ length: n }, (_, i) => lift(i));
	for (let i = 0; i < count; i++) {
		const p = part ? part.getX(i) : 0;
		v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
		v.y += lifts[p];
		v.toArray(P, i * 3);
		A[i] = p;
		for (let k = 0; k < 3; k++) {
			const c = P[i * 3 + k];
			if (c < min[p * 3 + k]) min[p * 3 + k] = c;
			if (c > max[p * 3 + k]) max[p * 3 + k] = c;
		}
		v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
		v.toArray(N, i * 3);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
	geometry.setAttribute('aPart', new THREE.BufferAttribute(A, 1));
	geometry.setIndex(g.index);
	const at = (arr: Float32Array, i: number) => new THREE.Vector3(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
	return {
		geometry,
		parts: {
			count: n,
			center: (i) => at(min, i).add(at(max, i)).multiplyScalar(0.5),
			size: (i) => at(max, i).sub(at(min, i))
		}
	};
}

/** Sets the per-vertex ghost and kind flags on a stand-in piece. */
/**
 * Sets a stand-in piece's per-vertex flags. `explode` is how far it slides
 * along the turbo's shaft in the exploded view, metres; EXPLODE.stand marks
 * a support that dissolves instead.
 */
function withFlags(g: THREE.BufferGeometry, ghost: number, kind: number, explode = 0) {
	const count = g.getAttribute('position').count;
	g.setAttribute('aGhost', new THREE.BufferAttribute(new Float32Array(count).fill(ghost), 1));
	g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(count).fill(kind), 1));
	g.setAttribute('aExplode', new THREE.BufferAttribute(new Float32Array(count).fill(explode), 1));
	// Merging needs matching attributes: lathes and boxes carry UVs, the rest not.
	g.deleteAttribute('uv');
	return g.index ? g.toNonIndexed() : g;
}

/** A lathe turned about +x (lathe profiles are [radius, distance along the axis]). */
function turned(profile: [number, number][], segments = 64) {
	const g = new THREE.LatheGeometry(
		profile.map(([r, t]) => new THREE.Vector2(r, t)),
		segments
	);
	g.rotateZ(-Math.PI / 2);
	g.translate(TURBO.x, TURBO.y, TURBO.z);
	return g;
}

/** A spline through the profile points, densely sampled: smooth machined contours, not facets. */
function smooth(profile: [number, number][], samples = 120): [number, number][] {
	const curve = new THREE.SplineCurve(profile.map(([r, t]) => new THREE.Vector2(r, t)));
	return curve.getSpacedPoints(samples).map((p) => [p.x, p.y]);
}

/** A point on the turbo-alternator, in its own coordinates: along the axis, radius, angle. */
function onAxis(t: number, r: number, phi: number) {
	return new THREE.Vector3(TURBO.x + t, TURBO.y + r * Math.cos(phi), TURBO.z + r * Math.sin(phi));
}

/** A tube swept along `path` (0 → 1) whose radius follows `radius`: volutes and nozzles. */
function sweep(path: (s: number) => THREE.Vector3, radius: (s: number) => number, steps = 120, sides = 24) {
	const positions: number[] = [];
	const index: number[] = [];
	const axis = new THREE.Vector3(1, 0, 0);
	for (let i = 0; i <= steps; i++) {
		const s = i / steps;
		const p = path(s);
		const tangent = path(Math.min(s + 1e-3, 1))
			.sub(path(Math.max(s - 1e-3, 0)))
			.normalize();
		let normal = new THREE.Vector3().crossVectors(tangent, axis);
		if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3(0, 1, 0);
		normal.normalize();
		const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
		const r = radius(s);
		for (let j = 0; j <= sides; j++) {
			const a = (j / sides) * Math.PI * 2;
			const v = p
				.clone()
				.addScaledVector(normal, Math.cos(a) * r)
				.addScaledVector(binormal, Math.sin(a) * r);
			positions.push(v.x, v.y, v.z);
		}
	}
	for (let i = 0; i < steps; i++)
		for (let j = 0; j < sides; j++) {
			const a = i * (sides + 1) + j;
			const b = a + sides + 1;
			index.push(a, b, a + 1, b, b + 1, a + 1);
		}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	g.setIndex(index);
	g.computeVertexNormals();
	return g;
}

/**
 * A volute: the snail-shaped scroll round a wheel, its centreline spiralling
 * out from `r0` to `r1` and its bore growing from `b0` to `b1` over most of
 * a turn, then running straight out tangentially into a flanged nozzle.
 * `turn` +1 or −1 sets the hand.
 */
function volute(t: number, r0: number, r1: number, b0: number, b1: number, turn: number, phase: number) {
	const sweepAngle = Math.PI * 2 * 0.92;
	const at = (s: number) => onAxis(t, THREE.MathUtils.lerp(r0, r1, s), phase + turn * sweepAngle * s);
	const scroll = sweep(at, (s) => THREE.MathUtils.lerp(b0, b1, Math.pow(s, 0.8)), 140, 28);
	const end = at(1);
	const dir = at(1).sub(at(0.995)).normalize();
	const nozzleLength = 0.22;
	const nozzle = sweep((s) => end.clone().addScaledVector(dir, s * nozzleLength), () => b1, 8, 28);
	const flangeAt = end.clone().addScaledVector(dir, nozzleLength);
	const flange = sweep((s) => flangeAt.clone().addScaledVector(dir, s * 0.035), () => b1 + 0.045, 2, 28);
	return [scroll, nozzle, flange];
}

/**
 * A bladed wheel: a contoured hub and `count` thin blades, each a surface
 * from hub to tip that sweeps round the axis towards its leading edge (the
 * inducer curve of a compressor; mirrored, `flip`, for a radial turbine).
 */
function impeller(o: {
	t0: number;
	length: number;
	hub: [number, number];
	tip: [number, number];
	count: number;
	sweep: number;
	flip?: boolean;
}) {
	const parts: THREE.BufferGeometry[] = [];
	const ease = (u: number) => u * u * (3 - 2 * u);
	const along = (u: number) => o.t0 + (o.flip ? 1 - u : u) * o.length;
	// The hub: from a narrow nose to the full disc, and back down to the bore.
	const hub: [number, number][] = [];
	for (let i = 0; i <= 24; i++) {
		const u = i / 24;
		hub.push([THREE.MathUtils.lerp(o.hub[0], o.hub[1], ease(u)), along(u)]);
	}
	const back = along(1) + (o.flip ? -0.02 : 0.02);
	const profile: [number, number][] = [[0, along(0)], ...hub, [o.hub[1], back], [0, back]];
	parts.push(turned(o.flip ? profile.reverse() : profile, 96));
	// The blades.
	const nu = 18;
	const nv = 6;
	for (let k = 0; k < o.count; k++) {
		const base = (k / o.count) * Math.PI * 2;
		const positions: number[] = [];
		const index: number[] = [];
		for (let i = 0; i <= nu; i++) {
			const u = i / nu;
			const hubR = THREE.MathUtils.lerp(o.hub[0], o.hub[1], ease(u)) * 0.98;
			const tipR = THREE.MathUtils.lerp(o.tip[0], o.tip[1], u);
			const phi = base + o.sweep * (1 - u) * (1 - u);
			for (let j = 0; j <= nv; j++) {
				const v = j / nv;
				const p = onAxis(along(u), THREE.MathUtils.lerp(hubR, tipR, v), phi + 0.04 * v);
				positions.push(p.x, p.y, p.z);
			}
		}
		for (let i = 0; i < nu; i++)
			for (let j = 0; j < nv; j++) {
				const a = i * (nv + 1) + j;
				const b = a + nv + 1;
				index.push(a, b, a + 1, b, b + 1, a + 1);
			}
		const blade = new THREE.BufferGeometry();
		blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		blade.setIndex(index);
		blade.computeVertexNormals();
		parts.push(blade);
	}
	return parts;
}

/** A ring of `count` bolt heads round the axis at `r`, at `t`. */
function boltCircle(t: number, r: number, count: number, size = 0.014) {
	const bolts: THREE.BufferGeometry[] = [];
	for (let k = 0; k < count; k++) {
		const b = new THREE.CylinderGeometry(size, size, 0.02, 6);
		b.rotateZ(Math.PI / 2);
		const p = onAxis(t, r, (k / count) * Math.PI * 2);
		b.translate(p.x, p.y, p.z);
		bolts.push(b);
	}
	return bolts;
}

/**
 * The turbo-alternator stand-in, after the cutaway in the video. Along one
 * shaft: a flanged axial inlet; the compressor, a 14-blade impeller in its
 * shroud with a volute scrolling round it out to a flanged nozzle; a bearing
 * housing; the radial turbine, its wheel mirrored and its volute the other
 * hand; then the alternator, a finned housing round a stack of stator
 * laminations, copper end-windings and the rotor. Every contour is a
 * sampled spline.
 *
 * Casing parts (the shell, volutes, flanges, fins, laminations, supports)
 * take the half-section; the rotating parts and windings stay whole. Only
 * the shaft carries the heat (aGhost 0 with GLOW_INSIDE); the wheels,
 * rotor and copper (aKind 2) catch its light instead of glowing.
 */
function turboGeometry() {
	// The casing's outer contour, inlet to alternator end bell, and a 30 mm wall.
	const outline = smooth([
		[0.2, 0.0],
		[0.205, 0.06],
		[0.215, 0.13],
		[0.27, 0.23],
		[0.315, 0.31],
		[0.33, 0.37],
		[0.24, 0.44],
		[0.175, 0.5],
		[0.172, 0.57],
		[0.24, 0.62],
		[0.31, 0.68],
		[0.325, 0.77],
		[0.26, 0.86],
		[0.205, 0.93],
		[0.235, 0.99],
		[0.375, 1.03],
		[0.385, 1.1],
		[0.385, 1.84],
		[0.36, 1.93],
		[0.2, 1.99],
		[0.1, 2.0]
	]);
	// Cast in four pieces, split where the exploded view parts them: the
	// compressor housing, the bearing housing, the turbine housing and the
	// alternator's. Each is the outline between two stations and a 30 mm wall.
	const wall = 0.03;
	const at = (t: number): [number, number] => {
		const i = outline.findIndex(([, ti]) => ti >= t);
		const [r0, t0] = outline[Math.max(i - 1, 0)];
		const [r1, t1] = outline[i];
		return [THREE.MathUtils.lerp(r0, r1, t1 > t0 ? (t - t0) / (t1 - t0) : 0), t];
	};
	const shell = (a: number, b: number) => {
		const outer: [number, number][] = [at(a), ...outline.filter(([, t]) => t > a && t < b), at(b)];
		const piece = [...outer, ...[...outer].reverse().map(([r, t]): [number, number] => [Math.max(r - wall, 0.05), t])];
		piece.push(outer[0]);
		return turned(piece, 128);
	};

	// Cooling fins round the alternator housing.
	const fins: [number, number][] = [[0.375, 1.1]];
	for (let t = 1.12; t < 1.82; t += 0.045) fins.push([0.375, t], [0.415, t + 0.004], [0.415, t + 0.016], [0.375, t + 0.02]);
	fins.push([0.375, 1.84]);

	// The stator: a stack of laminations, its outer edge stepped every 15 mm.
	const stator: [number, number][] = [[0.205, 1.13]];
	for (let t = 1.13; t < 1.78; t += 0.015) stator.push([0.205, t]);
	stator.push([0.205, 1.78]);
	for (let t = 1.78; t > 1.13; t -= 0.015) stator.push([0.345, t], [0.338, t - 0.004], [0.338, t - 0.011], [0.345, t - 0.015]);
	stator.push([0.205, 1.13]);

	// The inlet flange, its outer edges chamfered 3 mm so they catch the light.
	const flanges = [
		turned([[0.2, -0.035], [0.287, -0.035], [0.29, -0.032], [0.29, -0.003], [0.287, 0.0], [0.2, 0.0], [0.2, -0.035]], 96),
		...boltCircle(-0.03, 0.255, 12)
	];

	const supports = [0.4, 1.55].map((t) => {
		const b = new RoundedBoxGeometry(0.2, TURBO.y - 0.38, 0.86, 2, 0.02);
		b.translate(TURBO.x + t, (TURBO.y - 0.38) / 2 + 0.06, TURBO.z);
		return b;
	});
	const plate = new RoundedBoxGeometry(2.2, 0.06, 1.0, 2, 0.015);
	plate.translate(TURBO.x + 1.0, 0.03, TURBO.z);

	// The alternator's housing, fins and stator are dark (aKind 2): black
	// anodised against the cast housings, as in the exploded motor reference.
	const casing = [
		withFlags(shell(0, 0.5), 1, 0, EXPLODE.compressorCase),
		withFlags(shell(0.5, 0.62), 1, 0, EXPLODE.bearing),
		withFlags(shell(0.62, 1.0), 1, 0, EXPLODE.turbineCase),
		withFlags(shell(1.0, 2.0), 1, 2, EXPLODE.alternator),
		withFlags(turned(fins, 128), 1, 2, EXPLODE.alternator),
		withFlags(turned(stator, 128), 1, 2, EXPLODE.alternator),
		// Each scroll grows out of the shroud's widest point, so it reads as one casting.
		...volute(0.35, 0.27, 0.36, 0.06, 0.12, 1, -Math.PI * 0.5).map((g) => withFlags(g, 1, 0, EXPLODE.compressorCase)),
		...volute(0.72, 0.27, 0.36, 0.06, 0.12, -1, -Math.PI * 0.5).map((g) => withFlags(g, 1, 0, EXPLODE.turbineCase)),
		...flanges.map((g) => withFlags(g, 1, 0, EXPLODE.flange)),
		...supports.map((g) => withFlags(g, 1, 0, EXPLODE.stand)),
		withFlags(plate, 1, 0, EXPLODE.stand)
	];

	// The rotating parts.
	const shaft = turned(
		smooth([[0, 0.02], [0.03, 0.02], [0.034, 0.1], [0.034, 0.5], [0.042, 0.52], [0.042, 0.58], [0.034, 0.6], [0.034, 1.96], [0.03, 1.98], [0, 1.98]], 40),
		48
	);
	const compressor = impeller({ t0: 0.12, length: 0.21, hub: [0.05, 0.225], tip: [0.165, 0.275], count: 14, sweep: 0.9 });
	const turbine = impeller({ t0: 0.62, length: 0.19, hub: [0.05, 0.215], tip: [0.155, 0.265], count: 13, sweep: -0.8, flip: true });
	const rotor = turned(smooth([[0, 1.12], [0.17, 1.12], [0.175, 1.16], [0.175, 1.74], [0.17, 1.78], [0, 1.78]], 30), 96);
	// Copper end-windings: at each end of the stator, a rounded bundle of
	// turns, its surface wrapped by a dense ring of thin coil loops.
	const windings: THREE.BufferGeometry[] = [];
	for (const [t, out] of [[1.13, -1], [1.78, 1]] as const) {
		const bundle: [number, number][] = [];
		for (let i = 0; i <= 16; i++) {
			const a = (i / 16) * Math.PI;
			bundle.push([0.27 - 0.055 * Math.cos(a), t + out * 0.05 * Math.sin(a)]);
		}
		windings.push(turned(out > 0 ? bundle : bundle.reverse(), 96));
		const loops = 40;
		for (let k = 0; k < loops; k++) {
			const phi = (k / loops) * Math.PI * 2;
			const coil = new THREE.TorusGeometry(0.058, 0.009, 6, 20, Math.PI);
			// Each loop arcs out of the stator in the plane of the axis and the radius.
			const radial = new THREE.Vector3(0, Math.cos(phi), Math.sin(phi));
			const axis = new THREE.Vector3(out, 0, 0);
			coil.applyMatrix4(new THREE.Matrix4().makeBasis(radial, axis, new THREE.Vector3().crossVectors(radial, axis)));
			const p = onAxis(t, 0.27, phi);
			coil.translate(p.x, p.y, p.z);
			windings.push(coil);
		}
	}
	const core = [
		withFlags(shaft, 0, 0),
		...compressor.map((g) => withFlags(g, 1, 0, EXPLODE.compressorWheel)),
		...turbine.map((g) => withFlags(g, 1, 0, EXPLODE.turbineWheel)),
		withFlags(rotor, 1, 0),
		// The windings belong to the stator: they leave with it, off the rotor.
		...windings.map((g) => withFlags(g, 1, 2, EXPLODE.alternator))
	];
	return { casing: mergeGeometries(casing)!, core: mergeGeometries(core)! };
}

/** The duct from the outlet's down pipe into the turbo-alternator's inlet. */
function ductGeometry() {
	const curve = new THREE.CatmullRomCurve3(
		[
			new THREE.Vector3(0.56, 1.5, -1.3),
			new THREE.Vector3(0.62, 1.32, -1.42),
			new THREE.Vector3(0.95, 1.17, -1.7),
			new THREE.Vector3(TURBO.x + 0.02, TURBO.y, TURBO.z)
		],
		false,
		'centripetal'
	);
	return new THREE.TubeGeometry(curve, 48, 0.1, 20);
}

/**
 * The transport cradle stand-in, after the video: a low steel frame round
 * the column's foot, saddle blocks at its ends, four uprights hugging the
 * vessel and the yellow locks on two of them (aKind 2). Not in the CAD.
 */
function cradleGeometry() {
	const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
		const b = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.12);
		b.rotateY(ry);
		b.translate(x, y, z);
		return b;
	};
	const parts: THREE.BufferGeometry[] = [];
	// Frame: two rails along x, two cross members along z.
	for (const z of [-1.25, 1.25]) parts.push(withFlags(box(3.9, 0.24, 0.22, 0, 0.12, z), 1, 0));
	for (const x of [-1.95, 1.95]) parts.push(withFlags(box(0.22, 0.24, 2.72, x, 0.12, 0), 1, 0));
	// Saddles at the ends, for when the vessel travels lying down.
	for (const x of [-1.55, 1.55]) parts.push(withFlags(box(0.38, 0.3, 1.9, x, 0.39, 0), 1, 0));
	// Uprights round the vessel's foot, and the locks.
	[45, 135, 225, 315].forEach((deg, i) => {
		const a = THREE.MathUtils.degToRad(deg);
		const [x, z] = [Math.cos(a) * 1.22, Math.sin(a) * 1.22];
		parts.push(withFlags(box(0.14, 0.95, 0.42, x, 0.475, z, -a), 1, 0));
		// On the upright's outer face, where the camera sees it.
		if (i % 2 === 0) parts.push(withFlags(box(0.08, 0.16, 0.14, Math.cos(a) * 1.32, 0.72, Math.sin(a) * 1.32, -a), 1, 2));
	});
	return mergeGeometries(parts)!;
}

// ---- Materials ----------------------------------------------------------------

/**
 * Depth of field from the beauty pass's own depth (a stock bokeh pass
 * would redraw depth ignoring the cuts and dissolves). Single-pass gather
 * after Gustafsson's "Bokeh depth of field in a single pass": samples on a
 * golden-angle spiral out to the largest blur, each counted where its own
 * circle of confusion reaches the pixel, so out-of-focus foreground bleeds
 * over sharp background as a lens would. Focus is the look-at distance.
 * Blur sizes are CSS pixels, so the sample count holds at any pixel ratio.
 */
function dofShader() {
	return {
		uniforms: {
			tDiffuse: { value: null },
			tDepth: { value: null },
			uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
			uPixelRatio: { value: 1 },
			uFocus: { value: 5 },
			uStrength: { value: 0 },
			cameraNear: { value: 0.05 },
			cameraFar: { value: 200 }
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
		fragmentShader: /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uPixelRatio;
uniform float uFocus;
uniform float uStrength;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

const float GOLDEN_ANGLE = 2.39996323;
const float MAX_BLUR = 7.0;
const float RAD_SCALE = 1.2;
// How sharply blur grows away from the focal distance…
const float APERTURE = 1.6;
// …beyond a band either side of it (a fraction of the distance) that stays
// sharp, so a deep subject (the column, the exchanger) is in focus front to
// back and only what's well behind or in front of it softens.
const float FOCUS_BAND = 0.1;

float distanceAt(vec2 uv) {
	return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
}
float blurAt(float d) {
	return clamp(APERTURE * max(abs(d - uFocus) / d - FOCUS_BAND, 0.0), 0.0, 1.0) * MAX_BLUR * uStrength;
}

void main() {
	float centerDepth = distanceAt(vUv);
	float centerSize = blurAt(centerDepth);
	vec3 color = texture2D(tDiffuse, vUv).rgb;
	float total = 1.0;
	float radius = RAD_SCALE;
	float angle = 0.0;
	for (int i = 0; i < 80; i++) {
		if (radius >= MAX_BLUR * uStrength) break;
		vec2 at = vUv + vec2(cos(angle), sin(angle)) * uTexel * radius * uPixelRatio;
		vec3 sampleColor = texture2D(tDiffuse, at).rgb;
		float sampleDepth = distanceAt(at);
		float sampleSize = blurAt(sampleDepth);
		// Background can't bleed over a nearer, sharper pixel.
		if (sampleDepth > centerDepth) sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
		float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
		color += mix(color / total, sampleColor, m);
		total += 1.0;
		radius += RAD_SCALE / radius;
		angle += GOLDEN_ANGLE;
	}
	gl_FragColor = vec4(color / total, 1.0);
}`
	};
}

/**
 * The finish, in display space after tone mapping: fine animated grain, so
 * the darks never sit as dead flat fills, and a soft vignette centred on
 * the subject, right of centre.
 */
/**
 * Bevel highlights. Machined and cast parts show their edges as thin lines
 * of light, where a small chamfer or radius catches a light the faces either
 * side miss; the CAD's tessellation has hard 90° edges and no bevel to
 * catch anything. This finds those edges on screen and lights them as if
 * they were bevelled.
 *
 * Normals come from the beauty pass's depth (as the occlusion's do), so
 * cuts, dissolves and exploded parts are honoured. At each pixel it compares
 * the normals a couple of pixels either side: where they turn outward
 * (a convex crease) by more than ~30° (sharper than the simplified CAD's
 * tessellation steps on its cylinders), that's an edge. A neighbour off the pixel's own
 * plane is another surface (a silhouette or a step), not a crease, and
 * doesn't count. The bevel's normal is the average of the faces', and it
 * brightens as it faces the key light or a strip.
 */
function edgeShader() {
	return {
		uniforms: {
			tDiffuse: { value: null },
			tDepth: { value: null },
			uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
			uPixelRatio: { value: 1 },
			uProjectionInverse: { value: new THREE.Matrix4() },
			uKey: { value: new THREE.Vector3(0, 1, 0) },
			uStrips: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)] },
			uStrength: { value: 0 }
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
		fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uPixelRatio;
uniform mat4 uProjectionInverse;
uniform vec3 uKey;
uniform vec3 uStrips[2];
uniform float uStrength;
varying vec2 vUv;

vec3 viewPosition(vec2 uv) {
	float depth = texture2D(tDepth, uv).x;
	vec4 p = uProjectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
	return p.xyz / p.w;
}

// The face normal at uv, from the one-pixel differences on whichever side
// stays on the same surface (the smaller depth step).
vec3 viewNormal(vec2 uv, vec3 p) {
	vec3 r = viewPosition(uv + vec2(uTexel.x, 0.0)) - p;
	vec3 l = p - viewPosition(uv - vec2(uTexel.x, 0.0));
	vec3 u = viewPosition(uv + vec2(0.0, uTexel.y)) - p;
	vec3 d = p - viewPosition(uv - vec2(0.0, uTexel.y));
	vec3 dx = abs(r.z) < abs(l.z) ? r : l;
	vec3 dy = abs(u.z) < abs(d.z) ? u : d;
	return normalize(cross(dx, dy));
}

void main() {
	vec4 c = texture2D(tDiffuse, vUv);
	gl_FragColor = c;
	if (texture2D(tDepth, vUv).x >= 1.0) return;

	vec3 p = viewPosition(vUv);
	vec3 n = viewNormal(vUv, p);
	vec2 reach = uTexel * 1.5 * uPixelRatio;
	vec2 offsets[4] = vec2[4](vec2(reach.x, 0.0), vec2(-reach.x, 0.0), vec2(0.0, reach.y), vec2(0.0, -reach.y));
	vec3 normals[4];
	float valid[4];
	for (int i = 0; i < 4; i++) {
		vec2 uv = vUv + offsets[i];
		vec3 q = viewPosition(uv);
		normals[i] = viewNormal(uv, q);
		// Off this pixel's plane by more than ~1% of the distance: another surface.
		valid[i] = step(abs(dot(q - p, n)), -p.z * 0.01) * step(texture2D(tDepth, uv).x, 0.9999);
	}
	// Convexity: normals turning outward across the pixel, right minus left
	// in x and up minus down in y; one valid side counts against the centre.
	float k = 0.0;
	k += valid[0] * valid[1] > 0.5 ? normals[0].x - normals[1].x : valid[0] > 0.5 ? (normals[0].x - n.x) * 2.0 : valid[1] > 0.5 ? (n.x - normals[1].x) * 2.0 : 0.0;
	k += valid[2] * valid[3] > 0.5 ? normals[2].y - normals[3].y : valid[2] > 0.5 ? (normals[2].y - n.y) * 2.0 : valid[3] > 0.5 ? (n.y - normals[3].y) * 2.0 : 0.0;
	// The sharpest turn among the neighbours: below ~30° is a curved surface's
	// facets (the simplified CAD's cylinders step by up to ~25°).
	float turn = 0.0;
	for (int i = 0; i < 4; i++) turn = max(turn, valid[i] * (1.0 - dot(n, normals[i])));
	float edge = smoothstep(0.13, 0.3, turn) * smoothstep(0.2, 0.6, k);
	if (edge <= 0.0) return;

	vec3 bevel = normalize(n + normals[0] * valid[0] + normals[1] * valid[1] + normals[2] * valid[2] + normals[3] * valid[3]);
	float lit = max(max(dot(bevel, uKey), 0.0), max(max(dot(bevel, uStrips[0]), 0.0), max(dot(bevel, uStrips[1]), 0.0)));
	// Always a faint line; bright where the bevel faces a light. White, cool like the strips.
	float amount = edge * (0.05 + 0.6 * pow(lit, 4.0)) * uStrength;
	gl_FragColor = vec4(c.rgb + vec3(0.92, 0.96, 1.0) * amount * (0.35 + c.rgb), c.a);
}`
	};
}

/** Hands the beauty pass's depth to the labels' test (SystemScene.testAnchors), drawing nothing itself. */
class AnchorTestPass extends Pass {
	constructor(private test: (depth: THREE.DepthTexture | null) => void) {
		super();
		this.needsSwap = false;
	}
	render(_renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
		this.test(read.depthTexture);
	}
}

/**
 * The labels' visibility test: pixel i answers for anchor i, red when the
 * nearest surface drawn at its spot on screen isn't more than the slack in
 * front of it (it's in the open, or on that surface), black when it is.
 */
function anchorShader() {
	return new THREE.ShaderMaterial({
		uniforms: {
			tDepth: { value: null },
			uUv: { value: Array.from({ length: MAX_ANCHORS }, () => new THREE.Vector2()) },
			uDistance: { value: new Array(MAX_ANCHORS).fill(-1) },
			uCount: { value: 0 },
			cameraNear: { value: 0.05 },
			cameraFar: { value: 200 }
		},
		vertexShader: /* glsl */ `
void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
		fragmentShader: /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform vec2 uUv[${MAX_ANCHORS}];
uniform float uDistance[${MAX_ANCHORS}];
uniform int uCount;
uniform float cameraNear;
uniform float cameraFar;
void main() {
	int i = int(gl_FragCoord.x);
	float seen = 0.0;
	if (i < uCount && uDistance[i] > 0.0) {
		float depth = texture2D(tDepth, uUv[i]).x;
		// Nothing drawn there (the backdrop): in the open.
		float surface = depth >= 1.0 ? 1e6 : -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
		seen = step(uDistance[i] - ${ANCHOR_SLACK.toFixed(2)} - uDistance[i] * 0.01, surface);
	}
	gl_FragColor = vec4(seen, 0.0, 0.0, 1.0);
}`,
		depthTest: false,
		depthWrite: false
	});
}

function finishShader() {
	return {
		uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.22 } },
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
		fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uVignette;
varying vec2 vUv;
float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
void main() {
	vec4 c = texture2D(tDiffuse, vUv);
	float vignette = smoothstep(0.35, 1.05, distance(vUv, vec2(0.58, 0.5)));
	c.rgb *= 1.0 - uVignette * vignette;
	c.rgb += (hash(gl_FragCoord.xy + fract(uTime) * 1000.0) - 0.5) * 0.028;
	gl_FragColor = c;
}`
	};
}

/** Smooth 3D value noise, for the finishes' procedural surface. */
const NOISE = /* glsl */ `
float hash3(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
		f.z
	);
}`;

/** 4×4 Bayer threshold: the dissolve's screen-door pattern. */
const BAYER = /* glsl */ `
float bayer4(vec2 p) {
	ivec2 q = ivec2(mod(p, 4.0));
	int i = q.x + q.y * 4;
	int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
	return (float(m[i]) + 0.5) / 16.0;
}`;

/**
 * The vertex side every material of a group shares (the beauty pass and the
 * shadow depth pass): the per-part flags, the drums' turn, the core's stack.
 */
function shapeVertex(vertex: string) {
	return vertex
			.replace(
				'#include <common>',
				/* glsl */ `#include <common>
attribute float aGhost;
attribute float aKind;
varying float vGhost;
varying float vKind;
varying vec3 vWorld;
#ifdef USE_DRUMS
attribute float aDrum;
uniform float uDrumTurn;
uniform vec2 uDrumAxes[12];
vec2 turn(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
#endif
#ifdef USE_STACK
attribute float aLayer;
uniform float uStack;
uniform float uLayers;
#endif
#ifdef USE_EXPLODE
attribute float aExplode;
uniform float uExplode;
varying float vStand;
#endif
#ifdef USE_DROP
uniform float uDrop;
#endif`
			)
			.replace(
				'#include <beginnormal_vertex>',
				/* glsl */ `#include <beginnormal_vertex>
#ifdef USE_DRUMS
if (aDrum >= 0.0) objectNormal.xz = turn(objectNormal.xz, uDrumTurn);
#endif`
			)
			.replace(
				'#include <begin_vertex>',
				/* glsl */ `#include <begin_vertex>
#ifdef USE_DRUMS
if (aDrum >= 0.0) {
	vec2 axis = uDrumAxes[int(aDrum + 0.5)];
	transformed.xz = axis + turn(transformed.xz - axis, uDrumTurn);
}
#endif
#ifdef USE_STACK
{
	// Layers lift apart, the top ones furthest, and land bottom first.
	float l = aLayer / max(uLayers - 1.0, 1.0);
	float p = clamp((uStack - l * 0.55) / 0.45, 0.0, 1.0);
	p = 1.0 - pow(1.0 - p, 3.0);
	transformed.y += (1.0 - p) * (0.5 + l * 1.4);
}
#endif
#ifdef USE_EXPLODE
// Pieces slide along the shaft (+x); the supports (a sentinel offset) stay, and dissolve when the machine stands alone.
vStand = step(5.0, aExplode);
transformed.x += aExplode * uExplode * (1.0 - vStand);
#endif
#ifdef USE_DROP
transformed.y += uDrop;
#endif
vGhost = aGhost;
vKind = aKind;
vWorld = transformed;`
			);
}

/** The fragment side every material of a group shares: what's hidden, dissolved or not yet shown, discards. */
const SHAPE_FRAGMENT_HEAD = /* glsl */ `
uniform float uSolid;
uniform float uInner;
varying float vGhost;
varying float vKind;
#ifdef USE_EXPLODE
uniform float uSolo;
varying float vStand;
#endif
${BAYER}`;
const SHAPE_DISCARD = /* glsl */ `
	if (vKind > 2.5) discard;
	if (vGhost > 0.5 && uSolid < 0.999 && bayer4(gl_FragCoord.xy) >= uSolid) discard;
	if (vGhost < 0.5 && uInner < 0.999 && bayer4(gl_FragCoord.xy) >= uInner) discard;
#ifdef USE_EXPLODE
	if (vStand > 0.5 && bayer4(gl_FragCoord.xy) < uSolo * 1.05) discard;
#endif`;

/**
 * The shadow pass's depth material for a group: the same discards, cuts
 * and per-part motion as its beauty material, so a dissolved or cut-away
 * shield casts no shadow on the drums inside it, and turning drums cast
 * turning shadows. Shares the group's uniforms.
 */
function depthMaterial(spec: GroupSpec, uniforms: Uniforms, planes: THREE.Plane[] | null) {
	const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
	const defines = [
		spec.drums && 'USE_DRUMS',
		spec.stack && 'USE_STACK',
		spec.explode && 'USE_EXPLODE',
		spec.drop && 'USE_DROP'
	].filter(Boolean) as string[];
	m.defines = Object.fromEntries(defines.map((d) => [d, '']));
	m.customProgramCacheKey = () => `depth:${defines.join(',')}`;
	if (planes) {
		m.clippingPlanes = planes;
		m.clipIntersection = true;
	}
	m.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shapeVertex(shader.vertexShader);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>${SHAPE_FRAGMENT_HEAD}`)
			.replace('void main() {', `void main() {${SHAPE_DISCARD}`);
	};
	return m;
}

function material(spec: GroupSpec, uniforms: Uniforms) {
	const m = new THREE.MeshPhysicalMaterial({
		color: spec.finish.color,
		metalness: spec.finish.metalness,
		roughness: spec.finish.roughness,
		clearcoat: spec.finish.clearcoat ?? 0,
		sheen: spec.finish.sheen ?? 0,
		sheenRoughness: 0.8,
		sheenColor: new THREE.Color(0.5, 0.52, 0.55),
		side: THREE.DoubleSide
	});
	const surface = spec.finish.surface;
	if (surface) {
		uniforms.uSurfScale = { value: new THREE.Vector3(...surface.scale) };
		uniforms.uSurfAmount = { value: new THREE.Vector2(surface.streak, surface.blotch) };
	}
	const defines = [
		surface && 'USE_SURFACE',
		spec.drums && 'USE_DRUMS',
		spec.stack && 'USE_STACK',
		spec.heat && `HEAT_${spec.heat.toUpperCase()}`,
		spec.alt && 'USE_ALT',
		spec.glowInside && 'GLOW_INSIDE',
		spec.explode && 'USE_EXPLODE',
		spec.drop && 'USE_DROP',
		spec.finish.sparkle && 'USE_SPARKLE'
	].filter(Boolean) as string[];
	m.defines = Object.fromEntries(defines.map((d) => [d, '']));
	m.customProgramCacheKey = () => defines.join(',');

	m.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shapeVertex(shader.vertexShader);

		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				/* glsl */ `#include <common>
${SHAPE_FRAGMENT_HEAD}
uniform float uHeat;
uniform float uFront;
uniform vec3 uAxis;
uniform float uTime;
uniform float uFuel;
uniform float uGlow;
uniform vec3 uWarm;
uniform vec3 uHot;
uniform vec3 uAlt;
uniform vec2 uAltMetal;
uniform float uCap;
uniform float uLowkey;
varying vec3 vWorld;
#ifdef USE_SURFACE
uniform vec3 uSurfScale;
uniform vec2 uSurfAmount;
${NOISE}
#endif
#ifdef USE_SPARKLE
// Bead-blast grain: cells of a few millimetres, each a facet at its own
// tilt and roughness, faded out before a pixel spans one (where it would
// only flicker). Under the low-key look only.
vec3 grainCell() { return floor(vWorld * 320.0); }
float grainResolved() { return 1.0 - smoothstep(0.45, 1.1, length(fwidth(vWorld * 320.0))); }
#endif`
			)
			.replace(
				'void main() {',
				/* glsl */ `void main() {${SHAPE_DISCARD}`
			)
			.replace(
				'#include <clipping_planes_fragment>',
				/* glsl */ `#include <clipping_planes_fragment>
	// Section caps: through a cut you only see a part's inside, its back
	// faces; one flat fill makes the cut read as a solid section.
	if (uCap > 0.5 && !gl_FrontFacing) {
		// Unlit, so darker under the low-key look, or it glows against the shadows.
		gl_FragColor = vec4(mix(vec3(0.2, 0.205, 0.215), vec3(0.045, 0.047, 0.052), uLowkey), 1.0);
		return;
	}`
			)
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
#ifdef USE_ALT
	if (vKind > 1.5) diffuseColor.rgb = uAlt;
#endif
	// Fuel plugs: amber, like the gold rings on the core in the video.
	if (vKind > 0.5 && vKind < 1.5) diffuseColor.rgb = vec3(0.55, 0.32, 0.08);
	// The low-key look is near-monochrome, like its references: colours
	// drain, copper and the fuel's gold to a warm grey.
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), uLowkey * 0.85);`
			)
			.replace(
				'#include <metalnessmap_fragment>',
				/* glsl */ `#include <metalnessmap_fragment>
#ifdef USE_ALT
	if (vKind > 1.5) metalnessFactor = uAltMetal.x;
#endif`
			)
			.replace(
				'#include <roughnessmap_fragment>',
				/* glsl */ `#include <roughnessmap_fragment>
	// Geometric specular anti-aliasing: where the normal turns faster than a
	// pixel can show (thin pipes, trays, fillets), widen the highlight, or it
	// breaks into sparkle as the camera moves.
	{
		vec3 dn = fwidth(vNormal);
		float variance = clamp(dot(dn, dn) * 2.0, 0.0, 0.18);
		roughnessFactor = sqrt(roughnessFactor * roughnessFactor + variance);
	}
#ifdef USE_SURFACE
	{
		// Fine noise stretched by uSurfScale (brushing, or grain), and a broad
		// slow one, both moving the roughness; the broad one tints a touch.
		// The fine one fades out before a pixel spans half a cell: past that
		// it only aliases into moiré lines.
		vec3 cells = vWorld * uSurfScale;
		float fine = noise3(cells);
		float resolved = 1.0 - smoothstep(0.12, 0.4, length(fwidth(cells)));
		float broad = noise3(vWorld * 1.7 + 11.0);
		roughnessFactor = clamp(
			roughnessFactor * (1.0 + uSurfAmount.x * resolved * (fine - 0.5) * 2.0 + uSurfAmount.y * (broad - 0.5) * 2.0),
			0.04,
			1.0
		);
		diffuseColor.rgb *= 1.0 + 0.08 * (broad - 0.5);
	}
#endif
#ifdef USE_ALT
	if (vKind > 1.5) roughnessFactor = uAltMetal.y;
#endif
#ifdef USE_SPARKLE
	// Bead-blasted is matter than the studio's satin; then the grain.
	if (vKind < 1.5) roughnessFactor *= mix(1.0, 1.3, uLowkey) * mix(1.0, 0.55 + 0.9 * hash3(grainCell()), uLowkey * grainResolved());
#endif`
			)
			.replace(
				'#include <normal_fragment_maps>',
				/* glsl */ `#include <normal_fragment_maps>
#ifdef USE_SPARKLE
	if (vKind < 1.5) {
		vec3 c = grainCell();
		vec3 tilt = vec3(hash3(c), hash3(c + 17.0), hash3(c + 31.0)) - 0.5;
		normal = normalize(normal + tilt * 0.45 * uLowkey * grainResolved());
	}
#endif`
			)
			.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
	float glow = 0.0;
#ifdef HEAT_FRONT
	{
		// A band at uFront metres along uAxis, with a low glow left behind it.
		float d = dot(vWorld, uAxis);
		float band = smoothstep(0.22, 0.0, abs(d - uFront));
		float trail = smoothstep(uFront + 0.05, uFront - 0.6, d) * 0.1;
		glow = uHeat * (band * 1.2 + trail);
	}
#endif
#ifdef HEAT_UNIFORM
	{
		// 3,600 plugs add up: each stays a warm point, just over the bloom threshold.
		float shimmer = 0.85 + 0.15 * sin(uTime * 2.2 + vWorld.y * 9.0 + vWorld.x * 4.0);
		glow = uHeat * shimmer * (vKind > 0.5 ? 0.3 : 0.28);
		// Hot graphite glows rather than reflects: darken what it reflects.
		diffuseColor.rgb *= 1.0 - 0.7 * uHeat;
	}
#endif
#ifdef GLOW_INSIDE
	glow *= 1.0 - vGhost;
#endif
	vec3 heat = mix(uWarm, uHot, clamp(glow - 0.6, 0.0, 1.0));
	// Without hue, heat reads as brightness, and much less of it blows out to a lamp.
	totalEmissiveRadiance += heat * glow * uGlow * 6.0 * mix(1.0, 0.3, uLowkey);
	if (vKind > 0.5 && vKind < 1.5) totalEmissiveRadiance += uWarm * uFuel * 0.9;`
			)
			.replace(
				'#include <opaque_fragment>',
				/* glsl */ `// Reflections stay under the bloom threshold, so only the heat blooms.
	outgoingLight = min(outgoingLight - totalEmissiveRadiance, vec3(1.25)) + totalEmissiveRadiance;
#include <opaque_fragment>`
			);
	};
	return m;
}

/** The see-through outline a dissolved group leaves: additive fresnel. */
function ghostMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#8fa2b8') } },
		vertexShader: /* glsl */ `
attribute float aGhost;
varying float vGhost;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vNormal = normalize(normalMatrix * normal);
	vView = normalize(-mv.xyz);
	vGhost = aGhost;
	gl_Position = projectionMatrix * mv;
}`,
		fragmentShader: /* glsl */ `
uniform float uOpacity;
uniform vec3 uColor;
varying float vGhost;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
	gl_FragColor = vec4(uColor * (f * 0.9 + 0.025) * uOpacity * vGhost, 1.0);
}`,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
		side: THREE.DoubleSide
	});
}

/** An energy path: a bright pulse with a short fading tail, travelling along the tube. */
function pathMaterial(uniforms: Uniforms) {
	return new THREE.ShaderMaterial({
		uniforms,
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
		fragmentShader: /* glsl */ `
uniform float uAmount;
uniform float uFront;
uniform vec3 uWarm;
uniform vec3 uHot;
uniform float uLowkey;
varying vec2 vUv;
void main() {
	float front = uFront * 1.08 - 0.04;
	float head = smoothstep(0.05, 0.0, abs(vUv.x - front));
	float tail = smoothstep(front + 0.005, front - 0.07, vUv.x) * 0.18 * step(vUv.x, front);
	float glow = (head + tail) * uAmount;
	gl_FragColor = vec4(mix(uWarm, uHot, head) * glow * 6.0 * mix(1.0, 0.16, uLowkey), 1.0);
}`,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true
	});
}
