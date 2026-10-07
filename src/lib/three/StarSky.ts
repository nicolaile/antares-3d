/**
 * The 404's sky, as a camera sees it, on one WebGL2 canvas over the field.
 *
 * All light is added up, in linear space, in a float buffer, then
 * tone-mapped once (so it saturates to white the way film does, however
 * many sources overlap), grained and dithered on the way to the screen.
 * The canvas is opaque black: put it on the page with
 * `mix-blend-mode: screen` and only the light shows.
 *
 * Stars are small point-spread functions: a bright Gaussian core and a
 * faint skirt, each with a slight colour temperature, a twinkle on some
 * and hairline spikes on the brightest. The brightest also scintillate in
 * colour, flickering faintly red and blue, and wander by a fraction of a
 * pixel, as stars do through air.
 *
 * Every hairline (spikes, trails, small cores) is averaged over the pixel
 * it lands on, so it holds steady on 1× screens instead of shimmering as
 * it moves.
 *
 * Their trails are strips along their orbits, drawn with the star's own
 * width, brightness and colour, brightest at the star and fading out
 * behind it. They fade away near the copy and the label (`setAvoid`).
 *
 * Antares is built the way bloom forms in a lens: a blown-out core, faint
 * Airy rings round it, then Gaussians each wider, fainter and warmer than
 * the last. Its diffraction spikes are split by wavelength: red reaches
 * further and spaces its bands wider than blue, so the tips fan into a
 * faint spectrum. Brightness, not size, is what changes: more exposure
 * and more of the falloff clears the threshold, so the star grows the way
 * a real one does.
 */

const COMMON = /* glsl */ `
float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
// Smooth 1D value noise, 0–1.
float noise(float x) {
	float i = floor(x);
	float f = fract(x);
	float a = fract(sin(i * 127.1) * 43758.5453);
	float b = fract(sin((i + 1.0) * 127.1) * 43758.5453);
	return mix(a, b, f * f * (3.0 - 2.0 * f));
}
float gauss(float r, float w) { return exp(-(r * r) / (w * w)); }
// Error function, to within 0.0002 (Winitzki).
float erf_(float x) {
	float x2 = x * x;
	return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732395 + 0.147 * x2) / (1.0 + 0.147 * x2)));
}
// A Gaussian line of width w at distance d, averaged across a pixel
// (h either side): as gauss() when wide, energy-true when thinner than a pixel.
float line(float d, float w, float h) {
	return (erf_((d + h) / w) - erf_((d - h) / w)) * w * 0.8862269 / (2.0 * h);
}
// Barely there: blue-white (−1), white, or a touch warm (1).
vec3 temperature(float t) {
	return t < 0.0 ? mix(vec3(1.0), vec3(0.82, 0.9, 1.0), -t) : mix(vec3(1.0), vec3(1.0, 0.9, 0.78), t);
}
vec2 toClip(vec2 pos, vec2 view) {
	return (pos / view * 2.0 - 1.0) * vec2(1.0, -1.0);
}
`;

const HEADER = /* glsl */ `#version 300 es
precision highp float;
`;

/* ---------------------------------- Stars ---------------------------------- */

