import {
	DOT_RGB,
	FRONT,
	RAMPS,
	dotFlares,
	period,
	tailOf,
	type EnergyParams,
	type Network,
	type Sampled,
	type Theme
} from './energy';

/** Furthest the halo can reach from a centreline, in diagram units. Also the bake radius. */
const REACH = 110;
/** Marker slots in the shader; unused ones are parked far outside the frame. */
const MAX_DOTS = 8;
/** Largest backing store edge; beyond it the browser may silently shrink the buffer. */
export const MAX_BACKING = 4096;

export interface FlowScene {
	/** Diagram size in its own units; the canvas maps onto it edge to edge. */
	frame: { width: number; height: number };
	/** Marker centres, for their flares. */
	dots: { x: number; y: number }[];
}

const BAKE_VS = /* glsl */ `#version 300 es
in vec2 aPos;
in vec4 aSeg;
in vec2 aArc;
out vec2 vPos;
flat out vec4 vSeg;
flat out vec2 vArc;
uniform vec2 uView;
void main() {
	vPos = aPos;
	vSeg = aSeg;
	vArc = aArc;
	gl_Position = vec4((aPos / uView * 2.0 - 1.0) * vec2(1.0, -1.0), 0.0, 1.0);
}`;

// Each segment is a capsule-shaped quad. A pixel in reach records how far
// along the loop it is and how far from the centreline; the depth test
// keeps the nearest.
//
// Baked twice. The second pass skips whatever the first pass found at that
// pixel — the same stretch of pipe — so it records the next-nearest pipe.
// Shading both lets two pipes' glows overlap instead of meeting at a hard
// edge halfway between them.
const BAKE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vPos;
flat in vec4 vSeg;
flat in vec2 vArc;
uniform float uReach;
uniform float uArcMax;
uniform int uPeel;
uniform sampler2D uNearest;
out vec4 outColor;

float decodeArc(vec4 f) {
	return (floor(f.r * 255.0 + 0.5) * 256.0 + floor(f.g * 255.0 + 0.5)) / 65535.0 * uArcMax;
}

