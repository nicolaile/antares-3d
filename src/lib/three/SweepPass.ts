import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export interface SweepOptions {
	/** Colour at the lit end of the backdrop. sRGB hex, stored as authored. */
	light?: number | string;
	/** Colour at the dark end. */
	dark?: number | string;
	/** Degrees. 0 = light at the top, dark at the bottom; 90 = light on the left. */
	angle?: number;
	/** 0..1 along the gradient axis where the transition is centred. */
	mid?: number;
	/** Width of the transition, 0..1 of the axis. Small = a hard horizon. */
	spread?: number;
	/** Exponent on the transition. >1 holds the light plateau longer, then drops faster. */
	curve?: number;
	/** Soft radial pool of the light colour behind the model, 0..1. */
	lift?: number;
	/** How much the OBJECT darkens along the backdrop axis, 0..1. 0 = none. */
	falloff?: number;
	/** Grain over the whole frame, backdrop included. */
	grain?: number;
	/** Grain cell size in device pixels. Real film grain is coarser than a pixel. */
	grainSize?: number;
	/** Re-rolls per second. 0 = a fixed pattern, like a photograph's grain. */
	grainSpeed?: number;
}

/** The uniforms the material's bounce term shares with the pass. */
export interface SweepUniforms {
	uLight: THREE.IUniform<THREE.Color>;
	uDark: THREE.IUniform<THREE.Color>;
	uAngle: THREE.IUniform<number>;
	uMid: THREE.IUniform<number>;
	uSpread: THREE.IUniform<number>;
	uCurve: THREE.IUniform<number>;
	uLift: THREE.IUniform<number>;
	uAspect: THREE.IUniform<number>;
	uResolution: THREE.IUniform<THREE.Vector2>;
}

/**
 * The backdrop, as a function of screen uv (0..1, y up). Shared verbatim with
 * `studioShade.ts`, where the object samples it for bounce light, so the two
 * can never drift apart. Colours mix in linear light: an sRGB mix of a pale
 * grey and a near-black lands on a muddy mid grey; linear gives the long
 * light plateau and quick drop the reference photographs have.
 *
 * Expects the SweepUniforms to be declared by the caller.
 */
export const SWEEP_GLSL = /* glsl */ `
	vec3 sweepToLinear( vec3 c ) { return pow( max( c, 0.0 ), vec3( 2.2 ) ); }
	vec3 sweepToSrgb( vec3 c ) { return pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) ); }

	// 0 at the light end, 1 at the dark end, corners exactly on 0 and 1
	// whatever the angle or aspect.
	float sweepT( vec2 uv ) {
		vec2 dark = vec2( sin( uAngle ), -cos( uAngle ) );
		vec2 p = ( uv - 0.5 ) * vec2( uAspect, 1.0 );
		return 0.5 + dot( p, dark ) / max( dot( vec2( uAspect, 1.0 ), abs( dark ) ), 1e-4 );
	}
	// Transition weight, 0 = light colour, 1 = dark colour.
	float sweepK( vec2 uv ) {
		float k = smoothstep( uMid - uSpread * 0.5, uMid + uSpread * 0.5, sweepT( uv ) );
		return pow( k, uCurve );
	}
	// Backdrop colour in LINEAR light.
	vec3 sweepLinear( vec2 uv ) {
		vec3 bg = mix( sweepToLinear( uLight ), sweepToLinear( uDark ), sweepK( uv ) );
		// A soft pool a little above centre, where the model sits.
		vec2 d = ( uv - vec2( 0.5, 0.55 ) ) * vec2( uAspect, 1.0 );
		float pool = exp( -dot( d, d ) * 6.0 );
		return mix( bg, sweepToLinear( uLight ), uLift * pool );
	}
`;