const STAR_VERTEX = /* glsl */ `${HEADER}
// Per star: position (CSS px), alpha, nearness to the pointer (0–1).
layout(location = 0) in vec4 aDyn;
// Per star: radius (CSS px), brightness, seed (0–1), temperature (−1–1).
layout(location = 1) in vec4 aStat;

uniform vec2 uView;
uniform float uTime;

out vec2 vP;
out float vR;
out vec3 vI;
out float vSpiky;
out vec3 vCol;

${COMMON}

void main() {
	vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
	float seed = aStat.z;
	float s = aStat.x * (1.0 + 0.35 * aDyn.w);
	vP = corner * (s * 10.0 + 2.0);
	vR = s;

	// Scintillation on about two in five, each at its own rate.
	float twinkly = step(fract(seed * 7.31), 0.4);
	float rate = 0.8 + fract(seed * 13.7) * 2.2;
	float tw = 1.0 + twinkly * 0.45 * (noise(uTime * rate + seed * 91.0) - 0.5) * 2.0;
	// The brightest also flicker in colour and wander a fraction of a pixel.
	float bright = smoothstep(0.9, 1.5, aStat.y);
	float q = uTime * rate * 1.9 + seed * 53.0;
	vec3 hue = vec3(noise(q), noise(q + 11.0), noise(q + 23.0)) - 0.5;
	vec2 jitter = bright * 0.3 * (vec2(noise(uTime * 4.3 + seed * 7.0), noise(uTime * 4.1 + seed * 9.0)) - 0.5);
	vI = aStat.y * aDyn.z * tw * (1.0 + 0.5 * aDyn.w) * (1.0 + bright * 0.5 * hue);
	vSpiky = bright;
	vCol = temperature(aStat.w);
	gl_Position = vec4(toClip(aDyn.xy + jitter + vP, uView), 0.0, 1.0);
}`;

const STAR_FRAGMENT = /* glsl */ `${HEADER}
uniform float uDpr;
uniform float uGain;

in vec2 vP;
in float vR;
in vec3 vI;
in float vSpiky;
in vec3 vCol;
out vec4 outColor;

${COMMON}

void main() {
	float r = length(vP);
	float s = vR;
	// A core smaller than a pixel spreads to fill it, at the same total light.
	float h = 0.5 / uDpr;
	float se = sqrt(s * s + h * h);
	float core = gauss(r, se) * (s * s) / (se * se);
	float skirt = 0.1 * gauss(r, s * 3.0) + 0.025 * exp(-r / (s * 3.0));
	vec2 a = abs(vP);
	float w = 0.4;
	float len = s * 9.0;
	float sp = line(a.y, w, h) * pow(max(0.0, 1.0 - a.x / len), 3.0)
		+ line(a.x, w, h) * pow(max(0.0, 1.0 - a.y / len), 3.0);
	vec3 light = vCol * vI * (2.4 * core + skirt + 0.22 * vSpiky * sp);
	outColor = vec4(light * uGain, 1.0);
}`;

/* --------------------------------- Trails ---------------------------------- */

/** Segments per trail: under a third of a pixel off a true circle at 1000px radius. */
const TRAIL_SEGMENTS = 128;

const TRAIL_VERTEX = /* glsl */ `${HEADER}
// Per trail: orbit radius (CSS px), start angle, head angle, span.
layout(location = 0) in vec4 aArc;
// Per trail: star radius (CSS px), brightness, temperature, alpha.
layout(location = 1) in vec4 aLook;

uniform vec2 uView;
uniform vec2 uCenter;
uniform float uDpr;

out float vAcross;  // CSS px from the trail's centre line
out float vSigma;
out float vAlong;   // 0 at the tail, 1 at the star
out vec2 vPos;
flat out vec3 vCol;
flat out float vI;

${COMMON}

void main() {
	int seg = gl_VertexID >> 1;
	float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
	float t = float(seg) / ${TRAIL_SEGMENTS.toFixed(1)};
	float span = aArc.w;
	float angle = aArc.z - span * (1.0 - t);
	vec2 dir = vec2(cos(angle), sin(angle));

	// A trail is as wide as the star that drew it, never thinner than a pixel.
	float sigma = max(aLook.x * 0.7, 0.4);
	float half_ = sigma * 3.0 + 1.0 / uDpr;
	vec2 pos = uCenter + dir * (aArc.x + side * half_);

	vAcross = side * half_;
	vSigma = sigma;
	vAlong = t;
	vPos = pos;
	vCol = temperature(aLook.z);
	vI = aLook.y * aLook.w;
	gl_Position = vec4(toClip(pos, uView), 0.0, 1.0);
}`;

