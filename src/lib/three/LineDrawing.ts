import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { CAP } from './CadViewer';

/**
 * Turns a rendered scene into a line drawing, like a technical
 * illustration: every visible surface's view-space normal and distance go
 * to a buffer, and a full-screen pass draws ink wherever either breaks —
 * creases (the normal turns), steps and silhouettes (the distance jumps),
 * and the outline against the background — on flat paper. Hidden lines go
 * for free, since only the nearest surface is in the buffer, and it works
 * on any geometry, instanced or cut, without building edge meshes.
 * Through a section cut, the parts' insides are hatched like a section
 * drawing.
 *
 * Antialiased by supersampling: it all runs at twice the canvas's
 * resolution each way, and a last pass smooths the remaining stair-steps
 * (FXAA) and averages each 2×2 down to one pixel. Without it, in a
 * near-flat view, edges a degree or two off vertical step a pixel sideways
 * every few rows and read as zigzags. To keep that affordable the surfaces
 * are packed into half floats (see PACKING), and very large canvases
 * supersample less than 2× (SUPERSAMPLE_BUDGET).
 */

/** Supersampling, each way, and the most pixels it may take (about 4K at 1.5×). */
const SUPERSAMPLE = 2;
const SUPERSAMPLE_BUDGET = 20_000_000;

/**
 * A surface sample in four half floats: the normal octahedron-encoded in
 * two, and the signed distance split into a half and the remainder, which
 * keeps it to about a ten-millionth (a float's precision, near enough).
 * Background is all zeros.
 */
const PACKING = /* glsl */ `
vec2 signNotZero(vec2 v) { return vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); }
vec4 pack(vec3 n, float w) {
	n /= abs(n.x) + abs(n.y) + abs(n.z);
	vec2 o = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * signNotZero(n.xy);
	float hi = unpackHalf2x16(packHalf2x16(vec2(w, 0.0))).x;
	return vec4(o, hi, w - hi);
}
vec4 unpack(vec4 t) {
	vec3 n = vec3(t.xy, 1.0 - abs(t.x) - abs(t.y));
	if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * signNotZero(n.xy);
	return vec4(normalize(n), t.z + t.w);
}
`;

/** View-space normal (turned to face the camera) and distance; distance is negative on a section's insides. */
function surfaceMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: { capOn: CAP.capOn },
		vertexShader: /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vNormal;
varying vec3 vView;
void main() {
	#include <beginnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <project_vertex>
	#include <clipping_planes_vertex>
	vNormal = transformedNormal;
	vView = mvPosition.xyz;
}`,
		fragmentShader: /* glsl */ `
#include <clipping_planes_pars_fragment>
uniform float capOn;
${PACKING}
varying vec3 vNormal;
varying vec3 vView;
void main() {
	#include <clipping_planes_fragment>
	// Facet normals where the geometry has none.
	vec3 n = dot(vNormal, vNormal) > 0.01 ? normalize(vNormal) : normalize(cross(dFdx(vView), dFdy(vView)));
	// CAD shells wind both ways: face the camera rather than trust the side.
	if (dot(n, vView) > 0.0) n = -n;
	float d = -vView.z;
	gl_FragColor = pack(n, capOn > 0.5 && !gl_FrontFacing ? -d : d);
}`,
		side: THREE.DoubleSide,
		clipping: true
	});
}

/**
 * Seals pinholes and slivers, the detail too small to draw. Tessellated CAD
 * leaves hairline cracks along the seams between faces, and sub-millimetre
 * ledges where shell sections meet, seen edge-on as a pixel-wide strip
 * facing another way; shaded they vanish, but here each inks a speck. A
 * pixel or two lying behind or flush with a continuous surface on either
 * side takes that surface instead. Anything standing in front of it — a
 * pipe, a wire — is kept.
 */
function patchMaterial(surfaces: THREE.Texture | null = null, earlyOut = false) {
	return new THREE.ShaderMaterial({
		defines: earlyOut ? { EARLY_OUT: '' } : {},
		uniforms: {
			surfaces: { value: surfaces },
			texel: { value: new THREE.Vector2() },
			footprint: { value: 0.001 }
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
		fragmentShader: /* glsl */ `
uniform sampler2D surfaces;
uniform vec2 texel;
uniform float footprint;
varying vec2 vUv;
${PACKING}

vec4 at(vec2 o) { return unpack(texture2D(surfaces, vUv + o * texel)); }