void main() {
	vec2 p0 = vSeg.xy;
	vec2 d = vSeg.zw - p0;
	float t = clamp(dot(vPos - p0, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
	float dist = length(vPos - (p0 + d * t));
	if (dist > uReach) discard;
	float arc = mix(vArc.x, vArc.y, t);
	if (uPeel == 1) {
		vec4 n = texelFetch(uNearest, ivec2(gl_FragCoord.xy), 0);
		if (n.a > 0.0 && abs(arc - decodeArc(n)) < uReach) discard;
	}
	gl_FragDepth = dist / uReach;
	// 16-bit arc split over two 8-bit channels. Read back with texelFetch,
	// never filtered, so the split survives.
	float a = floor(clamp(arc / uArcMax, 0.0, 1.0) * 65535.0 + 0.5);
	float hi = floor(a / 256.0);
	outColor = vec4(hi / 255.0, (a - hi * 256.0) / 255.0, dist / uReach, 1.0);
}`;

const SHADE_VS = /* glsl */ `#version 300 es
void main() {
	vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SHADE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uNearest, uSecond;
uniform vec2 uRes;
uniform vec2 uView;
uniform float uReach, uArcMax, uHead, uPeriod, uTail, uFront, uTime;
uniform float uCore, uGlow, uGlowAmount, uAmbient, uFlicker, uPx;
uniform vec4 uRamp[4];     // rgb, alpha
uniform float uRampX[4];
uniform vec3 uDots[8];     // x, y, flare
uniform vec3 uDotRgb;
out vec4 outColor;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) {
	float i = floor(x), f = fract(x);
	return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
}

vec4 ramp(float x) {
	x = clamp(x, 0.0, 1.0);
	for (int i = 0; i < 3; i++) {
		if (x <= uRampX[i + 1]) {
			return mix(uRamp[i], uRamp[i + 1], (x - uRampX[i]) / (uRampX[i + 1] - uRampX[i]));
		}
	}
	return uRamp[3];
}

float trail(float d, float tail, float front) {
	if (d >= tail) return 0.0;
	float f = min(1.0, d / front);
	return pow(1.0 - d / tail, 1.5) * f * (2.0 - f);
}

// Premultiplied "a over b".
vec4 over(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }

float decodeArc(vec4 f) {
	return (floor(f.r * 255.0 + 0.5) * 256.0 + floor(f.g * 255.0 + 0.5)) / 65535.0 * uArcMax;
}

vec4 heat(float arc, float dist) {
	float d = mod(uHead - arc, uPeriod);
	// Turbulence that travels with the flow, so it reads as moving matter.
	float n = noise(arc * 0.06 - uTime * 6.0) * 0.6 + noise(arc * 0.017 - uTime * 2.0) * 0.4;
	float i = trail(d, uTail, uFront) * mix(1.0, 0.45 + 1.1 * n, uFlicker);

	float half_ = uCore * 0.5;
	// Feathered edge: the core fades into its halo rather than stopping.
	float core = 1.0 - smoothstep(half_ * 0.45, half_ + uPx, dist);
	float hot = exp(-dist * dist / (half_ * half_ * 0.5));
	float sigma = uGlow * 0.5;
	float s2 = 2.0 * sigma * sigma;
	float halo = exp(-dist * dist / s2) * uGlowAmount;
	// The trail stops dead at the head, which would cut the halo square.
	// Let the glow fall off along the pipe as well as across it.
	float ahead = uPeriod - d;
	float hi = max(i, 0.9 * max(exp(-ahead * ahead / s2), exp(-d * d / s2)));

	vec4 c = ramp(i * (0.8 + 0.2 * hot));
	vec4 h = ramp(hi * 0.75);
	vec4 amb = ramp(0.6);
	vec4 col = over(vec4(c.rgb, 1.0) * c.a * core, vec4(h.rgb, 1.0) * h.a * halo);
	return over(col, vec4(amb.rgb, 1.0) * uAmbient * core);
}

vec4 shade(vec4 f) {
	if (f.a < 0.5) return vec4(0.0);
	return heat(decodeArc(f), f.b * uReach);
}

void main() {
	ivec2 px = ivec2(gl_FragCoord.xy);
	vec4 col = over(shade(texelFetch(uNearest, px, 0)), shade(texelFetch(uSecond, px, 0)));

	// Markers flare as energy passes; the markers themselves are drawn above.
	vec2 vb = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uView;
	for (int k = 0; k < 8; k++) {
		float dd = length(vb - uDots[k].xy);
		float s = uGlow * 0.8;
		float flare = exp(-dd * dd / (2.0 * s * s)) * uDots[k].z * min(1.0, uGlowAmount * 1.4);
		col = over(col, vec4(uDotRgb, 1.0) * flare * 0.8);
	}
	outColor = col;
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
	const program = gl.createProgram()!;
	for (const [type, src] of [
		[gl.VERTEX_SHADER, vs],
		[gl.FRAGMENT_SHADER, fs]
	] as const) {
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, src);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
		gl.attachShader(program, shader);
	}
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
	return program;
}

/** Six vertices per segment: a quad grown by REACH on every side, so rounded ends are covered. */
function segments(route: Sampled, out: number[]) {
	for (let i = 0; i < route.arcs.length - 1; i++) {
		const x0 = route.points[i * 2], y0 = route.points[i * 2 + 1];
		const x1 = route.points[i * 2 + 2], y1 = route.points[i * 2 + 3];
		const len = Math.hypot(x1 - x0, y1 - y0) || 1;
		const tx = ((x1 - x0) / len) * REACH, ty = ((y1 - y0) / len) * REACH;
		const nx = -ty, ny = tx;
		const a = [x0 - tx + nx, y0 - ty + ny];
		const b = [x0 - tx - nx, y0 - ty - ny];
		const c = [x1 + tx + nx, y1 + ty + ny];
		const d = [x1 + tx - nx, y1 + ty - ny];
		for (const v of [a, b, c, c, b, d]) out.push(v[0], v[1], x0, y0, x1, y1, route.arcs[i], route.arcs[i + 1]);
	}
}

interface Layer {
	tex: WebGLTexture;
	fbo: WebGLFramebuffer;
}

/**
 * WebGL2 flow map.
 *
 * Bake once per size: every pixel near a pipe gets its distance along the
 * loop and from the centreline, for its two nearest pipes. Then one
 * fullscreen shader turns those numbers into colour each frame, so the
 * gradient, the glow falloff and the flicker are per-pixel maths with no
 * geometry involved.
 */
export class FlowMapEnergy {
	private gl: WebGL2RenderingContext;
	private bake: WebGLProgram;
	private shade: WebGLProgram;
	private vao: WebGLVertexArrayObject;
	private count: number;
	private layers: Layer[] = [];
	private depth: WebGLRenderbuffer | null = null;
	private u: Record<string, WebGLUniformLocation | null> = {};
	private arcMax: number;
	/** The buffer the browser actually gave us, which may be smaller than asked. */
	private size = [1, 1];

	constructor(
		private canvas: HTMLCanvasElement,
		private net: Network,
		private scene: FlowScene
	) {
		const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
		if (!gl) throw new Error('WebGL2 unavailable');
		this.gl = gl;
		this.bake = compile(gl, BAKE_VS, BAKE_FS);
		this.shade = compile(gl, SHADE_VS, SHADE_FS);
		this.arcMax = net.total;

		const data: number[] = [];
		for (const r of net.routes) segments(r, data);
		this.count = data.length / 8;
		this.vao = gl.createVertexArray()!;
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
		const attr = (name: string, size: number, offset: number) => {
			const loc = gl.getAttribLocation(this.bake, name);
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, offset * 4);
		};
		attr('aPos', 2, 0);
		attr('aSeg', 4, 2);
		attr('aArc', 2, 6);
		gl.bindVertexArray(null);

		for (const name of [
			'uNearest', 'uSecond', 'uRes', 'uView', 'uReach', 'uArcMax', 'uHead', 'uPeriod', 'uTail', 'uFront', 'uTime',
			'uCore', 'uGlow', 'uGlowAmount', 'uAmbient', 'uFlicker', 'uPx', 'uRamp', 'uRampX', 'uDots', 'uDotRgb'
		]) {
			this.u[name] = gl.getUniformLocation(this.shade, name);
		}
	}

	resize(width: number, height: number) {
		const gl = this.gl;
		this.canvas.width = Math.min(width, MAX_BACKING);
		this.canvas.height = Math.min(height, MAX_BACKING);
		// Size everything from what the browser allocated, never from what we
		// asked for: a clamped buffer would otherwise stretch the glow off the pipes.
		const w = gl.drawingBufferWidth;
		const h = gl.drawingBufferHeight;
		this.size = [w, h];

		for (const l of this.layers) {
			gl.deleteTexture(l.tex);
			gl.deleteFramebuffer(l.fbo);
		}
		gl.deleteRenderbuffer(this.depth);
		this.depth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
		this.layers = [0, 1].map(() => {
			const tex = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			const fbo = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
			return { tex, fbo };
		});

		// The bake: runs only here, never per frame.
		gl.viewport(0, 0, w, h);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.useProgram(this.bake);
		gl.uniform2f(gl.getUniformLocation(this.bake, 'uView'), this.scene.frame.width, this.scene.frame.height);
		gl.uniform1f(gl.getUniformLocation(this.bake, 'uReach'), REACH);
		gl.uniform1f(gl.getUniformLocation(this.bake, 'uArcMax'), this.arcMax);
		gl.uniform1i(gl.getUniformLocation(this.bake, 'uNearest'), 0);
		gl.bindVertexArray(this.vao);
		this.layers.forEach((layer, i) => {
			gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo);
			gl.clearColor(0, 0, 0, 0);
			gl.clearDepth(1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.uniform1i(gl.getUniformLocation(this.bake, 'uPeel'), i);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, i === 1 ? this.layers[0].tex : null);
			gl.drawArrays(gl.TRIANGLES, 0, this.count);
		});
		gl.bindVertexArray(null);
		gl.disable(gl.DEPTH_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	render(head: number, time: number, p: EnergyParams, theme: Theme = 'light') {
		const gl = this.gl;
		const u = this.u;
		const [w, h] = this.size;
		const { frame, dots } = this.scene;
		gl.viewport(0, 0, w, h);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.shade);
		this.layers.forEach((layer, i) => {
			gl.activeTexture(gl.TEXTURE0 + i);
			gl.bindTexture(gl.TEXTURE_2D, layer.tex);
		});
		gl.uniform1i(u.uNearest, 0);
		gl.uniform1i(u.uSecond, 1);
		gl.uniform2f(u.uRes, w, h);
		gl.uniform2f(u.uView, frame.width, frame.height);
		gl.uniform1f(u.uReach, REACH);
		gl.uniform1f(u.uArcMax, this.arcMax);
		gl.uniform1f(u.uHead, head);
		gl.uniform1f(u.uPeriod, period(this.net, p));
		gl.uniform1f(u.uTail, tailOf(this.net, p));
		gl.uniform1f(u.uFront, FRONT);
		gl.uniform1f(u.uTime, time);
		gl.uniform1f(u.uCore, p.core);
		gl.uniform1f(u.uGlow, Math.min(p.glow, REACH * 0.6));
		gl.uniform1f(u.uGlowAmount, p.glowAmount);
		gl.uniform1f(u.uAmbient, p.ambient);
		gl.uniform1f(u.uFlicker, p.flicker);
		gl.uniform1f(u.uPx, frame.width / w);

		const ramp = RAMPS[theme];
		gl.uniform4fv(u.uRamp, ramp.flatMap((s) => [s.rgb[0] / 255, s.rgb[1] / 255, s.rgb[2] / 255, s.a]));
		gl.uniform1fv(u.uRampX, ramp.map((s) => s.x));
		const flares = dotFlares(this.net, p, head);
		const slots = Array.from({ length: MAX_DOTS }, (_, i) =>
			dots[i] ? [dots[i].x, dots[i].y, flares[i]] : [-1e5, -1e5, 0]
		);
		gl.uniform3fv(u.uDots, slots.flat());
		gl.uniform3f(u.uDotRgb, DOT_RGB[0] / 255, DOT_RGB[1] / 255, DOT_RGB[2] / 255);

		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	destroy() {
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}
}
