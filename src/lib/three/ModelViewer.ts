import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
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

export interface ModelViewerOptions {
	/** Path to the optimised .glb (meshopt-compressed, GPU-instanced). */
	url: string;
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
	 */
	readonly scrollRotation = { x: 0, y: 0 };
	readonly userRotation = { x: 0, y: 0 };
	/** The one material every part shares. Tweak live: viewer.material.roughness = … */
	material!: THREE.MeshPhysicalMaterial;
	/** Addressable for live tuning: viewer.lights.key.intensity = … */
	readonly lights: { key: THREE.DirectionalLight; rim: THREE.DirectionalLight; hemi: THREE.HemisphereLight };

	private container: HTMLElement;
	private pmrem: THREE.PMREMGenerator;
	private envRT: THREE.WebGLRenderTarget | null = null;
	private composer: EffectComposer;
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

	/** Distance that frames the whole model — useful defaults for GSAP tweens. */
	radius = 10;

	/** Vertical FOV the shot list is composed at; widened only when too narrow to fit. */
	private baseFov = 38;
	/** Bounding-sphere radius of the model; 0 until `load()` resolves. */
	private fitRadius = 0;
	/** Camera distance of the establishing shot — the framing `baseFov` is designed for. */
	private fitDistance = 0;

	private drag = { active: false, x: 0, y: 0 };
	private dragEndHandlers = new Set<() => void>();
	private studioHandlers = new Set<(on: boolean) => void>();

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
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
		key.shadow.mapSize.set(2048, 2048);
		// A wide penumbra reads as a large softbox rather than a bare bulb.
		key.shadow.radius = 9;
		key.shadow.blurSamples = 24;
		key.shadow.bias = -0.0002;
		key.shadow.normalBias = 0.04;
		this.scene.add(key);

		const rim = new THREE.DirectionalLight(0xffffff, 1.2);
		rim.position.set(8, 4, -10);
		this.scene.add(rim);

		this.lights = { key, rim, hemi };

		this.scene.add(this.root);

		// Post: MSAA target -> scene -> AO -> bloom -> tone map + sRGB.
		// OutputPass owns tone mapping, so the RenderPass sees linear HDR.
		const size = new THREE.Vector2();
		this.renderer.getDrawingBufferSize(size);
		// 8× MSAA: measured free here (61fps either way), and the model is full
		// of thin rails and stanchions that crawl badly under continuous
		// rotation at 4×.
		const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 8 });
		this.composer = new EffectComposer(this.renderer, rt);
		if (opts.ssr !== false) {
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
			this.composer.addPass(this.ssr);
		} else {
			this.composer.addPass(new RenderPass(this.scene, this.camera));
		}
		if (opts.ao !== false) {
			// Occlusion multiplies onto scene colour; its alpha is the scene's
			// own, so the transparent backdrop survives the pass.
			this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
			this.gtao.output = GTAOPass.OUTPUT.Default;
			this.gtao.blendIntensity = 0.9;
			this.composer.addPass(this.gtao);
		}
		if (opts.dof !== false) {
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
			this.composer.addPass(this.bokeh);
		}
		if (opts.bloom !== false) {
			const b = opts.bloom ?? { strength: 0.55, threshold: 0.96 };
			// Threshold sits just under white so only the hottest HDR
			// highlights bloom — a halo on the specular, not a glow on the body.
			this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), b.strength, 0.4, b.threshold);
			this.composer.addPass(this.bloom);
		}
		this.composer.addPass(new OutputPass());
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

	async load(): Promise<THREE.Group> {
		const [gltf] = await Promise.all([this.loadModel(), this.loadEnvironment()]);
		if (this.disposed) return gltf.scene;

		const model = gltf.scene;

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

		// Recentre on the origin so rotations spin about the vessel's own axis
		// rather than the exporter's origin.
		const box = new THREE.Box3().setFromObject(model);
		const size = box.getSize(new THREE.Vector3());
		const centre = box.getCenter(new THREE.Vector3());
		model.position.sub(centre);

		this.root.add(model);

		this.radius = Math.max(size.x, size.y, size.z) * (this.opts.fitOffset ?? 1.95);

		// Shadow frustum hugs the model's bounds — a loose one wastes the 2k
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
		// physical + shadow + depth programs link one after another.
		await this.renderer.compileAsync(this.scene, this.camera);
		if (!this.disposed) this.opts.onProgress?.(1);

		return model;
	}

	private loadModel() {
		const loader = new GLTFLoader();
		// Required: the asset uses EXT_meshopt_compression + KHR_mesh_quantization.
		// EXT_mesh_gpu_instancing is handled natively and yields InstancedMesh.
		loader.setMeshoptDecoder(MeshoptDecoder);
		return loader.loadAsync(this.opts.url, (e) => this.report('glb', e));
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

	resize() {
		const { clientWidth: w, clientHeight: h } = this.container;
		if (!w || !h) return;
		const aspect = w / h;
		this.camera.aspect = aspect;

		// Aspect-aware framing. three's `fov` is the VERTICAL angle, so visible
		// height is the same at any aspect — but visible width is height ×
		// aspect, which collapses on a tall, narrow stage and crops the model's
		// sides. Widen the vertical FOV until the bounding sphere fits both
		// axes. `max` with the base FOV means wide viewports keep the composed
		// framing exactly; only narrow ones pull back.
		if (this.fitRadius > 0) {
			const theta = Math.asin(Math.min(1, (this.fitRadius * 1.08) / this.fitDistance));
			const needed = 2 * Math.max(theta, Math.atan(Math.tan(theta) / aspect));
			this.camera.fov = Math.max(this.baseFov, THREE.MathUtils.radToDeg(needed));
		}

		this.camera.updateProjectionMatrix();
		this.canvasRect = this.container.getBoundingClientRect();
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h);
		// composer.setSize just pushed bloom to full resolution — put it back to
		// half. Full-res bloom is where its blocky mip artifacts come from.
		if (this.bloom) {
			const pr = this.renderer.getPixelRatio();
			this.bloom.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
		}
	}

	render() {
		if (this.disposed) return;
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
		if (this.opts.autoRotate && !this.drag.active) this.autoRotation += this.opts.autoRotate * dt;

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
			0
		);
		this.camera.lookAt(this.target);
		if (this.studioOn && this.studioKeyFollow) this.aimKey();
		// Focus rides the camera target, so whatever the scroll shot frames is sharp.
		if (this.bokeh) this.bokehUniforms.focus.value = this.camera.position.distanceTo(this.target);
		this.renderer.info.reset();
		if (this.grain) this.grain.uniforms.uTime.value = this.clock.getElapsedTime();
		if (this.sweep) this.sweep.time = this.clock.getElapsedTime();
		this.contact?.update(this.scene);
		this.composer.render();
	}

	dispose() {
		this.disposed = true;
		this.observer.disconnect();
		const el = this.renderer.domElement;
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
		this.bokeh?.dispose();
		this.composer.dispose();
		this.envRT?.dispose();
		this.pmrem.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
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
