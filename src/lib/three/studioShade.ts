import * as THREE from 'three';
import { SWEEP_GLSL, type SweepUniforms } from './SweepPass';

export interface StudioShadeOptions {
	/** Screen angle the light comes from, degrees. 0 = right, 90 = top, 180 = left. */
	azimuth?: number;
	/** Degrees off the screen plane. 0 = grazing from the side, 90 = straight from the camera. */
	elevation?: number;
	/** Where the terminator sits in N·L terms: 0 = half the form, +ve = shadow covers more. */
	coverage?: number;
	/** Half-width of the terminator in N·L; large = the slow wrap of a big softbox. */
	softness?: number;
	/** How dark the shadow side goes, 0..1, perceptual. 0.9 is near-black; 1 = black. */
	depth?: number;
	/** Backdrop light picked up at grazing angles, 0..1. */
	bounce?: number;
	on?: boolean;
}

export interface StudioShadeUniforms {
	uShadeOn: THREE.IUniform<number>;
	uShadeDir: THREE.IUniform<THREE.Vector3>;
	uShadeCoverage: THREE.IUniform<number>;
	uShadeSoftness: THREE.IUniform<number>;
	uShadeDepth: THREE.IUniform<number>;
	uBounce: THREE.IUniform<number>;
}

/**
 * The studio look as dialled in through the controls panel. Exported because
 * ModelViewer mirrors the two angles (it needs them to aim the real key), and
 * two copies of a default is one too many.
 */
export const SHADE_DEFAULTS = {
	azimuth: 360,
	elevation: 6,
	coverage: 0.26,
	softness: 1,
	depth: 1,
	bounce: 0.46
} as const;

/** View-space light direction from two screen-relative angles. */
export function shadeDirection(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
	const a = THREE.MathUtils.degToRad(azimuthDeg);
	const e = THREE.MathUtils.degToRad(elevationDeg);
	// View space: +x right, +y up, +z towards the camera.
	return out.set(Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)).normalize();
}

/**
 * Stylised product-shot shadow: one big soft source, no fill — plus the
 * backdrop lighting the subject back.
 *
 * Shadow: multiplies the material's final lit colour by a factor that drops
 * towards `1 - depth` where the surface faces away from `uShadeDir`. It is a
 * shaping term, not a light — it darkens reflections and diffuse alike, which
 * is what a matte object under a single softbox with black surround does.
 *
 * Bounce: at grazing angles the surface picks up the backdrop, sampled from
 * the SAME gradient the SweepPass paints (shared uniforms, shared GLSL), at
 * the screen position the normal points towards — so an upward-facing edge
 * catches the light end and an underside catches the dark. That faint rim on
 * the shadow side is what makes the object sit in the light rather than on
 * top of it. Not shadowed by the key: it comes from behind.
 *
 * `normal` here is three's VIEW-space normal, so the direction is expressed
 * relative to the camera for free: the shadow keeps its place on screen as
 * the scroll shots move, but still wraps around the geometry as the model
 * turns. That distinction is what makes it read as a shadow rather than a
 * screen overlay.
 *
 * Chains any `onBeforeCompile` already on the material (surface variation).
 */
export function applyStudioShade(
	material: THREE.MeshPhysicalMaterial,
	sweep: SweepUniforms,
	opts: StudioShadeOptions = {}
): StudioShadeUniforms {
	const uniforms: StudioShadeUniforms = {
		uShadeOn: { value: opts.on ? 1 : 0 },
		uShadeDir: {
			value: shadeDirection(
				opts.azimuth ?? SHADE_DEFAULTS.azimuth,
				opts.elevation ?? SHADE_DEFAULTS.elevation
			)
		},
		uShadeCoverage: { value: opts.coverage ?? SHADE_DEFAULTS.coverage },
		uShadeSoftness: { value: opts.softness ?? SHADE_DEFAULTS.softness },
		uShadeDepth: { value: opts.depth ?? SHADE_DEFAULTS.depth },
		uBounce: { value: opts.bounce ?? SHADE_DEFAULTS.bounce }
	};

	const prev = material.onBeforeCompile;
	const prevKey = material.customProgramCacheKey.bind(material);

	material.onBeforeCompile = (shader, renderer) => {
		prev.call(material, shader, renderer);
		// The sweep's uniform OBJECTS, not copies: a slider on the pass moves
		// the bounce with it.
		Object.assign(shader.uniforms, uniforms, {
			uLight: sweep.uLight,
			uDark: sweep.uDark,
			uAngle: sweep.uAngle,
			uMid: sweep.uMid,
			uSpread: sweep.uSpread,
			uCurve: sweep.uCurve,
			uLift: sweep.uLift,
			uAspect: sweep.uAspect,
			uResolution: sweep.uResolution
		});
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				/* glsl */ `#include <common>
				uniform float uShadeOn;
				uniform vec3 uShadeDir;
				uniform float uShadeCoverage;
				uniform float uShadeSoftness;
				uniform float uShadeDepth;
				uniform float uBounce;
				uniform vec3 uLight;
				uniform vec3 uDark;
				uniform float uAngle;
				uniform float uMid;
				uniform float uSpread;
				uniform float uCurve;
				uniform float uLift;
				uniform float uAspect;
				uniform vec2 uResolution;
				${SWEEP_GLSL}`
			)
			.replace(
				'#include <opaque_fragment>',
				// Before opaque_fragment: outgoingLight is still linear HDR here,
				// so both terms happen before tone mapping, as light would.
				/* glsl */ `{
					float ndl = dot( normal, uShadeDir );
					float lit = smoothstep( uShadeCoverage - uShadeSoftness, uShadeCoverage + uShadeSoftness, ndl );
					// Depth is perceptual. This runs in linear light before ACES,
					// which lifts a 0.1 multiplier to about a third of the lit
					// value on screen — so a linear slider never got dark. The
					// 2.2 exponent makes 0.9 read as near-black and 0.5 as a
					// convincing mid shadow.
					float floorLevel = pow( 1.0 - uShadeDepth, 2.2 );
					float shade = mix( floorLevel, 1.0, lit );

					// Grazing-angle pickup of the backdrop in the direction the
					// surface faces. 0.3 of the screen is far enough that a top
					// edge reaches the light plateau and an underside the dark.
					vec2 screenUv = gl_FragCoord.xy / uResolution;
					vec3 bounceColor = sweepLinear( screenUv + normal.xy * 0.3 );
					float fresnel = pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), 3.0 );
					vec3 bounce = bounceColor * fresnel * uBounce;

					outgoingLight = mix( outgoingLight, outgoingLight * shade + bounce, uShadeOn );
				}
				#include <opaque_fragment>`
			);
	};
	material.customProgramCacheKey = () => prevKey() + '|studio-shade';
	return uniforms;
}