// a and b, either side of c across a gap of span pixels, as one surface c doesn't stand in front of.
bool sealed(vec4 c, vec4 a, vec4 b, float span, out vec4 fill) {
	if (a.w == 0.0 || b.w == 0.0 || sign(a.w) != sign(b.w)) return false;
	float d = min(abs(a.w), abs(b.w));
	float px = d * footprint;
	if (abs(abs(a.w) - abs(b.w)) > 2.0 * span * px || dot(a.xyz, b.xyz) < 0.95) return false;
	// In front of the surface by more than the slope across the gap allows.
	if (c.w != 0.0 && sign(c.w) == sign(a.w) && abs(c.w) < d - span * px) return false;
	fill = vec4(normalize(a.xyz + b.xyz), (a.w + b.w) / 2.0);
	return true;
}

// Whether c lies on one smooth surface with a and b, either side of it:
// all there, the same way up, facing about the same way, and c on the line
// between them to within half a pixel (so a pinhole, sitting behind, isn't).
bool through(vec4 a, vec4 c, vec4 b) {
	if (a.w == 0.0 || b.w == 0.0 || sign(a.w) != sign(c.w) || sign(b.w) != sign(c.w)) return false;
	if (dot(a.xyz, c.xyz) < 0.95 || dot(b.xyz, c.xyz) < 0.95) return false;
	return abs((abs(a.w) + abs(b.w)) / 2.0 - abs(c.w)) <= 0.5 * abs(c.w) * footprint;
}

void main() {
	vec4 raw = texture2D(surfaces, vUv);
	vec4 c = unpack(raw);
	#ifdef EARLY_OUT
	// Most pixels lie inside a smooth surface or in open background, where
	// there's nothing to seal: settle those from the four neighbours alone.
	// (A pixel kept this way could at most have taken a near-identical fill.)
	vec4 l = at(vec2(-1.0, 0.0));
	vec4 r = at(vec2(1.0, 0.0));
	vec4 d = at(vec2(0.0, -1.0));
	vec4 u = at(vec2(0.0, 1.0));
	if (c.w == 0.0 ? l.w == 0.0 && r.w == 0.0 && d.w == 0.0 && u.w == 0.0 : through(l, c, r) && through(d, c, u)) {
		gl_FragColor = raw;
		return;
	}
	#endif
	vec4 fill;
	// Gaps one to three pixels across (up to about one and a half screen pixels), either way.
	for (int g = 1; g <= 3; g++) {
		for (int i = 1; i <= g; i++) {
			float lo = -float(i);
			float hi = float(g + 1 - i);
			float span = float(g + 1);
			if (sealed(c, at(vec2(lo, 0.0)), at(vec2(hi, 0.0)), span, fill) ||
				sealed(c, at(vec2(0.0, lo)), at(vec2(0.0, hi)), span, fill)) {
				gl_FragColor = pack(fill.xyz, fill.w);
				return;
			}
		}
	}
	gl_FragColor = raw;
}`,
		depthTest: false,
		depthWrite: false
	});
}

function inkMaterial(surfaces: THREE.Texture | null = null) {
	return new THREE.ShaderMaterial({
		uniforms: {
			surfaces: { value: surfaces },
			texel: { value: new THREE.Vector2() },
			weight: { value: 0.5 },
			cssPixel: { value: 1 },
			footprint: { value: 0.001 }
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
		fragmentShader: /* glsl */ `
#define R 8
uniform sampler2D surfaces;
uniform vec2 texel;
uniform float weight;
uniform float cssPixel;
uniform float footprint;
varying vec2 vUv;
${PACKING}

vec4 at(vec2 o) { return unpack(texture2D(surfaces, vUv + o * texel)); }

// How far a depth runs off the line its neighbour's slope predicts, or a large value without one.
float offSlope(vec4 from, vec4 prev, vec4 to) {
	return prev.w == 0.0 || sign(prev.w) != sign(from.w) ? 1e9 : abs(abs(to.w) - (2.0 * abs(from.w) - abs(prev.w)));
}

// Whether the surface breaks between neighbouring pixels a and b; a0 and b1 continue the row outwards.
float edge(vec4 a0, vec4 a, vec4 b, vec4 b1) {
	bool ba = a.w == 0.0, bb = b.w == 0.0;
	if (ba && bb) return 0.0;
	// The outline: model against background.
	if (ba != bb) return 1.0;
	// Into a section's inside.
	if (sign(a.w) != sign(b.w)) return 1.0;
	// A step in depth: neither side's slope carries on to the other. Measured
	// in pixel footprints at that depth, so coplanar faces fighting by a
	// fraction of a millimetre stay clean while real steps don't.
	float d = min(abs(a.w), abs(b.w));
	float step = min(offSlope(a, a0, b), offSlope(b, b1, a)) / (d * footprint);
	float depth = smoothstep(1.5, 3.0, step);
	// A crease: the normal turns.
	float fold = smoothstep(0.1, 0.25, 1.0 - dot(a.xyz, b.xyz));
	return max(depth, fold);
}