const TRAIL_FRAGMENT = /* glsl */ `${HEADER}
uniform float uGain;
uniform float uDpr;
uniform vec4 uAvoid[4];   // rects to keep clear (CSS px): x0, y0, x1, y1
uniform int uAvoidCount;

in float vAcross;
in float vSigma;
in float vAlong;
in vec2 vPos;
flat in vec3 vCol;
flat in float vI;
out vec4 outColor;

${COMMON}

void main() {
	float profile = line(vAcross, vSigma, 0.5 / uDpr);
	// Brightest at the star, fading out towards the tail.
	float along = pow(vAlong, 1.6);

	// Fade out within 40px of anything to keep clear.
	float clear = 1.0;
	for (int i = 0; i < 4; i++) {
		if (i >= uAvoidCount) break;
		vec4 r = uAvoid[i];
		vec2 d = max(max(r.xy - vPos, vPos - r.zw), 0.0);
		clear = min(clear, smoothstep(0.0, 40.0, length(d)));
	}
	vec3 light = vCol * vI * profile * along * clear;
	outColor = vec4(light * uGain, 1.0);
}`;

/* ---------------------------------- Glow ----------------------------------- */

const GLOW_VERTEX = /* glsl */ `${HEADER}
uniform vec2 uView;
uniform vec2 uCenter;
uniform float uExtent;
out vec2 vP;

${COMMON}

void main() {
	vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
	vP = corner * uExtent;
	gl_Position = vec4(toClip(uCenter + vP, uView), 0.0, 1.0);
}`;

const GLOW_FRAGMENT = /* glsl */ `${HEADER}
uniform float uDpr;
uniform float uTime;
uniform float uGain;
uniform float uExtent;
uniform float uCore;    // the star's radius, CSS px
uniform vec3 uTint;     // the star's colour, linear RGB
uniform float uPower;   // exposure
uniform float uSpread;  // widens the outer bloom (the click's flare only)
uniform float uSpikes;  // scales the spikes' reach
uniform float uGlint;   // scales the spikes' brightness

in vec2 vP;
out vec4 outColor;

${COMMON}

// Relative wavelengths, red to blue: diffraction scales with them.
const vec3 LAMBDA = vec3(1.18, 1.0, 0.84);

// One spike along x, per channel: bright by the core and falling off with
// distance; each wavelength reaches its own length, with its own bands.
vec3 spike(vec2 a, float len, float w, float h) {
	vec3 reach = len * LAMBDA;
	vec3 fall = pow(max(vec3(0.0), 1.0 - a.x / reach), vec3(2.0)) * (uCore * 4.0) / (uCore * 4.0 + a.x / LAMBDA);
	vec3 bands = 0.72 + 0.28 * cos(6.2832 * a.x / (uCore * 2.6 * LAMBDA));
	vec3 across = vec3(line(a.y, w * 1.25, h), line(a.y, w, h), line(a.y, w * 0.85, h));
	return fall * bands * across;
}

void main() {
	float r = length(vP);
	float c = uCore;

	// Scintillation: the brightness wanders slowly, the spikes a little faster.
	float flicker = 0.92 + 0.08 * (0.6 * noise(uTime * 0.6) + 0.4 * noise(uTime * 2.1 + 7.0));
	// Colour scintillation: each channel flickers a little on its own.
	vec3 hue = 1.0 + 0.07 * (vec3(noise(uTime * 3.1 + 1.0), noise(uTime * 3.1 + 5.0), noise(uTime * 3.1 + 9.0)) - 0.5);
	float shimmer = 0.9 + 0.2 * noise(uTime * 2.7 + 19.0);

	vec3 white = vec3(1.0);
	vec3 light = 2.6 * gauss(r, c * 0.9) * white
		+ 0.6 * gauss(r, c * 2.0) * mix(white, uTint, 0.2)
		+ 0.3 * gauss(r, c * 4.5 * uSpread) * mix(white, uTint, 0.55)
		+ 0.11 * gauss(r, c * 10.0 * uSpread) * uTint
		+ 0.04 * gauss(r, c * 22.0 * uSpread) * uTint;

	// Airy rings: the sinc² of a round aperture, faint, each colour at its own spacing.
	vec3 x = max(vec3(1e-3), 3.1416 * r / (c * 1.9 * LAMBDA));
	vec3 airy = sin(x) / x;
	light += 0.7 * airy * airy * mix(white, uTint, 0.3) * (1.0 - gauss(r, c * 1.4));

	vec2 a = abs(vP);
	float len = c * 30.0 * uSpikes * shimmer;
	float w = 0.45;
	float h = 0.5 / uDpr;
	vec3 sp = (spike(a, len, w, h) + spike(a.yx, len, w, h)) * hue * hue;
	float along = clamp(max(a.x, a.y) / len, 0.0, 1.0);
	light += 0.9 * uGlint * sp * mix(white, uTint, along * 0.5);

	light *= uPower * flicker * hue;
	// Nothing reaches the quad's edge.
	light *= 1.0 - smoothstep(uExtent * 0.7, uExtent, r);
	outColor = vec4(light * uGain, 1.0);
}`;

