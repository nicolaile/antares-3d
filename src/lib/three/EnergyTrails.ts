/**
 * Energy running along a model's pipes, as the R1 section's diagram draws
 * it (FlowMapEnergy, with its parameters, energy.ts): pulses leave the
 * start of each route together, a white-hot comet head on a crisp core
 * line, its tail running back through orange to pink, turbulence carried
 * along with the flow, the bore filled behind it, light on the pipe's
 * walls and sparks drifting through.
 *
 * Each route is a sleeve just outside its pipe. A point on it knows how
 * far along the route it is and how far across the pipe it sits, as seen
 * from the camera; with the pipe's radius as the diagram's (13.5 units),
 * the diagram's own shading carries over unchanged, unit for unit.
 *
 * A pass over the finished frame (ModelViewer's `addOverlay`), after tone
 * mapping, so the colours come out as the diagram's: the sleeves drawn on
 * their own, hidden where the model's depth (the occlusion pass's) stands
 * in front of them, then laid over the frame with a bloom of their light,
 * blurred down and back up a chain of halving sizes, for a halo that
 * spreads past the pipe and over what's round it.
 *
 * Routes are polylines through a pipe's centre (the CAD's authored frame,
 * Y-up metres), rounded at each corner as the pipe's elbows are.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { COOL, DEFAULT_TRAIL_LOOK, DEFAULT_TRAIL_PARAMS, RAMPS, type EnergyParams, type TrailLook } from '$lib/energy/energy';

export interface TrailRoute {
	/** The pipe's centre line, from where the energy starts. */
	path: [number, number, number][];
	/** The pipe's outer radius, metres. */
	radius: number;
	/** The elbows' bend radius, metres. */
	bend: number;
	/** The gas's temperature at the start and the end, 0 (given its heat up) to 1. Default hot all the way. */
	temp?: [number, number];
}

/** Energy along one model's pipes: the routes, and how it looks there, over the trails' defaults. */
export interface TrailSet {
	routes: TrailRoute[];
	params?: Partial<EnergyParams>;
	look?: Partial<TrailLook>;
}

/** The diagram's pipe wall, from the centreline, in its units: a route's radius is this many. */
const WALL = 13.5;
/** Its bore's inner half-width (FlowMapEnergy's BORE). */
const BORE = 12.5;

/** The route as a curve: straight runs, each corner rounded. */
function curveOf({ path, bend }: TrailRoute) {
	const points = path.map((p) => new THREE.Vector3(...p));
	const curve = new THREE.CurvePath<THREE.Vector3>();
	let from = points[0];
	for (let i = 1; i < points.length - 1; i++) {
		const [a, at, b] = [points[i - 1], points[i], points[i + 1]];
		const r = Math.min(bend, at.distanceTo(a) / 2, at.distanceTo(b) / 2);
		const into = at.clone().addScaledVector(a.clone().sub(at).normalize(), r);
		const out = at.clone().addScaledVector(b.clone().sub(at).normalize(), r);
		curve.add(new THREE.LineCurve3(from, into));
		curve.add(new THREE.QuadraticBezierCurve3(into, at, out));
		from = out;
	}
	curve.add(new THREE.LineCurve3(from, points[points.length - 1]));
	return curve;
}

/**
 * A sleeve round the route, out as far as anything the shading draws
 * (`reach`, diagram units), each vertex carrying how far along it is and
 * the route's axis there, and the route's scale and temperature.
 */
function sleeve(route: TrailRoute, reach: number) {
	const curve = curveOf(route);
	const length = curve.getLength();
	const unit = route.radius / WALL;
	const radius = reach * unit;
	const segments = Math.ceil(length / 0.02);
	const radial = 24;
	const geometry = new THREE.TubeGeometry(curve, segments, radius, radial, false);
	const count = geometry.getAttribute('position').count;
	const arc = new Float32Array(count);
	const axis = new Float32Array(count * 3);
	const temp = new Float32Array(count);
	const [t0, t1] = route.temp ?? [1, 1];
	for (let k = 0; k < count; k++) {
		const i = Math.floor(k / (radial + 1));
		const u = i / segments;
		arc[k] = (u * length) / unit;
		geometry.tangents[i].toArray(axis, k * 3);
		temp[k] = t0 + (t1 - t0) * u;
	}
	geometry.setAttribute('arc', new THREE.BufferAttribute(arc, 1));
	geometry.setAttribute('axis', new THREE.BufferAttribute(axis, 3));
	geometry.setAttribute('temp', new THREE.BufferAttribute(temp, 1));
	geometry.setAttribute('unit', new THREE.BufferAttribute(new Float32Array(count).fill(unit), 1));
	geometry.setAttribute('sleeve', new THREE.BufferAttribute(new Float32Array(count).fill(radius), 1));
	return geometry;
}