/**
 * Studio sweep: a lit backdrop behind the model, in display space.
 *
 * Product photography lights the backdrop separately from the subject, so
 * this pass knows nothing about the lights: it paints a two-colour linear
 * gradient wherever the scene left the canvas transparent, and outputs an
 * opaque frame. The subject's own shadow is a material term (see
 * `studioShade.ts`) with its own direction; the two never have to agree.
 *
 * Extras that share the gradient axis ride along:
 *  - `falloff` darkens the object towards the dark end, which ties its
 *    bottom into the backdrop the way a real floor-level falloff does.
 *  - `grain` covers everything, in cells coarser than a pixel, weighted to
 *    midtones and shadows and away from highlights and true black, and
 *    fixed to the frame by default (optionally re-rolled a few times a
 *    second) — the way film grain reads.
 *  - a 1-bit dither on the backdrop, because a long near-black gradient
 *    bands at 8 bits and grain only half hides it.
 *
 * Runs last. Input is premultiplied (see GradientMapPass), so compositing is
 * the plain `src + bg * (1 - a)`. Output alpha is 1: the CSS stage behind the
 * canvas is hidden while this pass is on.
 */
export class SweepPass extends ShaderPass {
	constructor(opts: SweepOptions = {}) {
		super({
			name: 'SweepPass',
			uniforms: {
				tDiffuse: { value: null },
				uLight: { value: new THREE.Color() },
				uDark: { value: new THREE.Color() },
				uAngle: { value: 0 },
				uMid: { value: 0.55 },
				uSpread: { value: 0.45 },
				uCurve: { value: 1 },
				uLift: { value: 0 },
				uAspect: { value: 1 },
				uResolution: { value: new THREE.Vector2(1, 1) },
				uFalloff: { value: 0.25 },
				uGrain: { value: 0.08 },
				uGrainSize: { value: 2.5 },
				uGrainSpeed: { value: 0 },
				uTime: { value: 0 }
			},
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDiffuse;
				uniform vec3 uLight;
				uniform vec3 uDark;
				uniform float uAngle;
				uniform float uMid;
				uniform float uSpread;
				uniform float uCurve;
				uniform float uLift;
				uniform float uAspect;
				uniform vec2 uResolution;
				uniform float uFalloff;
				uniform float uGrain;
				uniform float uGrainSize;
				uniform float uGrainSpeed;
				uniform float uTime;
				varying vec2 vUv;

				${SWEEP_GLSL}

				const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

				// Sized for pixel-coordinate inputs: the 0.1031 scale keeps the
				// intermediate small enough that fp32 keeps its fractional bits.
				float hash( vec2 p ) {
					vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
					p3 += dot( p3, p3.yzx + 33.33 );
					return fract( ( p3.x + p3.y ) * p3.z );
				}

				void main() {
					vec4 src = texture2D( tDiffuse, vUv );

					vec3 bg = sweepToSrgb( sweepLinear( vUv ) );
					// Dither: breaks the 8-bit steps in the dark end.
					bg += ( hash( gl_FragCoord.xy ) - 0.5 ) / 255.0;

					// Premultiplied, so scaling rgb alone is the correct darkening.
					vec3 fg = src.rgb * ( 1.0 - uFalloff * sweepK( vUv ) );
					vec3 rgb = fg + bg * ( 1.0 - src.a );

					// Coarse grain. Static by default — a photograph's grain does not
					// crawl. With a speed it re-rolls that many times a second; the
					// seed wraps so the hash input stays bounded (fed an ever-growing
					// time it ran out of fractional precision and collapsed into stripes).
					vec2 cell = floor( gl_FragCoord.xy / max( uGrainSize, 1.0 ) );
					float seed = uGrainSpeed > 0.0 ? mod( floor( uTime * uGrainSpeed ), 97.0 ) : 0.0;
					float n = hash( cell + seed * vec2( 37.0, 91.0 ) ) - 0.5;
					float l = dot( clamp( rgb, 0.0, 1.0 ), LUMA );
					// Lift out of true black, then taper off through the highlights.
					float w = smoothstep( 0.0, 0.12, l ) * ( 1.0 - 0.8 * smoothstep( 0.5, 1.0, l ) );
					rgb += n * uGrain * w;

					gl_FragColor = vec4( rgb, 1.0 );
				}`
		});

		this.enabled = false;
		this.light = opts.light ?? 0xdfe6e6;
		this.dark = opts.dark ?? 0x051214;
		this.angle = opts.angle ?? 13;
		this.mid = opts.mid ?? 0.49;
		// A full-width transition: no flat plateau at either end, the whole
		// frame is the falloff. `curve` supplies the asymmetry instead.
		this.spread = opts.spread ?? 1;
		this.curve = opts.curve ?? 1.4;
		this.lift = opts.lift ?? 0;
		this.falloff = opts.falloff ?? 0;
		this.grain = opts.grain ?? 0.1;
		this.grainSize = opts.grainSize ?? 1;
		this.grainSpeed = opts.grainSpeed ?? 0;
	}

	/** The gradient uniforms, for the material's bounce term to share. */
	get sweepUniforms(): SweepUniforms {
		return this.uniforms as unknown as SweepUniforms;
	}

	/** Called by the composer on resize, in device pixels. */
	setSize(width: number, height: number) {
		this.uniforms.uAspect.value = height > 0 ? width / height : 1;
		(this.uniforms.uResolution.value as THREE.Vector2).set(width, height);
	}

	// Colours are display-space, like the gradient map's stops: LinearSRGB
	// here means "store as given", not "linearise".
	private setColor(u: THREE.Color, c: number | string) {
		if (typeof c === 'number') u.setHex(c, THREE.LinearSRGBColorSpace);
		else u.setStyle(c, THREE.LinearSRGBColorSpace);
	}
	set light(c: number | string) {
		this.setColor(this.uniforms.uLight.value as THREE.Color, c);
	}
	/** `#rrggbb` */
	get light(): string {
		return '#' + (this.uniforms.uLight.value as THREE.Color).getHexString(THREE.LinearSRGBColorSpace);
	}
	set dark(c: number | string) {
		this.setColor(this.uniforms.uDark.value as THREE.Color, c);
	}
	get dark(): string {
		return '#' + (this.uniforms.uDark.value as THREE.Color).getHexString(THREE.LinearSRGBColorSpace);
	}
	/** Degrees. */
	set angle(deg: number) {
		this.uniforms.uAngle.value = THREE.MathUtils.degToRad(deg);
	}
	get angle() {
		return THREE.MathUtils.radToDeg(this.uniforms.uAngle.value as number);
	}
	set mid(v: number) {
		this.uniforms.uMid.value = v;
	}
	get mid() {
		return this.uniforms.uMid.value as number;
	}
	set spread(v: number) {
		this.uniforms.uSpread.value = v;
	}
	get spread() {
		return this.uniforms.uSpread.value as number;
	}
	set curve(v: number) {
		this.uniforms.uCurve.value = v;
	}
	get curve() {
		return this.uniforms.uCurve.value as number;
	}
	set lift(v: number) {
		this.uniforms.uLift.value = v;
	}
	get lift() {
		return this.uniforms.uLift.value as number;
	}
	set falloff(v: number) {
		this.uniforms.uFalloff.value = v;
	}
	get falloff() {
		return this.uniforms.uFalloff.value as number;
	}
	set grain(v: number) {
		this.uniforms.uGrain.value = v;
	}
	get grain() {
		return this.uniforms.uGrain.value as number;
	}
	set grainSize(v: number) {
		this.uniforms.uGrainSize.value = v;
	}
	get grainSize() {
		return this.uniforms.uGrainSize.value as number;
	}
	set grainSpeed(v: number) {
		this.uniforms.uGrainSpeed.value = v;
	}
	get grainSpeed() {
		return this.uniforms.uGrainSpeed.value as number;
	}
	set time(t: number) {
		this.uniforms.uTime.value = t;
	}
}