/* -------------------------------- Composite -------------------------------- */

const COMPOSITE_VERTEX = /* glsl */ `${HEADER}
void main() {
	vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMPOSITE_FRAGMENT = /* glsl */ `${HEADER}
uniform sampler2D uLight;
uniform float uGain;
uniform float uTime;
out vec4 outColor;

${COMMON}

void main() {
	vec3 light = texelFetch(uLight, ivec2(gl_FragCoord.xy), 0).rgb / uGain;
	// Filmic shoulder: bright colour runs to white.
	vec3 col = 1.0 - exp(-light);
	// Film grain, 24 frames a second, strongest in the midtones of the light
	// (the empty sky stays clean), then a dither against banding.
	float frame = floor(uTime * 24.0);
	float grain = hash(gl_FragCoord.xy + frame * 17.0) + hash(gl_FragCoord.yx * 1.3 + frame * 29.0) - 1.0;
	float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col += grain * 0.05 * sqrt(lum) * (1.0 - lum);
	col += (hash(gl_FragCoord.xy * 0.71 + fract(uTime)) - 0.5) / 255.0;
	outColor = vec4(max(col, 0.0), 1.0);
}`;

/* ---------------------------------- API ------------------------------------ */

/** One star's fixed look: radius (CSS px), brightness, seed 0–1, temperature −1–1. */
export type SkyStar = { radius: number; brightness: number; seed: number; temp: number };

export type SkyGlow = {
	x: number;
	y: number;
	/** The star's radius, CSS px. */
	core: number;
	/** Half the side of the square it may light, CSS px. */
	extent: number;
	power: number;
	spread: number;
	spikes: number;
	glint: number;
};

/**
 * One frame. `stars` holds four floats per star, in setStars order: x and y
 * (CSS px), alpha, and nearness to the pointer (0–1). `trails` holds eight
 * per trail, round `center`: orbit radius, start angle, head angle, span; then the star's radius, brightness,
 * temperature and the trail's alpha. `trailCount` of them are drawn.
 */
export type SkyFrame = {
	time: number;
	stars: Float32Array;
	trails: Float32Array;
	trailCount: number;
	center: { x: number; y: number };
	glow: SkyGlow;
};

type Program = { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export class StarSky {
	/** False when WebGL2 isn't available; nothing draws. */
	readonly ok: boolean;
	private gl: WebGL2RenderingContext | null;
	private p: Record<'stars' | 'trails' | 'glow' | 'composite', Program> | null = null;
	private starVao: WebGLVertexArrayObject | null = null;
	private trailVao: WebGLVertexArrayObject | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private starDyn: WebGLBuffer | null = null;
	private starStat: WebGLBuffer | null = null;
	private trailBuf: WebGLBuffer | null = null;
	private target: WebGLFramebuffer | null = null;
	private texture: WebGLTexture | null = null;
	/** Light is stored × this: 1 in a float buffer; scaled down to fit an 8-bit one. */
	private gain = 1;
	private float = false;
	private count = 0;
	private trailCapacity = 0;
	private w = 0;
	private h = 0;
	private dpr = 1;
	private tintRgb: [number, number, number] = [1, 0.5, 0.2];
	private avoid = new Float32Array(16);
	private avoidCount = 0;

	constructor(private canvas: HTMLCanvasElement) {
		this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
		this.ok = !!this.gl && this.build();
	}

	private compile(vertex: string, fragment: string, uniforms: string[]): Program | null {
		const gl = this.gl!;
		const shader = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
			console.warn('StarSky:', gl.getShaderInfoLog(s));
			return null;
		};
		const vs = shader(gl.VERTEX_SHADER, vertex);
		const fs = shader(gl.FRAGMENT_SHADER, fragment);
		if (!vs || !fs) return null;
		const program = gl.createProgram()!;
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.warn('StarSky:', gl.getProgramInfoLog(program));
			return null;
		}
		const u: Program['u'] = {};
		for (const name of uniforms) u[name] = gl.getUniformLocation(program, name);
		return { program, u };
	}

	private build() {
		const gl = this.gl!;
		const stars = this.compile(STAR_VERTEX, STAR_FRAGMENT, ['uView', 'uTime', 'uDpr', 'uGain']);
		const trails = this.compile(TRAIL_VERTEX, TRAIL_FRAGMENT, [
			'uView',
			'uCenter',
			'uDpr',
			'uGain',
			'uAvoid',
			'uAvoidCount'
		]);
		const glow = this.compile(GLOW_VERTEX, GLOW_FRAGMENT, [
			'uView',
			'uCenter',
			'uExtent',
			'uDpr',
			'uTime',
			'uGain',
			'uCore',
			'uTint',
			'uPower',
			'uSpread',
			'uSpikes',
			'uGlint'
		]);
		const composite = this.compile(COMPOSITE_VERTEX, COMPOSITE_FRAGMENT, ['uLight', 'uGain', 'uTime']);
		if (!stars || !trails || !glow || !composite) return false;
		this.p = { stars, trails, glow, composite };

		// Light needs headroom past 1 before the tone map. Without float
		// render targets, store it scaled down in 8 bits instead.
		this.float = !!gl.getExtension('EXT_color_buffer_float');
		this.gain = this.float ? 1 : 1 / 12;

		const instanced = (stride: number[]) => {
			const vao = gl.createVertexArray();
			gl.bindVertexArray(vao);
			const buffers = stride.map((size, loc) => {
				const b = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, b);
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
				gl.vertexAttribDivisor(loc, 1);
				return b;
			});
			return { vao, buffers };
		};
		const s = instanced([4, 4]);
		this.starVao = s.vao;
		[this.starDyn, this.starStat] = s.buffers;

		// Trails: one interleaved buffer, two vec4s per trail.
		this.trailVao = gl.createVertexArray();
		gl.bindVertexArray(this.trailVao);
		this.trailBuf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
		for (const loc of [0, 1]) {
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, loc * 16);
			gl.vertexAttribDivisor(loc, 1);
		}

		// The glow and composite take their corners from gl_VertexID, but
		// WebGL still wants a vertex array bound.
		this.emptyVao = gl.createVertexArray();
		gl.bindVertexArray(null);

		this.target = gl.createFramebuffer();
		this.texture = gl.createTexture();
		return true;
	}

	/** Sizes the canvas and its light buffer to the field, in CSS px. */
	resize(width: number, height: number) {
		if (!this.ok) return;
		const gl = this.gl!;
		// The spikes are a pixel wide: keep them crisp up to 2×.
		this.dpr = Math.min(devicePixelRatio || 1, 2);
		this.w = width;
		this.h = height;
		const pw = Math.max(1, Math.round(width * this.dpr));
		const ph = Math.max(1, Math.round(height * this.dpr));
		this.canvas.width = pw;
		this.canvas.height = ph;

		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, pw, ph, 0, gl.RGBA, gl.HALF_FLOAT, null);
		else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/** The stars' fixed looks, in the order positions will come in. */
	setStars(stars: SkyStar[]) {
		if (!this.ok) return;
		const gl = this.gl!;
		const data = new Float32Array(stars.length * 4);
		stars.forEach((s, i) => data.set([s.radius, s.brightness, s.seed, s.temp], i * 4));
		gl.bindBuffer(gl.ARRAY_BUFFER, this.starStat);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.starDyn);
		gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
		this.count = stars.length;
	}

	/** Up to four rects (CSS px, relative to the canvas) that trails fade away from. */
	setAvoid(rects: { left: number; top: number; right: number; bottom: number }[]) {
		this.avoidCount = Math.min(4, rects.length);
		rects.slice(0, 4).forEach((r, i) => this.avoid.set([r.left, r.top, r.right, r.bottom], i * 4));
	}

	/** Antares's colour, as a CSS hex value (a colour token's). */
	tint(hex: string) {
		const n = parseInt(hex.trim().replace('#', ''), 16);
		const lin = (v: number) => {
			const c = v / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		};
		this.tintRgb = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
	}

	draw({ time, stars, trails, trailCount, center, glow }: SkyFrame) {
		if (!this.ok || !this.w || !this.p) return;
		const gl = this.gl!;
		const { p } = this;

		// Light, added up in the buffer.
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		gl.useProgram(p.glow.program);
		gl.bindVertexArray(this.emptyVao);
		gl.uniform2f(p.glow.u.uView, this.w, this.h);
		gl.uniform2f(p.glow.u.uCenter, glow.x, glow.y);
		gl.uniform1f(p.glow.u.uExtent, glow.extent);
		gl.uniform1f(p.glow.u.uDpr, this.dpr);
		gl.uniform1f(p.glow.u.uTime, time);
		gl.uniform1f(p.glow.u.uGain, this.gain);
		gl.uniform1f(p.glow.u.uCore, glow.core);
		gl.uniform3f(p.glow.u.uTint, ...this.tintRgb);
		gl.uniform1f(p.glow.u.uPower, glow.power);
		gl.uniform1f(p.glow.u.uSpread, glow.spread);
		gl.uniform1f(p.glow.u.uSpikes, glow.spikes);
		gl.uniform1f(p.glow.u.uGlint, glow.glint);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		if (trailCount > 0) {
			gl.useProgram(p.trails.program);
			gl.bindVertexArray(this.trailVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
			if (trailCount > this.trailCapacity) {
				this.trailCapacity = trailCount;
				gl.bufferData(gl.ARRAY_BUFFER, trailCount * 32, gl.DYNAMIC_DRAW);
			}
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, trails, 0, trailCount * 8);
			gl.uniform2f(p.trails.u.uView, this.w, this.h);
			gl.uniform2f(p.trails.u.uCenter, center.x, center.y);
			gl.uniform1f(p.trails.u.uDpr, this.dpr);
			gl.uniform1f(p.trails.u.uGain, this.gain);
			gl.uniform4fv(p.trails.u.uAvoid, this.avoid);
			gl.uniform1i(p.trails.u.uAvoidCount, this.avoidCount);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (TRAIL_SEGMENTS + 1) * 2, trailCount);
		}

		if (this.count) {
			gl.useProgram(p.stars.program);
			gl.bindVertexArray(this.starVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.starDyn);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, stars, 0, this.count * 4);
			gl.uniform2f(p.stars.u.uView, this.w, this.h);
			gl.uniform1f(p.stars.u.uTime, time);
			gl.uniform1f(p.stars.u.uDpr, this.dpr);
			gl.uniform1f(p.stars.u.uGain, this.gain);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
		}

		// Tone map, grain and dither, to the screen.
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.disable(gl.BLEND);
		gl.useProgram(p.composite.program);
		gl.bindVertexArray(this.emptyVao);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.uniform1i(p.composite.u.uLight, 0);
		gl.uniform1f(p.composite.u.uGain, this.gain);
		gl.uniform1f(p.composite.u.uTime, time);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	destroy() {
		this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
		this.gl = null;
	}
}