const SLEEVE_VS = /* glsl */ `
	attribute float arc;
	attribute vec3 axis;
	attribute float temp;
	attribute float unit;
	attribute float sleeve;
	varying float vArc;
	varying float vTemp;
	varying float vUnit;
	varying float vSleeve;
	varying vec3 vNormal;
	varying vec3 vAxis;
	varying vec3 vPos;
	void main() {
		vArc = arc;
		vTemp = temp;
		vUnit = unit;
		vSleeve = sleeve;
		vec4 mv = modelViewMatrix * vec4(position, 1.0);
		vPos = mv.xyz;
		vNormal = normalMatrix * normal;
		vAxis = normalMatrix * axis;
		gl_Position = projectionMatrix * mv;
	}`;

/** The colour ramp and the model's depth. */
const SHARED_FS = /* glsl */ `
	#include <packing>
	uniform vec4 uRamp[4];
	uniform float uRampX[4];
	uniform float uGain;
	uniform sampler2D tDepth;
	uniform bool uHasDepth;
	uniform vec2 uRes;
	uniform float uNear, uFar, uBias;
	// OKLab (the stops' colours, uRamp's rgb) back to display sRGB.
	vec3 fromLab(vec3 lab) {
		vec3 lms = vec3(
			lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z,
			lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z,
			lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z
		);
		lms = lms * lms * lms;
		vec3 lin = clamp(vec3(
			4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
			-1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
			-0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
		), 0.0, 1.0);
		return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
	}
	// Tail (0) to head (1): eased from stop to stop, so there's no kink at
	// any of them, and blended in OKLab, so pink into orange stays clean.
	vec4 ramp(float x) {
		x = clamp(x, 0.0, 1.0);
		for (int i = 0; i < 3; i++) {
			if (x <= uRampX[i + 1]) {
				float t = smoothstep(0.0, 1.0, (x - uRampX[i]) / (uRampX[i + 1] - uRampX[i]));
				vec4 m = mix(uRamp[i], uRamp[i + 1], t);
				return vec4(fromLab(m.rgb), m.a);
			}
		}
		return vec4(fromLab(uRamp[3].rgb), uRamp[3].a);
	}
	vec4 over(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }
	vec4 paint(vec3 rgb, float a) { return vec4(rgb, 1.0) * clamp(a, 0.0, 1.0); }
	// How much of a point (view space) shows: none where the model stands in front.
	float seen(vec3 pos) {
		if (!uHasDepth) return 1.0;
		float sceneZ = perspectiveDepthToViewZ(texture2D(tDepth, gl_FragCoord.xy / uRes).x, uNear, uFar);
		return 1.0 - smoothstep(uBias, uBias * 3.0, sceneZ - pos.z);
	}
	// Brightened, its coverage kept to 1 at most.
	vec4 gain(vec4 col) { return vec4(col.rgb * uGain, min(col.a, 1.0)); }`;