void main() {
	// Line width in buffer pixels. Each edge lies on the boundary between two
	// pixels, and a pixel takes ink by how much of the line covers it.
	float width = weight * cssPixel;
	vec4 c = at(vec2(0.0));
	float e = 0.0;
	for (int k = -R; k < R; k++) {
		// The boundary between k and k + 1, this far from the pixel's centre.
		float dist = abs(float(k) + 0.5);
		float cover = clamp(width / 2.0 - dist + 0.5, 0.0, 1.0);
		if (cover <= 0.0) continue;
		float o = float(k);
		e = max(e, cover * edge(at(vec2(o - 1.0, 0.0)), at(vec2(o, 0.0)), at(vec2(o + 1.0, 0.0)), at(vec2(o + 2.0, 0.0))));
		e = max(e, cover * edge(at(vec2(0.0, o - 1.0)), at(vec2(0.0, o)), at(vec2(0.0, o + 1.0)), at(vec2(0.0, o + 2.0))));
	}

	// Section hatching at 45°.
	if (c.w < 0.0) {
		float spacing = 3.5 * cssPixel;
		float h = abs(mod(gl_FragCoord.x + gl_FragCoord.y, spacing) - spacing / 2.0);
		e = max(e, 0.6 * clamp(width / 2.0 - h + 0.5, 0.0, 1.0));
	}

	// How much ink, and whether the model is here, for the last pass to colour.
	gl_FragColor = vec4(e, c.w == 0.0 ? 0.0 : 1.0, 0.0, 1.0);
}`,
		blending: THREE.NoBlending,
		depthTest: false,
		depthWrite: false
	});
}

/**
 * Brings the supersampled ink down to the screen and colours it: FXAA at
 * each of the screen pixel's 2×2 samples, averaged. FXAA runs on the ink
 * amount alone, so it works the same whatever the ink and paper, and only
 * along stair-steps, leaving straight lines crisp; its edge search is
 * lengthened (about 34 pixels each way, from 12) for the long shallow
 * steps of nearly upright lines.
 */
function smoothMaterial(lines: THREE.Texture | null = null) {
	const fragmentShader = FXAAShader.fragmentShader
		.replace('#define EDGE_STEP_COUNT 6', '#define EDGE_STEP_COUNT 10')
		.replace('#define EDGE_STEPS 1.0, 1.5, 2.0, 2.0, 2.0, 4.0', '#define EDGE_STEPS 1.0, 1.5, 2.0, 2.0, 2.0, 2.0, 4.0, 4.0, 8.0, 8.0')
		.replace('#define EDGE_GUESS 8.0', '#define EDGE_GUESS 16.0')
		// No blending of lone pixels: it would soften every one-pixel line, not just the steps.
		.replace('float _SubpixelBlending = 1.0;', 'float _SubpixelBlending = 0.0;')
		// The ink amount is in red; green is the model's mask.
		.replace('return dot( Sample( tex2D, uv ).rgb, vec3( 0.3, 0.59, 0.11 ) );', 'return Sample( tex2D, uv ).r;')
		.replace(
			/void main\(\) \{[\s\S]*\}\s*$/,
			`uniform vec3 ink;
