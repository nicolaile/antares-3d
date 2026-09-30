import {
	COOL,
	DOT_RGB,
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
/** Route slots in the shader, for per-route temperature. */
const MAX_ROUTES = 8;
/** Inner half-width of a pipe's bore: wall centre (13.5) less the wall line. */
const BORE = 12.5;
/** Largest backing store edge; beyond it the browser may silently shrink the buffer. */
export const MAX_BACKING = 4096;

export interface FlowScene {
	/** The visible window in diagram units; the canvas maps onto it edge to edge. */
	frame: { x: number; y: number; width: number; height: number };
	/** Marker centres, for their flares. */
	dots: { x: number; y: number }[];
	/** Temperature at each route's start and end, 0..1, in route order. */
	temps: [number, number][];
}

const BAKE_VS = /* glsl */ `#version 300 es
in vec2 aPos;
in vec4 aSeg;
in vec2 aArc;
in float aPipe;
in float aEnd;
out vec2 vPos;
flat out vec4 vSeg;
flat out vec2 vArc;
flat out float vPipe;
flat out float vEnd;
uniform vec2 uView;
uniform vec2 uOrigin;
void main() {
	vPos = aPos;
	vSeg = aSeg;
	vArc = aArc;
	vPipe = aPipe;
	vEnd = aEnd;
	gl_Position = vec4(((aPos - uOrigin) / uView * 2.0 - 1.0) * vec2(1.0, -1.0), 0.0, 1.0);
}`;

// Each segment is a capsule-shaped quad. A pixel in reach records how far
// along the loop it is, its signed distance from the centreline (the side
// matters: sparks sit off-centre), and whether that stretch runs inside a
// drawn pipe; the depth test keeps the nearest.
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
flat in float vPipe;
flat in float vEnd;
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
	float tRaw = dot(vPos - p0, d) / max(dot(d, d), 1e-6);
	float t = clamp(tRaw, 0.0, 1.0);
	vec2 off = vPos - (p0 + d * t);
	// Past a route's open end (vEnd: -1 first segment, 1 last) the pipe has
	// stopped: keep the round cap of core and halo, but not the bore effects.
	float pipe = (vEnd < -0.5 && tRaw < 0.0) || (vEnd > 0.5 && tRaw > 1.0) ? 0.0 : vPipe;
	float dist = length(off);
	if (dist > uReach) discard;
	float arc = mix(vArc.x, vArc.y, t);
	if (uPeel == 1) {
		vec4 n = texelFetch(uNearest, ivec2(gl_FragCoord.xy), 0);
		if (n.a > 0.0 && abs(arc - decodeArc(n)) < uReach) discard;
	}
	gl_FragDepth = dist / uReach;
	float side = d.x * off.y - d.y * off.x < 0.0 ? -1.0 : 1.0;
	// 16-bit arc split over two 8-bit channels. Read back with texelFetch,
	// never filtered, so the split survives.
	float a = floor(clamp(arc / uArcMax, 0.0, 1.0) * 65535.0 + 0.5);
	float hi = floor(a / 256.0);
	outColor = vec4(hi / 255.0, (a - hi * 256.0) / 255.0, 0.5 + 0.5 * side * dist / uReach, 0.5 + 0.5 * pipe);
}`;

const SHADE_VS = /* glsl */ `#version 300 es
void main() {
	vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SHADE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uNearest, uSecond;
uniform vec2 uRes, uView, uOrigin;
uniform float uReach, uArcMax, uHead, uPeriod, uTail, uTime, uSpeed;
uniform float uCore, uGlow, uGlowAmount, uAmbient, uFlicker, uPx;
uniform float uFill, uWall, uSparks, uTempAmount, uBore, uCut;
uniform vec4 uRamp[4];     // rgb, alpha
uniform float uRampX[4];
uniform vec3 uCool;
uniform vec4 uRoutes[8];   // start, length, temperature at start, at end
uniform int uRouteCount;
uniform vec3 uDots[8];     // x, y, flare
uniform vec3 uDotRgb;
out vec4 outColor;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
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

// Premultiplied "a over b".
vec4 over(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }
vec4 paint(vec3 rgb, float a) { return vec4(rgb, 1.0) * clamp(a, 0.0, 1.0); }

float decodeArc(vec4 f) {
	return (floor(f.r * 255.0 + 0.5) * 256.0 + floor(f.g * 255.0 + 0.5)) / 65535.0 * uArcMax;
}

float temperature(float arc) {
	for (int i = 0; i < 8; i++) {
		if (i >= uRouteCount) break;
		vec4 r = uRoutes[i];
		if (arc >= r.x && arc <= r.x + r.y) return mix(r.z, r.w, (arc - r.x) / max(r.y, 1.0));
	}
	return 1.0;
}

// The heat colour, cooled towards grey where the gas has given its heat up.
vec3 tint(vec3 rgb, float temp) { return mix(uCool, rgb, temp); }

vec4 heat(float arc, float sd, bool pipe) {
	float dist = abs(sd);
	// Beyond every effect's reach: most of the baked area, so leave at once.
	if (dist > uCut) return vec4(0.0);
	float d = mod(uHead - arc, uPeriod);      // behind the nearest head
	float ahead = uPeriod - d;                // before the next one
	float temp = mix(1.0, temperature(arc), uTempAmount);
	// No pulse anywhere near: only the idle warmth, without the noise.
	if (d >= uTail && ahead > 70.0) {
		if (!pipe) return vec4(0.0);
		float bore = 1.0 - smoothstep(uBore - 1.2, uBore + uPx, dist);
		return paint(tint(ramp(0.6).rgb, temp), uAmbient * temp * bore * 0.5);
	}

	// Trail: full at the head, easing out behind; a crisp but antialiased front.
	float trail = d < uTail ? pow(1.0 - d / uTail, 1.6) : 0.0;
	float I = max(trail, 1.0 - smoothstep(0.0, 3.0, ahead));
	// Comet head: a hot spark just behind the leading edge.
	float head = min(1.0, exp(-d * d / 392.0) * step(d, uTail) + exp(-ahead * ahead / 18.0));

	// Matter: turbulence carried along with the flow, stretched along the
	// pipe, calm at the head so the spark stays clean.
	float along = arc - uTime * uSpeed * 1.25;
	float n = noise2(vec2(along * 0.045, sd * 0.2)) * 0.65 + noise2(vec2(along * 0.012, sd * 0.07 + 3.1)) * 0.35;
	float Im = I * mix(1.0, 0.55 + 0.9 * n, uFlicker * (1.0 - head));

	// Halo, under everything.
	float sigma = max(uGlow * 0.5, 0.5);
	vec4 h = ramp(max(Im, head * 0.9) * 0.75);
	vec4 col = paint(tint(h.rgb, temp), h.a * exp(-dist * dist / (2.0 * sigma * sigma)) * uGlowAmount);

	if (pipe) {
		// The body of the pulse leads with a soft bloom rather than the core's
		// crisp edge, so the fill never marches up the pipe as a square block.
		float soft = max(trail, exp(-ahead * ahead / 450.0));
		float Is = soft * mix(1.0, 0.55 + 0.9 * n, uFlicker * (1.0 - head));
		// Light thrown on the walls as the energy passes inside them.
		float wall = exp(-pow((dist - uBore - 1.0) / 1.6, 2.0)) * uWall * soft;
		col = over(paint(tint(ramp(0.85).rgb, temp), wall * 0.8), col);
		// The bore, filled: idle warmth always, the pulse's own glow on top.
		float bore = 1.0 - smoothstep(uBore - 1.2, uBore + uPx, dist);
		float centre = 1.0 - 0.35 * dist / uBore;
		col = over(paint(tint(ramp(0.6).rgb, temp), uAmbient * temp * bore * 0.5), col);
		vec4 f = ramp(0.35 + 0.5 * Is);
		col = over(paint(tint(f.rgb, temp), uFill * Is * bore * centre), col);
		// Sparks: one cell every 28 units, drifting faster than the pulse.
		float s = arc - uTime * uSpeed * 1.6;
		float ci = floor(s / 28.0);
		float fr = s - ci * 28.0;
		float live = step(0.45, hash(ci + 17.0));
		float oa = 6.0 + hash(ci * 1.37) * 16.0;
		float oc = (hash(ci * 2.91) - 0.5) * 1.5 * uBore;
		float dd2 = (fr - oa) * (fr - oa) + (sd - oc) * (sd - oc);
		float spark = exp(-dd2 / 5.0) * live * (0.5 + 0.5 * hash(ci * 5.3)) * smoothstep(0.02, 0.3, I) * uSparks;
		col = over(paint(tint(ramp(1.0).rgb, temp), spark * bore), col);
	}

	// Core on top: widens and whitens into the comet head — as strongly on a
	// cold pipe as a hot one, so cooled pulses stay as prominent: white-hot
	// on the hot side, clean white on the cool.
	float halfw = uCore * 0.5 * (1.0 + 0.9 * head);
	float core = 1.0 - smoothstep(halfw * 0.45, halfw + uPx, dist);
	vec4 c = ramp(Im);
	vec3 rgb = mix(tint(c.rgb, temp), tint(ramp(1.0).rgb, temp), head * 0.7);
	return over(paint(rgb, max(c.a, head) * core), col);
}

vec4 shade(vec4 f) {
	if (f.a < 0.25) return vec4(0.0);
	return heat(decodeArc(f), (f.b - 0.5) * 2.0 * uReach, f.a > 0.75);
}

void main() {
	ivec2 px = ivec2(gl_FragCoord.xy);
	vec4 col = over(shade(texelFetch(uNearest, px, 0)), shade(texelFetch(uSecond, px, 0)));

	// Markers flare as energy passes; the markers themselves are drawn above.
	// Skipped for quiet markers and for pixels out of a flare's reach.
	vec2 vb = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uView + uOrigin;
	float s = uGlow * 0.8;
	for (int k = 0; k < 8; k++) {
		float fl = uDots[k].z;
		if (fl < 0.004) continue;
		vec2 dv = vb - uDots[k].xy;
		float dd2 = dot(dv, dv);
		if (dd2 > 9.0 * s * s) continue;
		float flare = exp(-dd2 / (2.0 * s * s)) * fl * min(1.0, uGlowAmount * 1.4);
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
		// A segment is in a pipe only if both its ends are.
		const pipe = route.inPipe[i] && route.inPipe[i + 1] ? 1 : 0;
		const end = i === 0 ? -1 : i === route.arcs.length - 2 ? 1 : 0;
		for (const v of [a, b, c, c, b, d]) out.push(v[0], v[1], x0, y0, x1, y1, route.arcs[i], route.arcs[i + 1], pipe, end);
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
 * fullscreen shader turns those numbers into colour each frame — bore fill,
 * wall light, sparks, the comet core and its halo — so the whole look is
 * per-pixel maths with no geometry involved.
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
	// Uniform staging, allocated once: nothing is created per frame.
	private rampBuf = new Float32Array(16);
	private rampXBuf = new Float32Array(4);
	private dotBuf = new Float32Array(MAX_DOTS * 3);
	private flareBuf = new Float32Array(MAX_DOTS);
	private routeBuf = new Float32Array(MAX_ROUTES * 4);

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
		this.count = data.length / 10;
		this.vao = gl.createVertexArray()!;
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
		const attr = (name: string, size: number, offset: number) => {
			const loc = gl.getAttribLocation(this.bake, name);
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, offset * 4);
		};
		attr('aPos', 2, 0);
		attr('aSeg', 4, 2);
		attr('aArc', 2, 6);
		attr('aPipe', 1, 8);
		attr('aEnd', 1, 9);
		gl.bindVertexArray(null);

		for (const name of [
			'uNearest', 'uSecond', 'uRes', 'uView', 'uOrigin', 'uReach', 'uArcMax', 'uHead', 'uPeriod', 'uTail', 'uTime',
			'uSpeed', 'uCore', 'uGlow', 'uGlowAmount', 'uAmbient', 'uFlicker', 'uPx', 'uFill', 'uWall', 'uSparks',
			'uTempAmount', 'uBore', 'uCut', 'uRamp', 'uRampX', 'uCool', 'uRoutes', 'uRouteCount', 'uDots', 'uDotRgb'
		]) {
			this.u[name] = gl.getUniformLocation(this.shade, name);
		}

		// Static per scene: route spans and temperatures, marker positions.
		net.routes.slice(0, MAX_ROUTES).forEach((r, i) => {
			const [t0, t1] = scene.temps[i] ?? [1, 1];
			this.routeBuf.set([r.start, r.length, t0, t1], i * 4);
		});
		for (let i = 0; i < MAX_DOTS; i++) {
			const d = scene.dots[i];
			this.dotBuf.set(d ? [d.x, d.y, 0] : [-1e5, -1e5, 0], i * 3);
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
		gl.uniform2f(gl.getUniformLocation(this.bake, 'uOrigin'), this.scene.frame.x, this.scene.frame.y);
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
		const { frame } = this.scene;
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
		gl.uniform2f(u.uOrigin, frame.x, frame.y);
		gl.uniform1f(u.uReach, REACH);
		gl.uniform1f(u.uArcMax, this.arcMax);
		gl.uniform1f(u.uHead, head);
		gl.uniform1f(u.uPeriod, period(this.net, p));
		gl.uniform1f(u.uTail, tailOf(this.net, p));
		gl.uniform1f(u.uTime, time);
		gl.uniform1f(u.uSpeed, p.speed);
		gl.uniform1f(u.uCore, p.core);
		gl.uniform1f(u.uGlow, Math.min(p.glow, REACH * 0.6));
		gl.uniform1f(u.uGlowAmount, p.glowAmount);
		gl.uniform1f(u.uAmbient, p.ambient);
		gl.uniform1f(u.uFlicker, p.flicker);
		gl.uniform1f(u.uFill, p.fill);
		gl.uniform1f(u.uWall, p.wallLight);
		gl.uniform1f(u.uSparks, p.sparks);
		gl.uniform1f(u.uTempAmount, p.temperature);
		gl.uniform1f(u.uBore, BORE);
		// The widest anything reaches from a centreline: halo, walls, or the
		// head-widened core.
		const glow = Math.min(p.glow, REACH * 0.6);
		gl.uniform1f(u.uCut, Math.min(REACH, Math.max(glow * 1.6, BORE + 5, p.core * 1.2)));
		gl.uniform1f(u.uPx, frame.width / w);

		const ramp = RAMPS[theme];
		ramp.forEach((s, i) => {
			this.rampBuf[i * 4] = s.rgb[0] / 255;
			this.rampBuf[i * 4 + 1] = s.rgb[1] / 255;
			this.rampBuf[i * 4 + 2] = s.rgb[2] / 255;
			this.rampBuf[i * 4 + 3] = s.a;
			this.rampXBuf[i] = s.x;
		});
		gl.uniform4fv(u.uRamp, this.rampBuf);
		gl.uniform1fv(u.uRampX, this.rampXBuf);
		const cool = COOL[theme];
		gl.uniform3f(u.uCool, cool[0] / 255, cool[1] / 255, cool[2] / 255);
		gl.uniform4fv(u.uRoutes, this.routeBuf);
		gl.uniform1i(u.uRouteCount, Math.min(this.net.routes.length, MAX_ROUTES));

		dotFlares(this.net, p, head, this.flareBuf);
		for (let i = 0; i < this.scene.dots.length && i < MAX_DOTS; i++) this.dotBuf[i * 3 + 2] = this.flareBuf[i];
		gl.uniform3fv(u.uDots, this.dotBuf);
		gl.uniform3f(u.uDotRgb, DOT_RGB[0] / 255, DOT_RGB[1] / 255, DOT_RGB[2] / 255);

		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	destroy() {
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}
}