// FlowMapEnergy's heat(), for one pipe, always inside it: `arc` along the
// route and `sd` across it (signed), in the diagram's units.
const SLEEVE_FS = /* glsl */ `
	${SHARED_FS}
	uniform float uPeriod, uTail, uTime, uSpeed, uLevel;
	uniform float uCore, uGlow, uGlowAmount, uAmbient, uFlicker;
	uniform float uFill, uWall, uSparks, uTempAmount, uAgitation, uContrast, uCoolLevel, uBore;
	uniform vec3 uCool;
	uniform float uPxPerDepth, uScale;
	varying float vArc;
	varying float vTemp;
	varying float vUnit;
	varying float vSleeve;
	varying vec3 vNormal;
	varying vec3 vAxis;
	varying vec3 vPos;

	float hash(float n) { return fract(sin(n) * 43758.5453); }
	float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
	float noise2(vec2 p) {
		vec2 i = floor(p), f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
	}
	vec3 tint(vec3 rgb, float temp) { return mix(uCool, rgb, temp); }

	vec4 heat(float arc, float sd, float px) {
		float dist = abs(sd);
		// Behind the nearest head, and before the next; ahead of the first
		// head, nothing has come yet.
		float run = uTime * uSpeed - arc;
		float d = run < 0.0 ? 1e9 : mod(run, uPeriod);
		float ahead = run < 0.0 ? -run : uPeriod - d;
		float temp = mix(1.0, vTemp, uTempAmount);
		temp = mix(temp, smoothstep(0.3, 0.7, temp), uContrast);
		float agit = mix(1.0, temp, uAgitation);
		float bore = 1.0 - smoothstep(uBore - 1.2, uBore + px, dist);
		if (d >= uTail && ahead > 70.0) return paint(tint(ramp(0.6).rgb, temp), uAmbient * temp * bore * 0.5);

		float trail = d < uTail ? pow(1.0 - d / uTail, 1.6) : 0.0;
		float lead = 1.0 - smoothstep(0.0, 3.0, ahead);
		float I = max(trail, lead);
		float head = min(1.0, exp(-d * d / 392.0) * step(d, uTail) + exp(-ahead * ahead / 18.0));
		// Where it is along the trail, by distance, tail (0) to head (1): the
		// colour's place on the ramp, one for every layer here, so the trail
		// reads as one gradient.
		float pos = max(max(d < uTail ? 1.0 - d / uTail : 0.0, lead), head);
		vec4 hue = ramp(pos);
		vec3 rgb = tint(hue.rgb, temp);

		// The turbulence: in the brightness only, never the colour.
		float along = arc - uTime * uSpeed * 1.25;
		float n = noise2(vec2(along * 0.045, sd * 0.2)) * 0.65 + noise2(vec2(along * 0.012, sd * 0.07 + 3.1)) * 0.35;
		float stir = mix(1.0, 0.55 + 0.9 * n, uFlicker * agit * (1.0 - head));

		float sigma = max(uGlow * 0.5 * mix(0.55, 1.0, agit), 0.5);
		float ha = ramp(max(pos, head * 0.9) * 0.75).a * stir;
		vec4 col = paint(rgb, ha * exp(-dist * dist / (2.0 * sigma * sigma)) * uGlowAmount * mix(0.4, 1.0, agit));

		float soft = max(trail, exp(-ahead * ahead / 450.0));
		float Is = soft * stir;
		float wall = exp(-pow((dist - uBore - 1.0) / 1.6, 2.0)) * uWall * mix(0.35, 1.0, agit) * soft;
		col = over(paint(rgb, wall * 0.8), col);
		float centre = 1.0 - 0.35 * dist / uBore;
		col = over(paint(tint(ramp(0.6).rgb, temp), uAmbient * temp * bore * 0.5), col);
		col = over(paint(rgb, uFill * mix(0.45, 1.0, agit) * Is * bore * centre), col);
		float s = arc - uTime * uSpeed * 1.6;
		float ci = floor(s / 28.0);
		float fr = s - ci * 28.0;
		float live = step(0.45, hash(ci + 17.0));
		float oa = 6.0 + hash(ci * 1.37) * 16.0;
		float oc = (hash(ci * 2.91) - 0.5) * 1.5 * uBore;
		float dd2 = (fr - oa) * (fr - oa) + (sd - oc) * (sd - oc);
		float spark = exp(-dd2 / 5.0) * live * (0.5 + 0.5 * hash(ci * 5.3)) * smoothstep(0.02, 0.3, I) * uSparks * agit * agit;
		col = over(paint(tint(ramp(1.0).rgb, temp), spark * bore), col);

		float halfw = uCore * 0.5 * (1.0 + 0.9 * head);
		float core = 1.0 - smoothstep(halfw * 0.45, halfw + px, dist);
		vec3 hot = mix(rgb, tint(ramp(1.0).rgb, temp), head * 0.7);
		return over(paint(hot, max(hue.a * stir, head) * core), col) * mix(uCoolLevel, 1.0, temp);
	}

	void main() {
		// Across the pipe as the camera sees it: the axis, the view's
		// direction square to it, and the side between them. On a round
		// sleeve, how far its surface leans to that side is how far across.
		vec3 t = normalize(vAxis);
		vec3 v = normalize(-vPos);
		vec3 facing = normalize(v - t * dot(v, t));
		vec3 side = normalize(cross(t, facing));
		float sd = dot(normalize(vNormal), side) * vSleeve / vUnit;
		// A screen pixel here, in the diagram's units, for antialiasing.
		float px = uPxPerDepth * -vPos.z / uScale / vUnit;
		gl_FragColor = gain(heat(vArc, sd, px) * uLevel) * seen(vPos);
	}`;