uniform vec3 paper;
uniform float amount;
uniform float inkOpacity;
uniform vec2 samples;
void main() {
	// The 2×2 samples, a quarter of a screen pixel either side of its centre.
	vec2 h = resolution.xy * samples * 0.25;
	vec2 l = (
		ApplyFXAA(tDiffuse, resolution.xy, vUv + vec2(-h.x, -h.y)).rg +
		ApplyFXAA(tDiffuse, resolution.xy, vUv + vec2(h.x, -h.y)).rg +
		ApplyFXAA(tDiffuse, resolution.xy, vUv + vec2(-h.x, h.y)).rg +
		ApplyFXAA(tDiffuse, resolution.xy, vUv + vec2(h.x, h.y)).rg
	) / 4.0;
	l.r *= inkOpacity;
	// Of the pixel, ink covers l.r, paper the rest of the model's share
	// (l.g), and the background shows through what's left.
	float a = max(l.g, l.r);
	vec3 color = a > 0.0 ? (ink * l.r + paper * (a - l.r)) / a : paper;
	gl_FragColor = vec4(color, amount * a);
}`
		);
	if (!['uniform float amount', '_SubpixelBlending = 0.0', 'return Sample( tex2D, uv ).r;'].every((t) => fragmentShader.includes(t)))
		throw new Error('FXAAShader has changed shape');
	return new THREE.ShaderMaterial({
		uniforms: {
			tDiffuse: { value: lines },
			resolution: { value: new THREE.Vector2() },
			/** Buffer pixels per screen pixel, each way. */
			samples: { value: new THREE.Vector2(1, 1) },
			ink: { value: new THREE.Color(0x111111) },
			paper: { value: new THREE.Color(0xffffff) },
			inkOpacity: { value: 1 },
			amount: { value: 1 }
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false
	});
}

/** One quality's buffers: the surfaces, the surfaces patched, and the ink amount, at one size. */
interface Tier {
	/** The surfaces, packed (PACKING). */
	target: THREE.WebGLRenderTarget;
	/** The surfaces with their pinholes sealed, which the ink reads. */
	patched: THREE.WebGLRenderTarget;
	/** The ink amount (red) and the model's mask (green) per pixel, before they're brought down to the screen. */
	lines: THREE.WebGLRenderTarget;
}

function tier(): Tier {
	const surfaces = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
	return {
		target: new THREE.WebGLRenderTarget(1, 1, surfaces),
		patched: new THREE.WebGLRenderTarget(1, 1, { ...surfaces, depthBuffer: false }),
		lines: new THREE.WebGLRenderTarget(1, 1, {
			format: THREE.RGFormat,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			depthBuffer: false
		})
	};
}

/**
 * Two qualities: `final` for a still frame, `draft` for frames in motion.
 * Both supersample fully by default, so motion looks exactly like rest; a
 * caller short of time lowers the draft's (CadViewer's web mode does, on a
 * device that can't keep up), and shows the final once things settle. Each
 * keeps its own buffers, made on first use.
 */
export type Quality = 'draft' | 'final';

export class LineDrawing {
	/** Supersampling for each quality, each way (the final one also held to SUPERSAMPLE_BUDGET). */
	readonly supersample: Record<Quality, number> = { draft: SUPERSAMPLE, final: SUPERSAMPLE };
	private tiers: Partial<Record<Quality, Tier>> = {};
	private surfaces = surfaceMaterial();
	// Their inputs are set per render, from the quality's buffers.
	private patch: THREE.ShaderMaterial;
	private ink = inkMaterial();
	private smooth = smoothMaterial();
	private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ink);
	private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

	/**
	 * `fast` (the site's web-optimized drawing) lets the pinhole pass skip
	 * the pixels that can't need it, about half its cost; the result differs
	 * in about one ink pixel in two thousand. /cad leaves it off.
	 */
	constructor(
		private renderer: THREE.WebGLRenderer,
		{ fast = false }: { fast?: boolean } = {}
	) {
		this.patch = patchMaterial(null, fast);
		this.quad.frustumCulled = false;
	}

	/** 0 shows the shaded model, 1 the drawing alone; between, the paper fades in over it. */
	set amount(v: number) {
		this.smooth.uniforms.amount.value = v;
	}

	/** Line weight in CSS pixels, from a hairline (0.25) to 3. */
	set weight(v: number) {
		this.ink.uniforms.weight.value = v;
	}

	/** The ink, laid at `opacity` over the paper (as a drawing's tone is a group opacity of its ink). */
	setColors(ink: THREE.ColorRepresentation, paper: THREE.ColorRepresentation, opacity = 1) {
		// Written after tone mapping, straight to the screen: sRGB as given.
		this.smooth.uniforms.ink.value.set(ink).convertLinearToSRGB();
		this.smooth.uniforms.paper.value.set(paper).convertLinearToSRGB();
		this.smooth.uniforms.inkOpacity.value = opacity;
	}

	/**
	 * Compiles every program the drawing will use ahead of its first frame,
	 * without blocking where the browser compiles in parallel: the passes,
	 * and the surfaces both whole and cut by `plane` (a section); `extra`
	 * adds a caller's own (the labels' visibility pass).
	 */
	async precompile(camera: THREE.Camera, plane: THREE.Plane, extra: THREE.Material[] = []) {
		const r = this.renderer;
		const scene = new THREE.Scene();
		for (const m of [this.surfaces, this.patch, this.ink, this.smooth, ...extra]) {
			const mesh = new THREE.Mesh(this.quad.geometry, m);
			mesh.frustumCulled = false;
			scene.add(mesh);
		}
		const planes = r.clippingPlanes;
		try {
			r.clippingPlanes = [];
			await r.compileAsync(scene, camera);
			r.clippingPlanes = [plane];
			await r.compileAsync(scene, camera);
		} finally {
			r.clippingPlanes = planes;
		}
	}

	/** Draws over whatever the canvas already holds (the shaded render, while fading). */
	render(scene: THREE.Scene, camera: THREE.Camera, quality: Quality = 'final') {
		this.prepare(scene, camera, quality);
		this.composite(quality);
	}

	/**
	 * Draws the drawing at `quality` into that quality's buffers, without
	 * putting it on screen (`composite` does), so a quality drawn earlier can
	 * be shown again, or blended with another, for next to nothing.
	 */
	prepare(scene: THREE.Scene, camera: THREE.Camera, quality: Quality) {
		const r = this.renderer;
		const screen = r.getDrawingBufferSize(new THREE.Vector2());
		const limit = r.capabilities.maxTextureSize;
		const scale = Math.min(
			this.supersample[quality],
			Math.sqrt(SUPERSAMPLE_BUDGET / (screen.x * screen.y)),
			limit / screen.x,
			limit / screen.y
		);
		const size = screen.clone().multiplyScalar(Math.max(1, scale)).floor();
		const t = (this.tiers[quality] ??= tier());
		if (t.target.width !== size.x || t.target.height !== size.y) {
			t.target.setSize(size.x, size.y);
			t.patched.setSize(size.x, size.y);
			t.lines.setSize(size.x, size.y);
		}
		this.patch.uniforms.surfaces.value = t.target.texture;
		this.ink.uniforms.surfaces.value = t.patched.texture;
		// Buffer pixels per CSS pixel.
		this.ink.uniforms.cssPixel.value = (r.getPixelRatio() * size.y) / screen.y;
		// A buffer pixel's size on a surface one unit away.
		const fov = (camera as THREE.PerspectiveCamera).fov ?? 35;
		const footprint = (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / size.y;
		for (const m of [this.patch, this.ink]) {
			m.uniforms.texel.value.set(1 / size.x, 1 / size.y);
			m.uniforms.footprint.value = footprint;
		}

		const clearAlpha = r.getClearAlpha();
		const planes = r.clippingPlanes;
		scene.overrideMaterial = this.surfaces;
		r.setRenderTarget(t.target);
		r.setClearAlpha(0);
		r.clear();
		r.render(scene, camera);
		scene.overrideMaterial = null;

		r.clippingPlanes = [];
		this.quad.material = this.patch;
		r.setRenderTarget(t.patched);
		r.render(this.quad, this.quadCamera);
		this.quad.material = this.ink;
		r.setRenderTarget(t.lines);
		r.render(this.quad, this.quadCamera);
		r.setRenderTarget(null);
		r.setClearAlpha(clearAlpha);
		r.clippingPlanes = planes;
	}

	/**
	 * Puts the drawing last prepared at `quality` on screen, over whatever the
	 * canvas holds, at `alpha`: under 1, it blends into what's there (another
	 * quality's drawing, for a crossfade between them).
	 */
	composite(quality: Quality, alpha = 1) {
		const t = this.tiers[quality];
		if (!t) return;
		const r = this.renderer;
		const screen = r.getDrawingBufferSize(new THREE.Vector2());
		const { width, height } = t.lines;
		const amount = this.smooth.uniforms.amount.value;
		this.smooth.uniforms.tDiffuse.value = t.lines.texture;
		this.smooth.uniforms.resolution.value.set(1 / width, 1 / height);
		this.smooth.uniforms.samples.value.set(width / screen.x, height / screen.y);
		this.smooth.uniforms.amount.value = amount * alpha;
		const autoClear = r.autoClear;
		const planes = r.clippingPlanes;
		r.autoClear = false;
		r.clippingPlanes = [];
		this.quad.material = this.smooth;
		r.render(this.quad, this.quadCamera);
		r.clippingPlanes = planes;
		r.autoClear = autoClear;
		this.smooth.uniforms.amount.value = amount;
	}

	/** Whether `quality` has been prepared at least once (its buffers hold a drawing). */
	has(quality: Quality) {
		return !!this.tiers[quality];
	}

	dispose() {
		for (const t of Object.values(this.tiers)) {
			t.target.dispose();
			t.patched.dispose();
			t.lines.dispose();
		}
		this.surfaces.dispose();
		this.patch.dispose();
		this.ink.dispose();
		this.smooth.dispose();
		this.quad.geometry.dispose();
	}
}