const QUAD_VS = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}`;

/** 13 taps, halving: the bloom's way down (as in Jimenez's Call of Duty bloom). */
const DOWN_FS = /* glsl */ `
	uniform sampler2D tMap;
	uniform vec2 uTexel;
	varying vec2 vUv;
	vec4 at(float x, float y) { return texture2D(tMap, vUv + uTexel * vec2(x, y)); }
	void main() {
		gl_FragColor = at(0.0, 0.0) * 0.125
			+ (at(-1.0, 1.0) + at(1.0, 1.0) + at(-1.0, -1.0) + at(1.0, -1.0)) * 0.125
			+ (at(0.0, 2.0) + at(-2.0, 0.0) + at(2.0, 0.0) + at(0.0, -2.0)) * 0.0625
			+ (at(-2.0, 2.0) + at(2.0, 2.0) + at(-2.0, -2.0) + at(2.0, -2.0)) * 0.03125;
	}`;

/** A 3×3 tent, doubling: the way back up, added onto each size's own. */
const UP_FS = /* glsl */ `
	uniform sampler2D tMap;
	uniform vec2 uTexel;
	varying vec2 vUv;
	vec4 at(float x, float y) { return texture2D(tMap, vUv + uTexel * vec2(x, y)); }
	void main() {
		gl_FragColor = (at(0.0, 0.0) * 4.0
			+ (at(0.0, 1.0) + at(-1.0, 0.0) + at(1.0, 0.0) + at(0.0, -1.0)) * 2.0
			+ (at(-1.0, 1.0) + at(1.0, 1.0) + at(-1.0, -1.0) + at(1.0, -1.0))) / 16.0;
	}`;

/** The trails over the frame, as the diagram's canvas lies over its drawing, and their bloom added. */
const COMPOSITE_FS = /* glsl */ `
	uniform sampler2D tBase;
	uniform sampler2D tTrails;
	uniform sampler2D tBloom;
	uniform float uBloom;
	varying vec2 vUv;
	void main() {
		vec4 base = texture2D(tBase, vUv);
		vec4 trails = texture2D(tTrails, vUv);
		vec4 col = trails + base * (1.0 - trails.a);
		// Light: added, coverage left as it was, so over the backdrop it adds to that too.
		col.rgb += texture2D(tBloom, vUv).rgb * uBloom;
		gl_FragColor = col;
	}`;

/** A #rrggbb display colour in OKLab (Björn Ottosson's), where blends between colours look even. */
function oklab(hex: string): [number, number, number] {
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

const target = () =>
	new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

/** What the trails need of the viewer they're drawn over (ModelViewer). */
export interface TrailsHost {
	camera: THREE.PerspectiveCamera;
	root: THREE.Object3D;
	/** The model's depth this frame, if the viewer draws one. */
	sceneDepth: THREE.DepthTexture | null;
	toRoot(at: THREE.Vector3): THREE.Vector3;
}

export class EnergyTrails extends Pass {
	private scene = new THREE.Scene();
	/** The trails' sleeves, turned with the model; rebuilt as their reach changes. */
	private group = new THREE.Group();
	private material: THREE.ShaderMaterial;
	private trails = target();
	private chain: THREE.WebGLRenderTarget[] = [];
	private quad = new FullScreenQuad();
	private down = new THREE.ShaderMaterial({
		uniforms: { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } },
		vertexShader: QUAD_VS,
		fragmentShader: DOWN_FS,
		depthTest: false,
		depthWrite: false
	});
	private up = new THREE.ShaderMaterial({
		uniforms: { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } },
		vertexShader: QUAD_VS,
		fragmentShader: UP_FS,
		depthTest: false,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
	private composite = new THREE.ShaderMaterial({
		uniforms: { tBase: { value: null }, tTrails: { value: null }, tBloom: { value: null }, uBloom: { value: DEFAULT_TRAIL_LOOK.bloom } },
		vertexShader: QUAD_VS,
		fragmentShader: COMPOSITE_FS,
		depthTest: false,
		depthWrite: false
	});
	private level = 0;
	/** When the pulses set off, seconds (performance.now). */
	private start = 0;
	private size = new THREE.Vector2(1, 1);
	private clearColor = new THREE.Color();
	private place = new THREE.Matrix4();
	private look: TrailLook = { ...DEFAULT_TRAIL_LOOK };
	/** How far out the sleeves were built, diagram units. */
	private reach = 0;
	private tail = DEFAULT_TRAIL_PARAMS.tail;

	/** Where this model's tuning starts (the defaults, with its set's own). */
	readonly params: EnergyParams;
	readonly initialLook: TrailLook;
	private routes: TrailRoute[];

	constructor(
		set: TrailSet,
		private host: TrailsHost
	) {
		super();
		this.routes = set.routes;
		const p = (this.params = { ...DEFAULT_TRAIL_PARAMS, ...set.params });
		this.initialLook = { ...DEFAULT_TRAIL_LOOK, ...set.look };
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uPeriod: { value: DEFAULT_TRAIL_LOOK.spacing },
				uTail: { value: 0 },
				uTime: { value: 0 },
				uSpeed: { value: p.speed },
				uLevel: { value: 0 },
				uGain: { value: DEFAULT_TRAIL_LOOK.brightness },
				uCore: { value: p.core },
				uGlow: { value: p.glow },
				uGlowAmount: { value: p.glowAmount },
				uAmbient: { value: p.ambient },
				uFlicker: { value: p.flicker },
				uFill: { value: p.fill },
				uWall: { value: p.wallLight },
				uSparks: { value: p.sparks },
				uTempAmount: { value: p.temperature },
				uAgitation: { value: p.agitation ?? 0 },
				uContrast: { value: p.contrast ?? 0 },
				uCoolLevel: { value: p.coolLevel ?? 1 },
				uBore: { value: BORE },
				// The dark stage's ramp, its stops and colours as the look sets them.
				uRamp: { value: RAMPS.dark.map((s) => new THREE.Vector4(0, 0, 0, s.a)) },
				uRampX: { value: RAMPS.dark.map((s) => s.x) },
				uCool: { value: new THREE.Vector3(...COOL.dark.map((c) => c / 255)) },
				uPxPerDepth: { value: 1 },
				uScale: { value: 1 },
				tDepth: { value: null },
				uHasDepth: { value: false },
				uRes: { value: new THREE.Vector2(1, 1) },
				uNear: { value: 0.1 },
				uFar: { value: 100 },
				uBias: { value: 0.01 }
			},
			vertexShader: SLEEVE_VS,
			fragmentShader: SLEEVE_FS,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			// Premultiplied, one route over another.
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor
		});
		this.setParams(p);
		this.setLook(this.initialLook);
		this.group.matrixAutoUpdate = false;
		this.scene.add(this.group);
		this.place.makeTranslation(host.toRoot(new THREE.Vector3()));
		this.needsSwap = true;
		this.enabled = false;
	}

	/** Shown, 0 to 1. Coming in from nothing, the first pulses set off from the start again. */
	setLevel(level: number) {
		if (this.level <= 0 && level > 0) this.start = performance.now() / 1000;
		this.level = level;
		this.material.uniforms.uLevel.value = level;
		this.enabled = level > 0.001;
	}


	/** The diagram's parameters (EnergyControls), live. */
	setParams(p: EnergyParams) {
		const u = this.material.uniforms;
		// A tail can't reach past the pulse ahead of it.
		this.tail = p.tail;
		u.uTail.value = Math.min(p.tail, u.uPeriod.value * 0.95);
		u.uSpeed.value = p.speed;
		u.uCore.value = p.core;
		u.uGlow.value = p.glow;
		u.uGlowAmount.value = p.glowAmount;
		u.uAmbient.value = p.ambient;
		u.uFlicker.value = p.flicker;
		u.uFill.value = p.fill;
		u.uWall.value = p.wallLight;
		u.uSparks.value = p.sparks;
		u.uTempAmount.value = p.temperature;
		u.uAgitation.value = p.agitation ?? 0;
		u.uContrast.value = p.contrast ?? 0;
		u.uCoolLevel.value = p.coolLevel ?? 1;
		// The sleeves reach as far out as the light on the walls, the halo or
		// the head-widened core does (FlowMapEnergy's uCut): rebuilt if that grows.
		const reach = Math.max(p.glow * 1.6, BORE + 5, p.core * 1.2);
		if (reach !== this.reach) {
			this.reach = reach;
			this.group.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
			this.group.clear();
			for (const route of this.routes) this.group.add(new THREE.Mesh(sleeve(route, reach), this.material));
		}
	}

	/** What the trails add in 3D (`TrailLook`), live. */
	setLook(look: TrailLook) {
		const u = this.material.uniforms;
		u.uGain.value = look.brightness;
		u.uPeriod.value = look.spacing;
		u.uTail.value = Math.min(this.tail, look.spacing * 0.95);
		this.composite.uniforms.uBloom.value = look.bloom;
		// Tail, tail at its fullest, body, head. Display colours, as the
		// diagram's: the trails are drawn after tone mapping.
		// In OKLab, for the shader to blend between.
		const [tail, full, body, head] = u.uRamp.value as THREE.Vector4[];
		tail.set(...oklab(look.tail), 0);
		full.set(...oklab(look.tail), look.tailOpacity);
		body.set(...oklab(look.body), 1);
		head.set(...oklab(look.head), 1);
		// The tail at its fullest halfway into the stretch before the body.
		const x = u.uRampX.value as number[];
		x[2] = THREE.MathUtils.clamp(look.bodyFrom, 0.02, 0.99);
		x[1] = x[2] / 2;
		const resize = Math.round(look.reach) !== Math.round(this.look.reach);
		this.look = { ...look };
		if (resize) this.setSize(this.size.x, this.size.y);
	}

	/** Whether it moves on its own: frames have to keep coming. */
	get animated() {
		return this.enabled;
	}

	setSize(width: number, height: number) {
		this.size.set(width, height);
		this.trails.setSize(width, height);
		this.chain.forEach((t) => t.dispose());
		this.chain = [];
		let [w, h] = [width, height];
		for (let i = 0; i < Math.max(1, Math.round(this.look.reach)); i++) {
			w = Math.max(1, Math.round(w / 2));
			h = Math.max(1, Math.round(h / 2));
			const t = target();
			t.setSize(w, h);
			this.chain.push(t);
		}
	}

	render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
		const { camera, root, sceneDepth } = this.host;
		const u = this.material.uniforms;
		const now = performance.now() / 1000;
		u.uTime.value = now - this.start;
		// Turned with the model, in its authored frame.
		this.group.matrix.multiplyMatrices(root.matrixWorld, this.place);
		const scale = root.matrixWorld.getMaxScaleOnAxis();
		u.uScale.value = scale;
		u.uPxPerDepth.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / this.size.y;
		u.uRes.value.copy(this.size);
		u.tDepth.value = sceneDepth;
		u.uHasDepth.value = !!sceneDepth;
		u.uNear.value = camera.near;
		u.uFar.value = camera.far;
		u.uBias.value = 0.012 * scale;

		const autoClear = renderer.autoClear;
		const clearAlpha = renderer.getClearAlpha();
		renderer.getClearColor(this.clearColor);
		renderer.autoClear = false;
		renderer.setClearColor(0x000000, 0);

		// The trails on their own.
		renderer.setRenderTarget(this.trails);
		renderer.clear();
		renderer.render(this.scene, camera);

		// Their bloom: down the chain, then back up, each size adding the one below it.
		let from: THREE.WebGLRenderTarget = this.trails;
		this.quad.material = this.down;
		for (const t of this.chain) {
			this.down.uniforms.tMap.value = from.texture;
			this.down.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
			renderer.setRenderTarget(t);
			this.quad.render(renderer);
			from = t;
		}
		this.quad.material = this.up;
		for (let i = this.chain.length - 2; i >= 0; i--) {
			const below = this.chain[i + 1];
			this.up.uniforms.tMap.value = below.texture;
			this.up.uniforms.uTexel.value.set(1 / below.width, 1 / below.height);
			renderer.setRenderTarget(this.chain[i]);
			this.quad.render(renderer);
		}

		// Over the frame.
		this.composite.uniforms.tBase.value = readBuffer.texture;
		this.composite.uniforms.tTrails.value = this.trails.texture;
		this.composite.uniforms.tBloom.value = this.chain[0]?.texture ?? null;
		this.quad.material = this.composite;
		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
		this.quad.render(renderer);

		renderer.autoClear = autoClear;
		renderer.setClearColor(this.clearColor, clearAlpha);
	}

	dispose() {
		this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
		for (const m of [this.material, this.down, this.up, this.composite]) m.dispose();
		this.trails.dispose();
		this.chain.forEach((t) => t.dispose());
		this.quad.dispose();
	}
}
