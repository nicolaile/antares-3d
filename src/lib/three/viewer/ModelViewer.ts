import * as THREE from 'three';
import { gsap } from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Type-only: these three passes ship off and are imported on demand in
// `addOptionalPasses`, so their shader source stays out of the bundle
// unless a scene actually turns one on.
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import type { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ContactShadow } from './ContactShadow';
import { createGrainPass } from '$lib/three/post/GrainPass';
import {
	DEFAULT_STOPS,
	GradientMapPass,
	type GradientStop,
	type MixSpace,
	type RepeatMode
} from '$lib/three/post/GradientMapPass';
import { applySurfaceVariation } from './surfaceVariation';
import { SweepPass, type SweepOptions } from '$lib/three/post/SweepPass';
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
/** Metres apart at which a group's pieces are shaded each by itself alone (`syncOpen`). */
const OPEN_AT = 0.08;
/** The tone curves the look can take (`tone`). */
const TONES = {
	aces: THREE.ACESFilmicToneMapping,
	neutral: THREE.NeutralToneMapping,
	agx: THREE.AgXToneMapping
} as const;
export type Tone = keyof typeof TONES;
/** The canvas's pixel ratio at most: a retina screen's own. The frame itself is drawn at `maxPixelRatio`. */
const OUTPUT_PIXEL_RATIO = 2;
/** The final colour grade (SweepPass `setGrade`), matched to the offline renders'. */
const PRINT = {
	saturation: 0.6,
	tint: '#f2f6f8',
	contrast: 0.3,
	blackPoint: 0,
	shadows: '#c4cfdf',
	highlights: '#f6f8fa'
};
/** How sharply the last pass sharpens the frame it scales up, 0–1 (SweepPass `sharpen`). */
const SHARPEN = 0.6;
/** How many pixels a level of detail's error may come to on screen (`chooseLod`). */
const LOD_PIXELS = 1;
/** Roughness detail over the finishes (scripts/lab/surface-detail.mjs). */
const DETAIL_URL = '/textures/surface-detail.webp';

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

/**
 * The vertex side of the baked light (`bakedSurface`, `lit`; the bake is
 * scripts/lab/bake-surface.mjs): the key's and the rim's visibility and the
 * whole model's ambient occlusion, into `vVis`.
 *  - The key off its rings, 24 directions round the model (four bits
 *    each, two to a byte), between the two either side of where it stands
 *    (`uRingAt`: the first's index, how far to the next); against the whole
 *    model (`_ringa*`) and the group alone (`_ringg*`). Well off a ring's
 *    height (`uRingAt.z`, `.w`), the whole model's harmonics instead.
 *  - The rim and the ambient off the sky's harmonics (bands 0–2, `_sky*`).
 * Light directions in the model's frame (`uLightDir`: key, rim).
 */
const BAKED_LIGHT_VERTEX = /* glsl */ `
	#ifdef RING_WHOLE
	attribute vec4 _ringa0;
	attribute vec4 _ringa1;
	attribute vec4 _ringa2;
	attribute vec4 _sky0;
	attribute vec4 _sky1;
	attribute vec4 _sky2;
	#endif
	#ifdef RING_GROUP
	attribute vec4 _ringg0;
	attribute vec4 _ringg1;
	attribute vec4 _ringg2;
	#endif
	uniform float uOpen;
	uniform float uOpenLight;
	uniform float uVisOn;
	uniform float uVisWhole;
	uniform vec3 uLightDir[ 2 ];
	uniform vec4 uRingAt;
	uniform mat3 uWorldToModel;
	varying vec3 vVis;
	// Direction k of a ring (0–23): its byte, then the low or high four bits.
	float ringValue( vec4 r0, vec4 r1, vec4 r2, int k ) {
		int q = k / 8;
		vec4 r = q == 0 ? r0 : q == 1 ? r1 : r2;
		float b = floor( r[ ( k % 8 ) / 2 ] * 255.0 + 0.5 );
		float high = floor( b / 16.0 );
		return ( ( k % 2 ) == 0 ? b - high * 16.0 : high ) / 15.0;
	}
	float ringAt( vec4 r0, vec4 r1, vec4 r2 ) {
		int k = int( uRingAt.x );
		return mix( ringValue( r0, r1, r2, k ), ringValue( r0, r1, r2, ( k + 1 ) % 24 ), uRingAt.y );
	}
	#ifdef RING_WHOLE
	// The sky's harmonics at unit d, each band scaled by w.
	float skyAt( vec3 d, vec3 w ) {
		vec4 c0 = vec4( _sky0.x * 3.5449077, ( _sky0.yzw * 2.0 - 1.0 ) * 2.0 );
		vec4 c1 = ( _sky1 * 2.0 - 1.0 ) * 2.0;
		float c2 = ( _sky2.x * 2.0 - 1.0 ) * 2.0;
		float x = d.x, y = d.y, z = d.z;
		vec4 b0 = vec4( 0.282095 * w.x, 0.488603 * y * w.y, 0.488603 * z * w.y, 0.488603 * x * w.y );
		vec4 b1 = vec4( 1.092548 * x * y, 1.092548 * y * z, 0.315392 * ( 3.0 * z * z - 1.0 ), 1.092548 * x * z ) * w.z;
		return dot( c0, b0 ) + dot( c1, b1 ) + c2 * 0.546274 * ( x * x - y * y ) * w.z;
	}
	#endif
	vec3 bakedVisibility( vec3 normalInModel ) {
		// The sky's bands softened a little for the lights (no ringing), and
		// the clamped cosine's own (π, 2π/3, π/4, over π) for the ambient.
		// A group with one ring only takes it in every state: the whole
		// model's for groups only ever seen assembled, the group's own for
		// those only ever seen apart.
		#ifdef RING_WHOLE
			vec3 soft = vec3( 1.0, 0.85, 0.55 );
			float keyWhole = mix( ringAt( _ringa0, _ringa1, _ringa2 ), clamp( skyAt( uLightDir[ 0 ], soft ), 0.0, 1.0 ), uRingAt.z );
			float rim = clamp( skyAt( uLightDir[ 1 ], soft ), 0.0, 1.0 );
			float ambient = clamp( skyAt( normalInModel, vec3( 1.0, 0.666667, 0.25 ) ), 0.0, 1.0 );
		#endif
		#ifdef RING_GROUP
			// With both rings, the group's is what it adds over the whole model's.
			#ifdef RING_DELTA
				float groupRing = min( 1.0, ringAt( _ringa0, _ringa1, _ringa2 ) + ringAt( _ringg0, _ringg1, _ringg2 ) );
			#else
				float groupRing = ringAt( _ringg0, _ringg1, _ringg2 );
			#endif
			// A group's pieces moved apart shade each other less (uOpenLight
			// of the way to none, when fully apart): a little, since they
			// move only a short way and the key comes in low.
			float keyGroup = mix( groupRing, 1.0, uOpen * uOpenLight );
		#else
			float keyGroup = keyWhole;
		#endif
		#ifndef RING_WHOLE
			float keyWhole = keyGroup;
			float rim = 1.0;
			float ambient = 1.0;
		#endif
		vec3 vis = vec3( mix( keyGroup, keyWhole, uVisWhole ), mix( 1.0, rim, uVisWhole ), mix( 1.0, ambient, uVisWhole ) );
		return mix( vec3( 1.0 ), vis, uVisOn );
	}
`;

/**
 * The per-vertex bake (`_surf`, from scripts/lab/bake-surface.mjs): x, y the
 * occlusion by the part alone and by the whole group, blended by `uOpen` so
 * separated pieces stop shading each other; z, w the part's CAD finish (shade,
 * roughness, metal or not). Metal shades map from `uFinishFloor` up to the
 * look's colour; non-metals keep their measured albedo (`uPolymer`). Also adds
 * triplanar roughness detail and grain relief (`tDetail`, in part-local metres
 * so it sticks to moving pieces), a wrapped key (`uWrap`) for a soft-box
 * falloff, and occlusion of the environment's specular and of `uBakedDirect` of the key.
 *
 * And where the files carry it (`lit`), the light's baked visibility, as
 * raspberry.luruke.com lights its berry (precomputed transfer): per vertex,
 * spherical harmonics of what's open to the sky in each direction, against
 * the whole model (`_visa*`, bands 0–3) and against the vertex's group alone
 * (`_visg*`, bands 0–2). Each frame the key's and the rim's directions
 * (`uVisDir`, world) are turned into the part's own frame and read off it,
 * blended from the group's to the whole model's by `uVisWhole` (the model
 * assembled), each band softened by `uVisWindow` so nothing rings: the
 * shadows, without a shadow map. The ambient light takes the whole model's
 * occlusion from it too (its cosine-weighted part, over the group's own,
 * which `_surf` already has), in place of the screen-space occlusion.
 * `uVisOn` 0 leaves the lights as they are.
 */
function bakedSurface(
	shader: THREE.WebGLProgramParametersWithUniforms,
	uniforms: {
		uOpen: { value: number };
		uBakedAO: { value: number };
		uBakedDirect: { value: number };
		uBakedView: { value: number };
		uFinish: { value: number };
		uFinishFloor: { value: number };
		uPolymer: { value: number };
		uFinishSheen: { value: number };
		uFinishReflect: { value: number };
		uDetail: { value: number };
		uDetailTile: { value: number };
		tDetail: { value: THREE.Texture };
		uLocalScale: { value: number };
		uEnvDiffuse: { value: number };
		uWrap: { value: number };
		uSurfaceGrain: { value: number };
		uVisOn: { value: number };
		uVisWhole: { value: number };
		uOpenLight: { value: number };
		uLightDir: { value: THREE.Vector3[] };
		uRingAt: { value: THREE.Vector4 };
		uWorldToModel: { value: THREE.Matrix3 };
	},
	lit: false | { whole: boolean; group: boolean } = false
) {
	Object.assign(shader.uniforms, uniforms);
	if (lit) {
		const rings =
			(lit.whole ? '#define RING_WHOLE\n' : '') +
			(lit.group ? '#define RING_GROUP\n' : '') +
			(lit.whole && lit.group ? '#define RING_DELTA\n' : '');
		shader.vertexShader = '#define BAKED_LIGHT\n' + rings + shader.vertexShader;
		shader.fragmentShader = '#define BAKED_LIGHT\n' + shader.fragmentShader;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${BAKED_LIGHT_VERTEX}`)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvVis = bakedVisibility( normalize( uWorldToModel * ( mat3( modelMatrix ) * objectNormal ) ) );'
			);
	}
	shader.vertexShader = shader.vertexShader
		.replace(
			'#include <common>',
			'#include <common>\nattribute vec4 _surf;\nvarying vec4 vSurf;\nuniform float uLocalScale;\nvarying vec3 vDetailAt;\nvarying vec3 vDetailNormal;'
		)
		.replace(
			'#include <begin_vertex>',
			'#include <begin_vertex>\nvSurf = _surf;\nvDetailAt = position * uLocalScale;\nvDetailNormal = normal;'
		);
	shader.fragmentShader = shader.fragmentShader
		// Scales the env map's diffuse down while a light probe (`syncProbe`) stands in:
		// three's is wider than a cosine, so strips behind would light the front.
		// The chunk is expanded inline because includes resolve only after this hook.
		.replace(
			'#include <lights_fragment_maps>',
			THREE.ShaderChunk.lights_fragment_maps
				.replace(
					'iblIrradiance += getIBLIrradiance( geometryNormal );',
					'iblIrradiance += getIBLIrradiance( geometryNormal ) * uEnvDiffuse;'
				)
				// The polished finishes' own reflections (uFinishReflect), whatever
				// the material's: the soft boxes in machined steel, as in the renders.
				.replace(
					'vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',
					/* glsl */ `vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
					#ifdef ENVMAP_TYPE_CUBE_UV
					if ( finishShine > 0.0 ) {
						vec3 shineDir = reflect( - geometryViewDir, geometryNormal );
						shineDir = normalize( mix( shineDir, geometryNormal, pow4( material.roughness ) ) );
						shineDir = transformDirectionByInverseViewMatrix( shineDir, viewMatrix );
						iblRadiance += textureCubeUV( envMap, envMapRotation * shineDir, material.roughness ).rgb * finishShine;
					}
					#endif`
				)
		)
		.replace(
			'#include <common>',
			'#include <common>\nuniform float uEnvDiffuse;\nuniform float uOpen;\nuniform float uBakedAO;\nuniform float uBakedDirect;\nuniform float uBakedView;\nuniform float uFinish;\nuniform float uFinishFloor;\nuniform float uPolymer;\nuniform float uFinishSheen;\nuniform float uFinishReflect;\nfloat finishShine = 0.0;\nuniform float uDetail;\nuniform float uDetailTile;\nuniform sampler2D tDetail;\nuniform float uWrap;\nuniform float uSurfaceGrain;\nvarying vec4 vSurf;\nvarying vec3 vDetailAt;\nvarying vec3 vDetailNormal;\nfloat keyWrap = 0.0;\nfloat relief = 0.0;\nvec3 bakedVis = vec3( 1.0 );\n#ifdef BAKED_LIGHT\nvarying vec3 vVis;\n#endif'
		)
		// The key wraps (the first directional light: three puts the
		// shadow-casting ones first, and only the key casts).
		.replace(
			'#include <lights_fragment_begin>',
			THREE.ShaderChunk.lights_fragment_begin.replace(
				'getDirectionalLightInfo( directionalLight, directLight );',
				'getDirectionalLightInfo( directionalLight, directLight );\n\t\tkeyWrap = UNROLLED_LOOP_INDEX == 0 ? uWrap : 0.0;\n\t\t#if UNROLLED_LOOP_INDEX < 2\n\t\tdirectLight.color *= bakedVis[ UNROLLED_LOOP_INDEX ];\n\t\t#endif'
			)
		)
		.replace(
			'#include <lights_physical_pars_fragment>',
			THREE.ShaderChunk.lights_physical_pars_fragment
				.replace(
					'vec3 irradiance = dotNL * directLight.color;',
					'vec3 irradiance = dotNL * directLight.color;\n\tvec3 wrapped = saturate( ( dot( geometryNormal, directLight.direction ) + keyWrap ) / ( 1.0 + keyWrap ) ) * directLight.color;'
				)
				.replace(
					'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
					'reflectedLight.directDiffuse += wrapped * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );'
				)
		)
		// The relief, by its slope across the pixel (Mikkelsen's surface
		// gradient, unnormalised: millimetres against the metres moved).
		.replace(
			'#include <normal_fragment_maps>',
			/* glsl */ `#include <normal_fragment_maps>
			// (Skipped whole at no grain: the same for every pixel, so free.)
			if ( uSurfaceGrain > 0.0 ) {
				vec3 sx = dFdx( - vViewPosition );
				vec3 sy = dFdy( - vViewPosition );
				vec3 r1 = cross( sy, normal );
				vec3 r2 = cross( normal, sx );
				float det = dot( sx, r1 ) * faceDirection;
				vec3 grad = sign( det ) * ( dFdx( relief ) * r1 + dFdy( relief ) * r2 );
				normal = normalize( abs( det ) * normal - grad );
			}`
		)
		.replace(
			'#include <metalnessmap_fragment>',
			/* glsl */ `#include <metalnessmap_fragment>
			#ifdef BAKED_LIGHT
				bakedVis = vVis;
			#endif
			{
				// w: roughness in its top seven bits, non-metal in the low one.
				float code = floor( vSurf.w * 255.0 + 0.5 );
				float dielectric = mod( code, 2.0 );
				float rough = floor( code / 2.0 ) / 127.0;
				// A non-metal (graphite, a moulded part) is that material whole, at
				// its measured albedo (z, over the renders' brightest, 0.27): half a
				// metal is neither. Metals' shades map onto this look's colour.
				float strength = mix( uFinish, min( 1.0, uFinish * 4.0 ), dielectric );
				vec3 metal = diffuseColor.rgb * mix( uFinishFloor, 1.0, vSurf.z );
				vec3 plain = vec3( vSurf.z * 0.27 * uPolymer );
				diffuseColor.rgb = mix( diffuseColor.rgb, mix( metal, plain, dielectric ), strength );
				roughnessFactor = mix( roughnessFactor, rough, strength );
				metalnessFactor = mix( metalnessFactor, 0.0, strength * dielectric );
				// Each finish its own sheen (uFinishSheen), as render.py's: machined
				// metal glossier and more metallic, anodised between, cast and
				// blasted metal duller, moulded parts left matte.
				float machined = smoothstep( 0.3, 0.26, rough ) * ( 1.0 - dielectric );
				float dull = smoothstep( 0.4, 0.44, rough ) * ( 1.0 - dielectric );
				float sheenMetal = mix( mix( 0.35, 0.6, machined ), 0.2, dull ) * ( 1.0 - dielectric );
				metalnessFactor = mix( metalnessFactor, sheenMetal, uFinishSheen * strength * ( 1.0 - dielectric ) );
				roughnessFactor /= mix( 1.0, 1.25, uFinishSheen * ( 1.0 - dull ) * ( 1.0 - dielectric ) );
				finishShine = uFinishReflect * strength * mix( mix( 0.5, 1.0, machined ), 0.15, dull ) * ( 1.0 - dielectric );
				// Surface detail, from the three axes, weighted to the one the surface faces.
				vec3 facing = pow( abs( normalize( vDetailNormal ) ), vec3( 4.0 ) );
				facing /= facing.x + facing.y + facing.z;
				vec3 at = vDetailAt / uDetailTile;
				vec2 detail =
					texture2D( tDetail, at.yz ).rg * facing.x +
					texture2D( tDetail, at.xz ).rg * facing.y +
					texture2D( tDetail, at.xy ).rg * facing.z - 0.5;
				// Brushed streaks on the polished finishes, smudges on the rest.
				float brushed = smoothstep( 0.34, 0.24, rough ) * ( 1.0 - dielectric );
				// The streaks at half: whole, they read as ribs on a turned part.
				roughnessFactor = clamp( roughnessFactor + uDetail * mix( detail.y, detail.x * 0.5, brushed ) * 0.3, 0.04, 1.0 );
				// Relief, in metres: grain at an eighth of the tile, deeper on
				// the rougher finishes (render.py's 0.02 brushed to 0.12 graphite).
				if ( uSurfaceGrain > 0.0 ) {
					vec3 fine = at * 8.0;
					float grain =
						texture2D( tDetail, fine.yz ).r * facing.x +
						texture2D( tDetail, fine.xz ).r * facing.y +
						texture2D( tDetail, fine.xy ).r * facing.z - 0.5;
					float grainDepth = mix( 0.2, 1.0, smoothstep( 0.2, 0.6, rough ) );
					relief = 0.001 * uSurfaceGrain * grainDepth * grain;
				}
			}`
		)
		// Tuning: the bake alone, as grey (`bakedView`).
		.replace(
			'#include <dithering_fragment>',
			'#include <dithering_fragment>\nif ( uBakedView > 0.5 ) gl_FragColor = vec4( vec3( uBakedView < 1.5 ? mix( vSurf.y, vSurf.x, uOpen ) : uBakedView < 2.5 ? bakedVis.x : uBakedView < 3.5 ? bakedVis.y : bakedVis.z ), 1.0 );'
		)
		.replace(
			'#include <aomap_fragment>',
			/* glsl */ `#include <aomap_fragment>
			{
				float baked = mix( 1.0, mix( vSurf.y, vSurf.x, uOpen ), uBakedAO ) * bakedVis.z;
				reflectedLight.indirectDiffuse *= baked;
				float bakedNV = saturate( dot( geometryNormal, geometryViewDir ) );
				reflectedLight.indirectSpecular *= computeSpecularOcclusion( bakedNV, baked, material.roughness );
				float direct = mix( 1.0, baked, uBakedDirect );
				reflectedLight.directDiffuse *= direct;
				reflectedLight.directSpecular *= direct;
				#if defined( USE_CLEARCOAT )
					clearcoatSpecularIndirect *= baked;
					clearcoatSpecularDirect *= direct;
				#endif
			}`
		);
}

/** Colour slots the palette holds (`colours`), slot 0 being none. */
const PALETTE_SIZE = 16;

/**
 * Parts given a colour of their own (`colours`): each vertex's palette slot
 * (`_slot`, 0 for none), its colour and how much of it (rgb, a) from a
 * small palette shared by every group (`setColour`), over the part's own
 * finish. In the palette, not the files: a colour changes or fades live,
 * with no recompile and no draw calls added.
 */
function paletteColour(
	shader: THREE.WebGLProgramParametersWithUniforms,
	uniforms: { uPalette: { value: THREE.Vector4[] } }
) {
	Object.assign(shader.uniforms, uniforms);
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nattribute float _slot;\nvarying float vSlot;')
		.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlot = _slot;');
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', `#include <common>\nuniform vec4 uPalette[ ${PALETTE_SIZE} ];\nvarying float vSlot;`)
		.replace(
			'#include <normal_fragment_begin>',
			/* glsl */ `{
				vec4 paint = uPalette[ int( vSlot + 0.5 ) ];
				diffuseColor.rgb = mix( diffuseColor.rgb, paint.rgb, paint.a );
			}
			#include <normal_fragment_begin>`
		);
}

/**
 * Colour slots (`colours`), by name: the parts of `group` that take it, all
 * of them or those `parts` names (the CAD's part ids, the files'
 * `extras.parts`), and the colour they start in (`amount` of it, 1 whole;
 * 0, the default, none yet). `label` names it in the controls panel.
 */
export type ColourSlots = Record<
	string,
	{ group: string; parts?: string[]; label?: string; colour?: string; amount?: number }
>;

/** A colour slot as it stands (`colourSlots`): its colour as #rrggbb. */
export type ColourSlot = { name: string; label: string; colour: string; amount: number };

/** One view's frame, measured (`ModelViewer.profile`): GPU times in ms, memory in bytes. */
export type ViewProfile = {
	full: number;
	shadow: number;
	scene: number;
	post: number;
	calls: number;
	triangles: number;
	step: number;
	steps: number;
	ratio: number;
	ao: number;
	width: number;
	height: number;
	targets: { name: string; width: number; height: number; samples: number; bytes: number }[];
	geometry: Record<string, number>;
};

export interface ModelViewerOptions {
	/** Keeps each vertex's part index on the GPU, for the visibility sampler (`visibleParts`, dev). */
	keepParts?: boolean;
	/**
	 * Path to the optimised .glb (meshopt-compressed, GPU-instanced), or
	 * several that make one model between them (the CAD's groups), loaded
	 * together and placed as authored.
	 */
	url: string | string[];
	/**
	 * Groups (files named as in `url`) fetched only once the model is shown
	 * (`loadDeferred`): parts the first view hardly sees, so it comes up sooner.
	 */
	deferred?: string[];
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
	gradientMap?:
		| {
				on?: boolean;
				stops?: GradientStop[];
				repeat?: RepeatMode;
				space?: MixSpace;
				amount?: number;
				/** Drive the ramp offset from pointer position. */
				followPointer?: boolean;
				/** Seconds for the pointer value to catch up; higher is smoother. */
				followDamping?: number;
		  }
		| false;
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
	 * Join every non-instanced part into one mesh at load. They share one
	 * material, so the export's ~110 separate draws are pure overhead in each
	 * scene render (shadow, beauty). Default on.
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
	carve?: Record<
		string,
		{ from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }
	>;
	/**
	 * Parts given a colour of their own, from a small palette (`ColourSlots`,
	 * `setColour`): up to 15 slots. Needs the CAD's part index (`_part`).
	 */
	colours?: ColourSlots;
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
	/** How much of the bake's occlusion shows, 0–1 (`bakedSurface`). */
	bakedAO: number;
	/** How much of it darkens the key's light too, 0–1. */
	bakedDirect: number;
	/** Shows a bake alone, as grey, for tuning it: 1 the occlusion, 2 the key's baked light, 3 the rim's, 4 the ambient's; 0 none. */
	bakedView: number;
	/** 0 VSM shadows (blurred), 1 filtered comparisons (`setShadowFilter`). */
	shadowFilter: number;
	/** 0/1: the lights' shadows and the ambient's occlusion from the baked visibility (`setBakedLight`), not drawn a frame. */
	bakedLight: number;
	/** 0–1: one shared finish (0) to each part its own, as in the studio renders (`bakedSurface`). */
	finish: number;
	/** The darkest of those finishes, as a share of the look's colour. */
	finishFloor: number;
	/** Non-metals' albedo (graphite, moulded parts), as a share of what's measured. */
	polymer: number;
	/** 0–1: each finish its own sheen, as the renders' (machined glossy, cast dull, moulded matte); 0 one for all. */
	finishSheen: number;
	/** The polished metal finishes' reflections of the studio, machined most and moulded parts none; 0 none. */
	finishReflect: number;
	/** How far the key's light wraps past the terminator, as a soft box's (0 none). */
	wrap: number;
	/** The surface's fine grain, mm deep (`bakedSurface`). */
	surfaceGrain: number;
	/** The tone curve: ACES filmic (the look's), Khronos PBR Neutral, or AgX. */
	tone: Tone;
	/** Lit by soft boxes (createSoftboxEnvironment) rather than the HDR: 1 the 'studio' rig, 2 the 'black' rig. */
	softbox: number;
	/** How sharply the frame is sharpened as it's scaled up to the screen, 0–1. */
	sharpen: number;
	/** How much of the final colour grade (`PRINT`) applies, 0–1. */
	grade: number;
	/** Machined edges brightened, as the renders' edge polish (screen space, with occlusion). */
	edges: number;
	/** Crevices darkened along their creases. */
	cavity: number;
	/** How much of the surface detail shows, 0–1 (roughness varying across a finish). */
	detail: number;
	/** The surface detail's tile, metres. */
	detailTile: number;
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

/**
 * Framework-agnostic three.js scene. Deliberately does NOT own a rAF loop —
 * `render()` is called from the shared GSAP ticker so Lenis, ScrollTrigger and
 * the renderer all advance on one clock. See `$lib/motion/scroll.ts`.
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
			/** How far open it is, for its baked occlusion (`syncOpen`). */
			open: { value: number };
			/** Faded in on arriving late (`loadDeferred`), over its level: 0–1. */
			arrive?: number;
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
	 * A group lit from within (its emissive, so tone mapped with the scene),
	 * `amount` 0 for off. With a `sweep`, only what's above `front` (a height
	 * in the authored frame, metres) glows, or below it with `up` (a rising
	 * glow), with a band at the front brighter by `crest` (1: twice as
	 * bright); without, all of it evenly.
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
		if (!g) {
			// Not loaded yet (`deferred`): kept for when it is.
			this.pendingGroups.set(name, { ...this.pendingGroups.get(name), ...state });
			return;
		}
		if (state.level !== undefined) g.level = state.level;
		if (state.cut !== undefined) g.cut = state.cut;
		if (state.out !== undefined) g.out = state.out;
		if (state.up !== undefined) g.up = state.up;
		this.syncGroup(g);
		for (const piece of g.pieces) this.placePiece(piece, g);
		this.syncOpen(g);
		this.invalidate();
	}

	/**
	 * How far open a group is, for its baked occlusion (`bakedSurface`): its
	 * pieces apart by OPEN_AT or more, or its cut fully open, and it's shaded
	 * by each part alone. Lifting the whole group (`up`) opens nothing.
	 */
	private syncOpen(g: { cut: number; out: number; pieces: Piece[]; open: { value: number } }) {
		let apart = Math.abs(g.out);
		for (const p of g.pieces) apart = Math.max(apart, Math.abs(p.lift ?? 0));
		g.open.value = Math.max(g.cut, Math.min(1, apart / OPEN_AT));
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
		this.syncOpen(g);
		this.invalidate();
	}

	/** Whether a group is drawn at all (`setGroup`'s level above 0). */
	groupShown(name: string) {
		const g = this.groups.get(name);
		return !g || g.node.visible;
	}

	/** The colour slots' palette (`paletteColour`): rgb and how much, linear; slot 0 none. */
	private palette = { uPalette: { value: Array.from({ length: PALETTE_SIZE }, () => new THREE.Vector4()) } };
	/** Each colour slot's place in the palette, by name. */
	private slots = new Map<string, number>();
	/** Each colour slot as last set, for the controls panel (`colourSlots`). */
	private slotStates = new Map<string, ColourSlot>();

	/**
	 * Gives each vertex of the parts `colours` names its slot (`_slot`, a
	 * byte), and the slots their starting colours. Only the groups with a
	 * coloured part carry the attribute; the rest draw as they were.
	 */
	private paintSlots(model: THREE.Object3D, fresh = true) {
		const specs = Object.entries(this.opts.colours ?? {}).slice(0, PALETTE_SIZE - 1);
		// (Once: the groups loaded later keep the slots as they're set by then.)
		if (fresh)
			specs.forEach(([name, spec], i) => {
				this.slots.set(name, i + 1);
				this.slotStates.set(name, { name, label: spec.label ?? name, colour: '#ffffff', amount: 0 });
				if (spec.colour) this.setColour(name, spec.colour, spec.amount ?? 0);
			});
		for (const [name, spec] of specs) {
			const node = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(spec.group));
			if (!node) continue;
			const slot = this.slots.get(name)!;
			node.traverse((o) => {
				const mesh = o as THREE.Mesh;
				const part = mesh.isMesh ? mesh.geometry.getAttribute('_part') : undefined;
				if (!part) return;
				// The part ids, on the file's node (glTF extras), above the mesh.
				let ids: string[] | undefined;
				for (let up: THREE.Object3D | null = mesh; up && !ids; up = up.parent) ids = up.userData.parts;
				const wanted =
					spec.parts && ids ? new Set(spec.parts.map((id) => ids!.indexOf(id)).filter((p) => p >= 0)) : null;
				let attr = mesh.geometry.getAttribute('_slot') as THREE.BufferAttribute | undefined;
				if (!attr)
					mesh.geometry.setAttribute('_slot', (attr = new THREE.BufferAttribute(new Uint8Array(part.count), 1)));
				const out = attr.array as Uint8Array;
				for (let i = 0; i < part.count; i++) if (!wanted || wanted.has(Math.round(part.getX(i)))) out[i] = slot;
			});
		}
	}

	/**
	 * A colour slot's colour (`colours`), `amount` of the way over the parts'
	 * own (0 none, 1 whole); either left out keeps what it was. Cheap enough
	 * to call every frame of a fade.
	 */
	setColour(slot: string, colour?: THREE.ColorRepresentation | null, amount?: number) {
		const i = this.slots.get(slot);
		const state = this.slotStates.get(slot);
		if (!i || !state) return;
		const v = this.palette.uPalette.value[i];
		if (colour != null) {
			const c = new THREE.Color(colour);
			v.set(c.r, c.g, c.b, v.w);
			state.colour = `#${c.getHexString()}`;
		}
		if (amount !== undefined) v.w = amount;
		state.amount = v.w;
		this.invalidate();
	}

	/** The colour slots as they stand, in palette order (the controls panel's). */
	colourSlots(): ColourSlot[] {
		return [...this.slotStates.values()].map((s) => ({ ...s }));
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
		// The file its parts are numbered in, for the visibility sampler.
		holder.userData.file = node.userData.file ?? spec.from;
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
			const lods = await lodsBy(geometry, part, 2, (p) => inside[p]);
			const shared = (tris: Uint32Array | Uint16Array, k: number) => {
				const g = new THREE.BufferGeometry();
				for (const [key, attribute] of Object.entries(geometry.attributes)) g.setAttribute(key, attribute);
				g.setIndex(new THREE.BufferAttribute(tris, 1));
				if (lods[k].length) g.userData.lods = lods[k];
				shareBounds(geometry, g);
				return g;
			};
			mesh.geometry = shared(keep, 0);
			const carved = new THREE.Mesh(shared(take, 1), mesh.material);
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
			// The bake's occlusion, where the files carry it (the landing's do).
			let baked = false;
			node.traverse((o) => {
				if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('_surf')) baked = true;
			});
			// The part's own frame to metres, for its surface detail.
			let scale = 1;
			node.updateWorldMatrix(true, true);
			node.traverse((o) => {
				if ((o as THREE.Mesh).isMesh) scale = o.matrixWorld.getMaxScaleOnAxis();
			});
			const surface = { uOpen: { value: 0 }, uLocalScale: { value: scale }, ...this.baked };
			// The light's baked visibility, where the files carry it.
			let lit: false | { whole: boolean; group: boolean } = false;
			node.traverse((o) => {
				const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null;
				if (!g) return;
				const whole = !!g.getAttribute('_ringa0');
				const group = !!g.getAttribute('_ringg0');
				if (whole || group) lit = { whole, group };
			});
			if (lit) this.lit = true;
			// Colour slots, where any part of it takes one.
			let painted = false;
			node.traverse((o) => {
				if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('_slot')) painted = true;
			});
			material.onBeforeCompile = (shader, renderer) => {
				base.call(material, shader, renderer);
				glowFromWithin(shader, glow);
				if (baked) bakedSurface(shader, surface, lit);
				if (painted) paletteColour(shader, this.palette);
			};
			material.customProgramCacheKey = () =>
				baseKey.call(material) +
				'|glow' +
				(baked ? '|baked' : '') +
				(lit ? `|lit${lit.whole ? 'w' : ''}${lit.group ? 'g' : ''}` : '') +
				(painted ? '|palette' : '');
			const planes = [new THREE.Plane(), new THREE.Plane()];
			material.clippingPlanes = planes;
			material.clipIntersection = true;
			material.clipShadows = true;
			// See-through, a group's own surfaces would blend in arbitrary order and
			// flicker as the view turns: while it fades, a depth-only copy of each mesh
			// draws first (renderOrder −1), so only its nearest surface takes colour.
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
			const g = {
				node,
				material,
				planes,
				level: 1,
				cut: 0,
				out: 0,
				up: 0,
				pieces,
				fold: split?.fold,
				phase,
				open: surface.uOpen
			};
			this.groups.set(name, g);
			this.syncGroup(g);
		}
	}

	/**
	 * Splits a group's meshes into pieces by part (`_part`), each part whole.
	 * `fold`: equal sectors round the axis, centred on `phase` or on the parts'
	 * own angular pattern, so each takes one drum; each moves out along its
	 * spoke, and parts near the axis stay put as a piece of their own.
	 * `layers`: the distinct heights of the broad parts, moving apart about the
	 * middle one. `columns`: one piece per upright run. Pieces share the mesh's
	 * vertex data, each with its own triangles.
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
					// A part index with no vertices (stripped from the landing's
					// files) has no middle; one NaN here sends every part to the
					// first piece.
					if (!(lo[p * 3] <= hi[p * 3])) continue;
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
					return ((Math.round((Math.atan2(z - az, x - ax) - first) / step) % fold) + fold) % fold;
				};
				for (let k = 0; k < fold; k++)
					ways.push(new THREE.Vector3(Math.cos(first + k * step), 0, Math.sin(first + k * step)));
				// The axis's own piece stays.
				ways.push(new THREE.Vector3());
			}
			const pieceOfPart = new Int32Array(n);
			for (let p = 0; p < n; p++) pieceOfPart[p] = classOf(mid(p, 0), mid(p, 1), mid(p, 2));

			const buckets = await trianglesBy(geometry, part, ways.length, (p) => pieceOfPart[p]);
			const lods = await lodsBy(geometry, part, ways.length, (p) => pieceOfPart[p]);
			// Directions in the mesh's parent's frame, which carries the file's Z-up turn.
			const toLocal = new THREE.Matrix3().setFromMatrix4(mesh.parent!.matrixWorld).invert();
			// Each piece gets its own bounds (its parts', built in world space, then
			// moved into the mesh's frame) so a close shot culls the pieces out of frame.
			const toMesh = mesh.matrixWorld.clone().invert();
			const boxes = ways.map(() => new THREE.Box3());
			const corner = new THREE.Vector3();
			for (let p = 0; p < n; p++) {
				const at = p * 3;
				// A part index with no vertices in this mesh.
				if (!(lo[at] <= hi[at])) continue;
				boxes[pieceOfPart[p]]
					.expandByPoint(corner.set(lo[at], lo[at + 1], lo[at + 2]))
					.expandByPoint(corner.set(hi[at], hi[at + 1], hi[at + 2]));
			}
			buckets.forEach((tris, k) => {
				const g = new THREE.BufferGeometry();
				for (const [key, attribute] of Object.entries(geometry.attributes)) g.setAttribute(key, attribute);
				g.setIndex(new THREE.BufferAttribute(tris, 1));
				if (lods[k].length) g.userData.lods = lods[k];
				if (boxes[k].isEmpty()) shareBounds(geometry, g);
				else {
					g.boundingBox = boxes[k].applyMatrix4(toMesh);
					g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
				}
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
	 * Draws the model once, unseen, in every state it can show (each group
	 * see-through with its depth-first copy, then solid) through every pass and
	 * the shadow map. Otherwise the first frame of anything new pays mid-move for
	 * shader links, buffer uploads and new blend pipelines: 100–300 ms. Programs
	 * compile in parallel first (compileAsync); each draw is a task of its own.
	 * Call once the look is final and the camera is on its first shot; it leaves
	 * the canvas blank for the first real frame.
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
		// its buffers and bindings, and all of them in one frame block the main
		// thread for ~100 ms on a slower laptop.
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
	 * parts inside) and is gone by 0. While see-through it casts no shadow,
	 * which can't fade with it.
	 */
	private syncGroup(g: { node: THREE.Object3D; material: THREE.MeshPhysicalMaterial; level: number; arrive?: number }) {
		const base = this.material;
		const m = g.material;
		// (Its arriving fades the look only: the baked light reads the level.)
		const k = g.level * (g.arrive ?? 1);
		// Below a level of 0.1 its light dims too: the canvas composites over the
		// backdrop as drawn, so a highlight on a part all but gone would still
		// glint at full strength.
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
		this.eyeRotation.set(
			this.scrollRotation.x,
			this.scrollRotation.y + this.autoRotation,
			this.scrollRotation.z,
			'ZXY'
		);
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
		const at = this.sectionAt
			.set(...section.at)
			.add(this.offset)
			.applyMatrix4(this.root.matrixWorld);
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
	private renderPass: BeautyPass;
	/** The scene's own multisampled target, colour and depth (BeautyPass). */
	private beauty: THREE.WebGLRenderTarget;
	private outputPass: OutputPass;
	private bloom: UnrealBloomPass | null = null;
	private gtao: SceneGTAOPass | null = null;
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

	/**
	 * Render on demand: every tick advances the rotation, but a frame is drawn
	 * only when something visible changed, so a paused model costs nothing. A
	 * turn that is only the slow auto-rotation draws at SPIN_FPS.
	 */
	private dirty = true;
	/** Everything a frame depends on apart from the slow turn, this tick's and the last drawn frame's (`shouldDraw`). */
	private view = new Float64Array(14);
	private lastView = new Float64Array(14).fill(NaN);
	/** The last frame drawn was for the slow turn alone, nothing else having moved. */
	private spinOnly = false;
	/** Whether the slow turn's last frame drew the shadow map (`render`). */
	private spinShadow = false;
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

		// alpha: the page shows through untouched (tone mapping would shift a solid
		// scene.background). No antialias or depth: only full-screen quads reach the
		// canvas; the beauty target holds the MSAA and depth (16 MB saved at 2770×1478).
		this.renderer = new THREE.WebGLRenderer({
			antialias: false,
			alpha: true,
			depth: false,
			powerPreference: 'high-performance'
		});
		// The canvas at the screen's resolution; the frame at `maxPixelRatio` (or
		// adaptive quality's lower steps), scaled up and sharpened by the last pass
		// (SweepPass) rather than left for the browser to blur up.
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, OUTPUT_PIXEL_RATIO));
		this.renderRatio = Math.min(window.devicePixelRatio, opts.maxPixelRatio ?? 2);
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.95;
		// Refraction renders the scene once more behind glass; three-quarter
		// resolution is imperceptible on a blurred sample and much cheaper.
		this.renderer.transmissionResolutionScale = 0.75;
		// VSM is the one shadow type with a real blur radius; PCF's `radius`
		// is a no-op on the soft variant. Slight light-bleed is the trade
		// (`shadowFilter` 1 for filtered comparisons instead).
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		// Manual: three re-renders the shadow map on EVERY scene render, so a
		// pass that draws the scene again would redraw it
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
		// The soft boxes' diffuse light (`syncProbe`), dark until they're on.
		this.light.intensity = 0;
		this.scene.add(this.light);

		// Post: scene (multisampled) -> AO -> bloom -> tone map + sRGB.
		// OutputPass owns tone mapping, so the scene pass sees linear HDR.
		const size = new THREE.Vector2();
		this.renderer.getDrawingBufferSize(size);
		// Only the scene is multisampled (BeautyPass); the composer's buffers stay
		// single-sampled, since full-screen quads have no edges and multisampling
		// them doubles the frame's cost. 4× is Apple GPUs' max (more is silently
		// clamped) and at a pixel ratio of 2 holds the thin rails steady.
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
			// Occlusion multiplies onto scene colour, keeping the scene's alpha so the
			// transparent backdrop survives. It reads the scene pass's depth and
			// rebuilds normals from it (SceneGTAOPass): GTAO's own normal pass redraws
			// the model ignoring the cutaways, shading inside cut parts.
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
		const ratio = this.renderRatio;
		const ao = opts.ao === false ? 0 : (opts.aoScale ?? 1);
		const ratios = [ratio, ...PIXEL_RATIOS.filter((r) => r < ratio - 0.01)];
		this.ladder = [{ ratio, ao }];
		if (ao > 0.5) this.ladder.push({ ratio, ao: 0.5 });
		for (const r of ratios.slice(1)) this.ladder.push({ ratio: r, ao: Math.min(ao, 0.5) });
		if (ao > 0) this.ladder.push({ ratio: ratios[ratios.length - 1], ao: 0 });
		this.aoScale = ao;
		this.outputPass = new OutputPass();
		this.composer.addPass(this.outputPass);
		this.syncPasses();
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
			this.sweep.sharpen = SHARPEN;
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
		// Move and release listen on the window: a release off the canvas would
		// otherwise never end the drag, leaving the model spinning. Pointer capture
		// doesn't reliably survive leaving the window; `blur` covers alt-tabbing.
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
	 * ships them off never downloads their shader source. SSR replaces the
	 * RenderPass at the front; DoF and bloom go just before OutputPass, in that
	 * order.
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
			this.syncPasses();
		}
		if (opts.dof !== false) {
			const { BokehPass } = await import('three/examples/jsm/postprocessing/BokehPass.js');
			if (this.disposed) return;
			this.bokeh = new BokehPass(this.scene, this.camera, {
				focus: 20,
				aperture: 0.0007,
				maxblur: opts.dof?.maxblur ?? 0.006
			});
			// Stock BokehShader forces alpha to 1, turning the transparent canvas into
			// an opaque black rectangle. Without that line the blurred alpha stays, and
			// on a premultiplied canvas averaging RGBA jointly is the correct edge math.
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
		const [model] = await Promise.all([
			this.loadModel(),
			this.loadEnvironment(),
			this.addOptionalPasses(),
			this.loadDetail()
		]);
		if (this.disposed) return model;
		this.lodErrors = foldLods(model);

		// One shared material for every part: one shader program, and one
		// object to tune. The glTF's own material is dropped.
		this.material = createMaterial(this.opts.material ?? 'satin', this.opts.color ?? 0xf24a2e);
		softShadows(this.material);
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
		this.adopt(model);
		// Colour slots before carving, which shares each mesh's attributes.
		this.paintSlots(model);
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
		// The part index (carving and splitting, done now) and the CAD's
		// colours (in the files /cad loads) ride along but no shader reads
		// them, and three uploads every attribute a geometry has.
		model.traverse((o) => {
			const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
			if (!(o as THREE.Mesh).isMesh || !g) return;
			if (!this.opts.keepParts) g.deleteAttribute('_part');
			g.deleteAttribute('color');
		});

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
		this.model = model;

		this.radius = Math.max(size.x, size.y, size.z) * (this.opts.fitOffset ?? 1.95);

		// Shadow frustum hugs the model's bounds (a loose one wastes the map and the
		// shadow goes blotchy), 1.1× so the floor shadow, which falls about the
		// model's height away from the light, stays inside the map.
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
			// Receives the key's shadow. The contact shadow says "touching
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

		// Depth precision is set by the near plane (resolution at z ≈ z² / (near · 2^bits)):
		// at 0.1, touching CAD parts z-fight and flicker as the model breathes. This
		// stays ~3× clear of the closest shot with ~10× the precision.
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

		// Compile every material variant now, so the reveal doesn't stutter while
		// physical, shadow and depth programs link one after another. The
		// see-through variants and the passes' shaders compile in `warmUp`.
		await this.renderer.compileAsync(this.scene, this.camera);
		if (!this.disposed) this.opts.onProgress?.(1);

		return model;
	}

	private urls() {
		return typeof this.opts.url === 'string' ? [this.opts.url] : this.opts.url;
	}
	private isDeferred(url: string) {
		return !!this.opts.deferred?.includes(url.replace(/^.*\//, '').replace(/\.glb$/, ''));
	}

	/** The model as loaded (`load`), which the later groups join. */
	private model: THREE.Group | null = null;
	/** `loadDeferred`, once started. */
	private deferredLoad: Promise<void> | null = null;
	/** How a group not yet loaded was last set (`setGroup`), for when it arrives. */
	private pendingGroups = new Map<string, { level?: number; cut?: number; out?: number; up?: number }>();

	/**
	 * The groups held back (`deferred`), fetched, set up as `load` sets up the
	 * rest, and faded in: each compiled and drawn once out of sight first, so
	 * arriving costs the frames on screen nothing. Each takes how it was last
	 * set before it was there. Resolves when they're in (at once without any,
	 * or before `load` has resolved).
	 */
	loadDeferred() {
		// (Only once there's a model to join: before, nothing to wait on yet.)
		if (!this.model) return Promise.resolve();
		return (this.deferredLoad ??= this.fetchDeferred());
	}
	private async fetchDeferred() {
		const urls = this.urls().filter((url) => this.isDeferred(url));
		const model = this.model;
		if (!urls.length || !model || this.disposed) return;
		const loader = new GLTFLoader();
		loader.setMeshoptDecoder(MeshoptDecoder);
		const scenes = (await Promise.all(urls.map((url) => loader.loadAsync(url)))).map((gltf) => gltf.scene);
		if (this.disposed) return;
		const before = new Set(this.groups.keys());
		for (const scene of scenes) {
			for (const error of foldLods(scene)) if (!this.lodErrors.includes(error)) this.lodErrors.push(error);
			this.adopt(scene);
			this.paintSlots(scene, false);
			// Unseen until set up and faded in.
			scene.visible = false;
			model.add(scene);
		}
		this.lodErrors.sort((a, b) => a - b);
		for (const [name, spec] of Object.entries(this.opts.carve ?? {}))
			if (this.opts.deferred?.includes(spec.from)) await this.carveGroup(model, name, spec);
		await this.splitGroups(model);
		if (this.disposed) return;
		const added = [...this.groups].filter(([name]) => !before.has(name));
		for (const [, g] of added)
			g.node.traverse((o) => {
				const geometry = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
				if (!(o as THREE.Mesh).isMesh || !geometry) return;
				if (!this.opts.keepParts) geometry.deleteAttribute('_part');
				geometry.deleteAttribute('color');
				if (!geometry.boundingBox) shareBounds(geometry, geometry);
			});
		// Its levels of detail swapped in with the rest's at the next frame.
		this.lod = -1;
		// Out of sight: see-through and solid compiled, then each drawn alone
		// into a pixel, which uploads its buffers. Each step shows them and
		// hides them again in one go, so no frame on screen catches them.
		for (const [name, g] of added) {
			const pending = this.pendingGroups.get(name);
			this.pendingGroups.delete(name);
			g.arrive = 0;
			// (Without any, as the stage last set it while it was being split.)
			if (pending) this.setGroup(name, pending);
			else this.syncGroup(g);
		}
		for (const scene of scenes) scene.visible = true;
		const target = new THREE.WebGLRenderTarget(1, 1);
		const all = [...this.groups.values()];
		const offstage = (show: (g: (typeof all)[number]) => void, run: () => void) => {
			const shown = all.map((g) => g.node.visible);
			all.forEach((g) => (g.node.visible = false));
			for (const [, g] of added) show(g);
			run();
			for (const [, g] of added) this.syncGroup(g);
			all.forEach((g, i) => (g.node.visible = shown[i]));
		};
		for (const level of [0.5, 1]) {
			offstage(
				(g) => this.syncGroup({ ...g, level: Math.max(g.level, 0.01) * level, arrive: 1 }),
				() => this.renderer.compile(this.scene, this.camera)
			);
			// Linked off the main thread where the GPU can.
			for (let i = 0; i < 10; i++) await nextFrame();
			if (this.disposed) break;
		}
		for (const [, g] of added) {
			if (this.disposed || this.contextLost) break;
			await nextFrame();
			offstage(
				(other) => {
					if (other !== g) return;
					this.syncGroup({ ...g, arrive: 1 });
					g.node.visible = true;
				},
				() => {
					// (The shadow map left as it is: it holds the whole model.)
					const shadows = this.renderer.shadowMap.autoUpdate;
					this.renderer.shadowMap.autoUpdate = false;
					this.renderer.setRenderTarget(target);
					this.renderer.render(this.scene, this.camera);
					this.renderer.setRenderTarget(null);
					this.renderer.shadowMap.autoUpdate = shadows;
				}
			);
		}
		target.dispose();
		if (this.disposed) return;
		for (const [, g] of added) {
			this.syncGroup(g);
			gsap.to(g, {
				arrive: 1,
				duration: 0.8,
				ease: 'power2.out',
				onUpdate: () => {
					this.syncGroup(g);
					this.invalidate();
				}
			});
		}
	}

	/** The shared material and shadows on each mesh in place of the file's own. */
	private adopt(model: THREE.Object3D) {
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
	}

	private async loadModel() {
		const loader = new GLTFLoader();
		// Required: the asset uses EXT_meshopt_compression + KHR_mesh_quantization.
		// EXT_mesh_gpu_instancing is handled natively and yields InstancedMesh.
		loader.setMeshoptDecoder(MeshoptDecoder);
		// Decoded off the main thread (several megabytes of it), in two
		// workers shared by every viewer on the page.
		MeshoptDecoder.useWorkers(2);
		const urls = this.urls().filter((url) => !this.isDeferred(url));
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

	/** Lit by the soft boxes (`softbox`), their environment built the first time. */
	private softbox = false;
	/** Each rig's environment map, made the first time it's lit by. */
	private softboxRT: Partial<Record<'studio' | 'black', THREE.WebGLRenderTarget>> = {};
	/** Which soft-box rig lights the model (`softbox` 1 'studio', 2 'black'). */
	private rig: 'studio' | 'black' = 'studio';
	/**
	 * The broad soft boxes' diffuse light as spherical harmonics (three's light
	 * probe): what a matte surface facing each way receives, summed over each
	 * box's area as bright as in the environment map, turned with the camera.
	 * The key's own comes from the directional key, which casts the shadows.
	 */
	private light = new THREE.LightProbe();
	private probeYaw = NaN;
	private syncProbe(yaw: number) {
		if (Math.abs(yaw - this.probeYaw) < 1e-4) return;
		this.probeYaw = yaw;
		const sh = this.light.sh;
		sh.zero();
		const basis = this.shBasis;
		const [c, right, up, d] = this.probeVecs;
		const radianceOf = (b: Softbox) => (b.power * b.distance * b.distance) / (b.width * b.length);
		const key = radianceOf(SOFTBOXES[0]);
		const K = 6;
		// The broad ones only: a strip's light is too small for nine numbers to
		// hold, and spread into a glow from every side (its own light instead:
		// `syncStrips`).
		for (const box of SOFTBOXES.slice(1).filter((b) => !isStrip(b))) {
			const az = THREE.MathUtils.degToRad(box.azimuth);
			const el = THREE.MathUtils.degToRad(box.elevation);
			c.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(box.distance);
			right.set(0, 1, 0).cross(c).normalize();
			up.crossVectors(c, right).normalize();
			// Each of K×K patches: its radiance times the solid angle it fills.
			const weight = ((radianceOf(box) / key) * box.width * box.length) / (K * K * box.distance * box.distance);
			for (let i = 0; i < K; i++)
				for (let j = 0; j < K; j++) {
					d.copy(c)
						.addScaledVector(right, ((i + 0.5) / K - 0.5) * box.width)
						.addScaledVector(up, ((j + 0.5) / K - 0.5) * box.length)
						.normalize()
						.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
					THREE.SphericalHarmonics3.getBasisAt(d, basis);
					for (let k = 0; k < 9; k++) sh.coefficients[k].addScalar(basis[k] * weight);
				}
		}
	}
	private shBasis = new Array<number>(9).fill(0);

	/**
	 * The rig's strips (the rims and the side strip) as directional lights,
	 * round the camera with the rest: a strip lights what faces it and
	 * nothing else, the bright edge it traces down a silhouette. Each as
	 * strong against the key as in the offline rig (power for power); their
	 * reflections stay the environment map's.
	 */
	private strips: THREE.DirectionalLight[] = [];
	private syncStrips(yaw: number) {
		const boxes = SOFTBOXES.filter(isStrip);
		while (this.strips.length < boxes.length) {
			const light = new THREE.DirectionalLight(0xffffff, 0);
			this.scene.add(light, light.target);
			this.strips.push(light);
		}
		const key = this.lights.key;
		boxes.forEach((box, i) => {
			const light = this.strips[i];
			const az = THREE.MathUtils.degToRad(box.azimuth);
			const el = THREE.MathUtils.degToRad(box.elevation);
			light.visible = this.softbox && this.rig === 'black' && key.visible;
			light.intensity = (key.intensity * box.power) / SOFTBOXES[0].power;
			light.target.position.copy(this.target);
			light.position
				.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
				.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw)
				.multiplyScalar(this.radius)
				.add(this.target);
			light.target.updateMatrixWorld();
		});
	}
	private probeVecs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

	private setSoftbox(which: number) {
		const on = which > 0;
		this.softbox = on;
		this.rig = which >= 2 ? 'black' : 'studio';
		// The black rig's diffuse light is the probe's and the strips'; the
		// studio rig's is the environment map's own.
		const black = on && this.rig === 'black';
		this.baked.uEnvDiffuse.value = black ? 0 : 1;
		this.light.intensity = black ? this.scene.environmentIntensity : 0;
		if (black) this.probeYaw = NaN;
		if (on && !this.softboxRT[this.rig]) {
			const env = black ? createSoftboxEnvironment(SOFTBOXES) : createSoftboxEnvironment(STUDIO_SOFTBOXES, 0x030303);
			this.softboxRT[this.rig] = this.pmrem.fromScene(env, 0, 0.1, 100);
			disposeScene(env);
		}
		this.scene.environment = (on ? this.softboxRT[this.rig]?.texture : this.envRT?.texture) ?? null;
		if (!on) this.scene.environmentRotation.set(0, 0, 0);
		this.invalidate();
	}

	/** The surface detail texture (`bakedSurface`); without it, surfaces stay as they are. */
	private async loadDetail() {
		try {
			const texture = await new THREE.TextureLoader().loadAsync(DETAIL_URL);
			if (this.disposed) return texture.dispose();
			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			texture.colorSpace = THREE.NoColorSpace;
			// Sharp at the glancing angles a turning cylinder shows most of.
			texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
			this.baked.tDetail.value.dispose();
			this.baked.tDetail.value = texture;
		} catch {
			// Not essential: the finishes stand without it.
		}
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
		if (!this.softbox) this.scene.environment = this.envRT.texture;
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
			tone: (Object.keys(TONES) as Tone[]).find((k) => TONES[k] === this.renderer.toneMapping) ?? 'aces',
			softbox: this.softbox ? (this.rig === 'black' ? 2 : 1) : 0,
			sharpen: this.sweep?.sharpen ?? 0,
			grade: this.gradeAmount,
			edges: this.gtao?.ridge ?? 0,
			cavity: this.gtao?.valley ?? 0,
			bloom: this.bloom?.strength ?? 0,
			bloomThreshold: this.bloom?.threshold ?? 1,
			ao: this.gtao ? this.aoAmount : 0,
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
			studioKey: this.studioKeyFollow ? 1 : 0,
			bakedAO: this.baked.uBakedAO.value,
			bakedDirect: this.baked.uBakedDirect.value,
			bakedView: this.baked.uBakedView.value,
			bakedLight: this.baked.uVisOn.value,
			shadowFilter: this.renderer.shadowMap.type === THREE.PCFShadowMap ? 1 : 0,
			finish: this.baked.uFinish.value,
			finishFloor: this.baked.uFinishFloor.value,
			polymer: this.baked.uPolymer.value,
			finishSheen: this.baked.uFinishSheen.value,
			finishReflect: this.baked.uFinishReflect.value,
			detail: this.baked.uDetail.value,
			detailTile: this.baked.uDetailTile.value,
			wrap: this.baked.uWrap.value,
			surfaceGrain: this.baked.uSurfaceGrain.value
		};
	}

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

	/**
	 * Parameters actually backed by a live pass. Anything omitted here has no
	 * effect — a disabled pass leaves its setter a silent no-op, so the
	 * controls panel hides those rows rather than showing a dead slider.
	 */
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
			'exposure',
			'tone',
			'softbox',
			'sharpen',
			'grade',
			'edges',
			'cavity'
		];
		if (this.bloom) keys.push('bloom', 'bloomThreshold');
		if (this.gtao) keys.push('ao');
		if (this.lit) keys.push('bakedLight');
		if ([...this.groups.values()].some((g) => g.material.customProgramCacheKey().includes('|baked')))
			keys.push(
				'bakedAO',
				'bakedDirect',
				'bakedView',
				'finish',
				'finishFloor',
				'polymer',
				'finishSheen',
				'finishReflect',
				'detail',
				'detailTile',
				'wrap',
				'surfaceGrain'
			);
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
			// A light at nothing is taken out, not left in every pixel's light
			// loop adding zero (the look has the rim and the ambient at 0).
			case 'key':
				this.lights.key.intensity = n;
				this.lights.key.visible = n > 0;
				break;
			case 'rim':
				this.lights.rim.intensity = n;
				this.lights.rim.visible = n > 0;
				break;
			case 'ambient':
				this.lights.hemi.intensity = n;
				this.lights.hemi.visible = n > 0;
				break;
			case 'environment':
				this.scene.environmentIntensity = n;
				if (this.softbox && this.rig === 'black') this.light.intensity = n;
				break;
			case 'exposure':
				this.renderer.toneMappingExposure = n;
				break;
			case 'sharpen':
				if (this.sweep) {
					this.sweep.sharpen = n;
					this.syncSweep();
				}
				break;
			case 'edges':
				if (this.gtao) this.gtao.ridge = n;
				break;
			case 'cavity':
				if (this.gtao) this.gtao.valley = n;
				break;
			case 'grade':
				this.gradeAmount = n;
				this.gtao?.setGrade({ amount: n, ...PRINT });
				break;
			case 'softbox':
				this.setSoftbox(n);
				break;
			case 'tone':
				// The passes that tone map read it each frame (OutputPass, the occlusion's composite).
				this.renderer.toneMapping = TONES[value as Tone] ?? THREE.ACESFilmicToneMapping;
				break;
			case 'bloom':
				if (this.bloom) this.bloom.strength = n;
				break;
			case 'bloomThreshold':
				if (this.bloom) this.bloom.threshold = n;
				break;
			case 'ao':
				this.aoAmount = n;
				if (this.gtao) this.gtao.blendIntensity = n;
				break;
			case 'bakedAO':
				this.baked.uBakedAO.value = n;
				break;
			case 'bakedDirect':
				this.baked.uBakedDirect.value = n;
				break;
			case 'bakedView':
				this.baked.uBakedView.value = n;
				break;
			case 'bakedLight':
				this.setBakedLight(n > 0.5);
				break;
			case 'shadowFilter':
				this.setShadowFilter(n > 0.5);
				break;
			case 'finish':
				this.baked.uFinish.value = n;
				break;
			case 'finishFloor':
				this.baked.uFinishFloor.value = n;
				break;
			case 'polymer':
				this.baked.uPolymer.value = n;
				break;
			case 'finishSheen':
				this.baked.uFinishSheen.value = n;
				break;
			case 'finishReflect':
				this.baked.uFinishReflect.value = n;
				break;
			case 'detail':
				this.baked.uDetail.value = n;
				break;
			case 'detailTile':
				this.baked.uDetailTile.value = n;
				break;
			case 'wrap':
				this.baked.uWrap.value = n;
				break;
			case 'surfaceGrain':
				this.baked.uSurfaceGrain.value = n;
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
				if (!this.studioKeyFollow && this.studioOn) this.homeKey();
				break;
		}
		// The groups' copies follow the shared material.
		for (const g of this.groups.values()) this.syncGroup(g);
	}

	/** The key back where the look puts it, aimed at the model's centre again (`fitShadow` moves its aim). */
	private homeKey() {
		const { key } = this.lights;
		key.target.position.set(0, 0, 0);
		key.target.updateMatrixWorld();
		key.position.copy(this.keyHome);
	}

	/**
	 * Fits the key's shadow map each tick to what's drawn, so its texels go to
	 * what the camera sees: the shown meshes' bounds (pieces wherever they've
	 * moved, hidden groups left out) in the light's frame, no wider than the
	 * view, since nothing outside it casts into it. Sides move in 5% steps
	 * (shrinking only by two) and the middle by whole texels, so a glide doesn't
	 * set shadow edges crawling. Only the light's aim moves, not its direction.
	 * With a floor to shadow (`groundShadow`) the map keeps `load`'s fixed frame.
	 */
	private fitShadow() {
		const { key } = this.lights;
		if (!key.castShadow || this.fitRadius <= 0 || this.ground) return;
		const { x, y, z: dir } = this.shadowAxes;
		dir.subVectors(key.position, key.target.position);
		if (dir.lengthSq() < 1e-12) return;
		dir.normalize();
		// The light's grid: its camera looks back along `dir`, up as near world up as it can.
		x.crossVectors(this.camera.up, dir);
		if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
		x.normalize();
		y.crossVectors(dir, x);
		// What's drawn, in the light's frame: each shown mesh's box corners.
		const lo = this.shadowLo.set(Infinity, Infinity, Infinity);
		const hi = this.shadowHi.set(-Infinity, -Infinity, -Infinity);
		const box = this.shadowBox;
		const p = this.shadowCentre;
		this.root.traverseVisible((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh || mesh.userData.depthFirst || !mesh.geometry.boundingBox) return;
			box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
			for (let c = 0; c < 8; c++) {
				p.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z);
				const u = p.dot(x);
				const v = p.dot(y);
				const w = p.dot(dir);
				if (u < lo.x) lo.x = u;
				if (u > hi.x) hi.x = u;
				if (v < lo.y) lo.y = v;
				if (v > hi.y) hi.y = v;
				if (w < lo.z) lo.z = w;
				if (w > hi.z) hi.z = w;
			}
		});
		if (lo.x > hi.x) return;
		// No wider than the view: a sphere round the camera's target through the frame's corners.
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		const view = this.camera.position.distanceTo(this.target) * tan * Math.hypot(1, this.camera.aspect);
		const tu = this.target.dot(x);
		const tv = this.target.dot(y);
		lo.x = Math.max(lo.x, tu - view);
		hi.x = Math.min(hi.x, tu + view);
		lo.y = Math.max(lo.y, tv - view);
		hi.y = Math.min(hi.y, tv + view);
		if (lo.x > hi.x || lo.y > hi.y) return;
		// Square (the map is), in steps: up at once, to keep all of it in,
		// but down only by two, so the slow turn doesn't flick it between two
		// sizes and the shadows' softness with it. The middle on whole texels.
		const step = (n: number) => Math.pow(1.05, Math.ceil(Math.log(n) / Math.log(1.05)));
		const need = step(Math.max(hi.x - lo.x, hi.y - lo.y) / 2 + this.fitRadius * 0.02);
		const half = (this.shadowHalf = need > this.shadowHalf || need < this.shadowHalf / 1.1 ? need : this.shadowHalf);
		const texel = (2 * half) / key.shadow.mapSize.x;
		const cu = Math.round((lo.x + hi.x) / 2 / texel) * texel;
		const cv = Math.round((lo.y + hi.y) / 2 / texel) * texel;
		// Aimed at the box's middle, the light back past its nearest corner.
		const cw = (lo.z + hi.z) / 2;
		const depth = (hi.z - lo.z) / 2 + this.fitRadius * 0.05;
		key.target.position.set(0, 0, 0).addScaledVector(x, cu).addScaledVector(y, cv).addScaledVector(dir, cw);
		key.target.updateMatrixWorld();
		key.position.copy(key.target.position).addScaledVector(dir, depth * 2);
		const sc = key.shadow.camera;
		const near = depth;
		const far = depth * 3;
		if (sc.right !== half || sc.near !== near || sc.far !== far) {
			sc.left = sc.bottom = -half;
			sc.right = sc.top = half;
			sc.near = near;
			sc.far = far;
			sc.updateProjectionMatrix();
		}
	}
	private shadowAxes = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
	private shadowHalf = 0;
	private shadowLo = new THREE.Vector3();
	private shadowHi = new THREE.Vector3();
	private shadowBox = new THREE.Box3();
	private shadowCentre = new THREE.Vector3();

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
	 * The sweep pass runs with the studio (its backdrop and shade) and, with
	 * the studio off, for the scale-up and sharpening alone: the frame is
	 * drawn smaller than the canvas, and a plain stretch would leave it soft.
	 */
	private syncSweep() {
		if (!this.sweep) return;
		this.sweep.backdrop = this.studioOn;
		this.sweep.enabled = this.studioOn || this.sweep.sharpen > 0;
		this.invalidate();
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
		this.syncSweep();
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
			this.homeKey();
		}
		for (const fn of this.studioHandlers) fn(on);
	}

	/** Count of real draw calls from the last frame — handy while tuning. */
	get drawCalls() {
		return this.renderer.info.render.calls;
	}

	/** The last frame drawn: its draw calls, triangles, and the CPU's time submitting it, ms (PerfHud). */
	readonly lastFrame = { calls: 0, triangles: 0, cpu: 0 };

	/** Where adaptive quality stands: its step, the pixel ratio, the drawing buffer's size. */
	get quality() {
		const { width, height } = this.composer.renderTarget1;
		return {
			step: this.pace.step,
			steps: this.ladder.length,
			ratio: this.renderRatio,
			ao: this.aoScale,
			width,
			height
		};
	}

	/** Holds adaptive quality at step `i` (0, the full frame), for measuring like with like. */
	holdStep(i = 0) {
		this.setStep(Math.min(i, this.ladder.length - 1));
		this.pace.stepped = null;
		this.pace.done = true;
	}

	/** Back to no slow turn at all, so a run of views comes out the same each time (perf.ts). */
	resetSpin() {
		this.autoRotation = 0;
		this.invalidate();
	}

	/** The view as it stands, drawn now and read back as a PNG (perf.ts). */
	snapshot() {
		this.renderer.shadowMap.needsUpdate = true;
		this.composer.render();
		// Read in the same task as the draw, before the canvas is presented and cleared.
		return new Promise<Blob | null>((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
	}

	/** Off stage: nothing drawn, and the frame's buffers given back (`sleep`). */
	private asleep = false;

	/**
	 * For a viewer out of sight a while (the explorer's other model, once
	 * faded out): the frame's buffers go, the canvas, the scene's
	 * multisampled target, the passes' and the shadow maps, a few hundred
	 * megabytes of GPU memory at a pixel ratio of 2; and nothing is drawn.
	 * The model, materials and compiled programs all stay, so `wake` is
	 * quick: the buffers come back for the next frame drawn.
	 */
	sleep() {
		if (this.asleep || this.disposed) return;
		this.asleep = true;
		this.resize();
		for (const light of [this.lights.key, this.lights.rim]) {
			// three makes a shadow map again the next time one's needed.
			light.shadow.map?.dispose();
			light.shadow.map = null;
			light.shadow.mapPass?.dispose();
			light.shadow.mapPass = null;
		}
	}

	/** Back from `sleep`: full size again, a fresh frame on the next tick. */
	wake() {
		if (!this.asleep || this.disposed) return;
		this.asleep = false;
		this.resize();
	}

	/** Whether any group carries the light's baked visibility (`bakedSurface`'s `lit`). */
	private lit = false;
	/** The screen-space occlusion's strength as set (`ao`), which the baked light scales down while the model is assembled. */
	private aoAmount = 0.9;
	/** The key's height in the model's frame each of its rings was baked at (scripts/lab/bake-surface.mjs RING_EL), radians. */
	private ringEl = { whole: THREE.MathUtils.degToRad(41), group: THREE.MathUtils.degToRad(34) };

	/**
	 * The lights by their baked visibility rather than the shadow map, and
	 * the ambient by the baked whole-model occlusion rather than the
	 * screen-space pass (`bakedLight`): neither drawn a frame.
	 */
	private setBakedLight(on: boolean) {
		this.baked.uVisOn.value = on ? 1 : 0;
		const key = this.lights.key;
		if (key.castShadow === on) {
			key.castShadow = !on;
			// The materials' shadow code compiles in or out with it.
			for (const g of this.groups.values()) g.material.needsUpdate = true;
			this.material.needsUpdate = true;
		}
		if (this.gtao) {
			// The pass stays for the frame's finish (tone mapping, the grade);
			// its occlusion only while the model is apart (`syncBakedLight`).
			this.gtao.occlude = !on;
			this.gtao.blendIntensity = this.aoAmount;
			this.gtao.enabled = on || this.aoScale > 0;
			this.syncPasses();
		}
		this.invalidate();
	}

	/**
	 * The key's shadow as filtered depth comparisons (PCF, `softShadows`)
	 * rather than VSM: three's VSM calls a point fully lit wherever it's
	 * nearer the light than the blurred mean depth, and where an edge in the
	 * map meets empty space (a lid's rim, handles, cable trays, seen from the
	 * light) the blur pulls the mean out to the far plane, so the shadows
	 * under them come and go as the model turns. Each its own bias: VSM's
	 * blur hides acne that comparisons show.
	 */
	private setShadowFilter(pcf: boolean) {
		const type = pcf ? THREE.PCFShadowMap : THREE.VSMShadowMap;
		if (this.renderer.shadowMap.type === type) return;
		this.renderer.shadowMap.type = type;
		const { shadow } = this.lights.key;
		shadow.radius = pcf ? 4 : 4.5;
		shadow.bias = pcf ? -0.0005 : -0.0002;
		shadow.normalBias = pcf ? 0.02 : 0.04;
		shadow.map?.dispose();
		shadow.map = null;
		for (const g of this.groups.values()) g.material.needsUpdate = true;
		this.material.needsUpdate = true;
		this.invalidate();
	}

	/**
	 * The baked light's per-frame inputs: the key's and the rim's directions
	 * in the model's frame (the bake's: the root turned back), where the key
	 * falls on its ring (`uRingAt`: the direction before it, how far on, and
	 * how far off the ring's height it is, as a share given to the sky's
	 * harmonics instead), and how assembled the model is (`uVisWhole`):
	 * each group shown in full and in place, or the group's own light for all.
	 */
	private syncBakedLight() {
		if (!this.lit || !this.baked.uVisOn.value) return;
		const { key, rim } = this.lights;
		const u = this.baked;
		this.root.updateWorldMatrix(true, false);
		const toModel = this.tmpQuat.setFromRotationMatrix(this.root.matrixWorld).invert();
		u.uWorldToModel.value.setFromMatrix4(this.tmpMat4.makeRotationFromQuaternion(toModel));
		const [k, r] = u.uLightDir.value;
		k.subVectors(key.position, key.target.position).normalize().applyQuaternion(toModel);
		r.subVectors(rim.position, rim.target.position).normalize().applyQuaternion(toModel);
		const az = (Math.atan2(k.z, k.x) + Math.PI * 2) % (Math.PI * 2);
		const t = (az / (Math.PI * 2)) * 24;
		const el = Math.asin(THREE.MathUtils.clamp(k.y, -1, 1));
		const off = (ring: number) =>
			THREE.MathUtils.smoothstep(Math.abs(el - ring), THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(25));
		u.uRingAt.value.set(Math.floor(t) % 24, t - Math.floor(t), off(this.ringEl.whole), off(this.ringEl.group));
		let whole = 1;
		for (const g of this.groups.values()) {
			const placed = 1 - Math.min(1, Math.max(Math.abs(g.out), Math.abs(g.up), g.cut) / OPEN_AT);
			whole = Math.min(whole, g.level, placed, 1 - g.open.value);
		}
		this.baked.uVisWhole.value = whole;
		// Taken apart, the pieces' contact with each other is wherever they've
		// moved to, which no bake can know: the screen-space occlusion comes
		// back for that, faded in as the model comes apart.
		if (this.gtao) {
			const apart = whole < 0.999;
			if (this.gtao.occlude !== apart) this.gtao.occlude = apart;
			this.gtao.blendIntensity = this.aoAmount * (1 - whole);
		}
	}
	private tmpQuat = new THREE.Quaternion();
	private tmpMat4 = new THREE.Matrix4();

	/** The bake's uniforms, shared by every group (`bakedSurface`). */
	private baked = {
		uBakedAO: { value: 1 },
		uBakedDirect: { value: 0.6 },
		uBakedView: { value: 0 },
		uFinish: { value: 1 },
		uFinishFloor: { value: 0.45 },
		uPolymer: { value: 1 },
		uFinishSheen: { value: 0 },
		uFinishReflect: { value: 0 },
		uDetail: { value: 1 },
		uDetailTile: { value: 0.35 },
		uEnvDiffuse: { value: 1 },
		uWrap: { value: 0 },
		uSurfaceGrain: { value: 0 },
		uVisOn: { value: 0 },
		uVisWhole: { value: 1 },
		uOpenLight: { value: 0.2 },
		uLightDir: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] },
		uRingAt: { value: new THREE.Vector4() },
		uWorldToModel: { value: new THREE.Matrix3() },
		// Mid-grey (no change) until the texture arrives (`loadDetail`).
		tDetail: { value: new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1) as THREE.Texture }
	};

	/**
	 * Dev tooling (perf.ts `visibility`): which CAD parts can be seen from the
	 * view as it stands, the model turned through `turns` steps at each of
	 * `tilts` (the drag's range) and drawn as the frame would (hidden groups out,
	 * cuts open, pieces in place), each part in its own colour. See-through
	 * groups draw on their own, as they hide nothing. `widen` widens the frame so
	 * parts a taller phone frame would show still count. Needs `keepParts`.
	 * Returns part indices by the file they're numbered in.
	 */
	async visibleParts({ turns = 24, tilts = [-0.6, -0.3, 0, 0.3, 0.6], scale = 1.25, widen = 1.5 } = {}) {
		const seen = new Map<string, Set<number>>();
		const groups = [...this.groups.entries()].filter(([, g]) => g.node.visible);
		const r = this.renderer;
		const buffer = r.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(scale).round();
		const target = new THREE.WebGLRenderTarget(buffer.x, buffer.y);
		const pixels = new Uint8Array(buffer.x * buffer.y * 4);
		const ids = groups.map(([name, g], i) => {
			const material = new THREE.ShaderMaterial({
				uniforms: { uGroup: { value: i + 1 } },
				vertexShader: /* glsl */ `
					#include <common>
					#include <clipping_planes_pars_vertex>
					attribute float _part;
					flat varying float vPart;
					void main() {
						vPart = _part;
						#include <begin_vertex>
						#include <project_vertex>
						#include <clipping_planes_vertex>
					}`,
				fragmentShader: /* glsl */ `
					#include <clipping_planes_pars_fragment>
					uniform float uGroup;
					flat varying float vPart;
					void main() {
						#include <clipping_planes_fragment>
						float p = vPart;
						gl_FragColor = vec4( mod( p, 256.0 ), floor( p / 256.0 ), uGroup, 255.0 ) / 255.0;
					}`,
				clipping: true,
				clippingPlanes: g.material.clippingPlanes,
				clipIntersection: g.material.clipIntersection,
				side: g.material.side
			});
			const meshes: THREE.Mesh[] = [];
			g.node.traverse((o) => {
				if ((o as THREE.Mesh).isMesh && !o.userData.depthFirst && (o as THREE.Mesh).geometry.getAttribute('_part'))
					meshes.push(o as THREE.Mesh);
			});
			return {
				name,
				file: (g.node.userData.file as string | undefined) ?? name,
				g,
				material,
				meshes,
				see: g.level < 0.999
			};
		});
		const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
		for (const id of ids) for (const m of id.meshes) saved.set(m, m.material);
		const depthFirst: THREE.Object3D[] = [];
		this.root.traverse((o) => o.userData.depthFirst && o.visible && depthFirst.push(o));
		const pose = {
			turn: this.autoRotation,
			tilt: this.userRotation.x,
			fov: this.camera.fov,
			shadow: r.shadowMap.enabled
		};
		const read = () => {
			r.setRenderTarget(target);
			r.setClearColor(0x000000, 0);
			r.clear();
			r.render(this.scene, this.camera);
			r.readRenderTargetPixels(target, 0, 0, buffer.x, buffer.y, pixels);
			for (let i = 0; i < pixels.length; i += 4) {
				const group = pixels[i + 2];
				if (!group) continue;
				const id = ids[group - 1];
				let set = seen.get(id.file);
				if (!set) seen.set(id.file, (set = new Set()));
				set.add(pixels[i] + pixels[i + 1] * 256);
			}
		};
		this.profiling = true;
		this.lodHold = 0;
		try {
			r.shadowMap.enabled = false;
			for (const o of depthFirst) o.visible = false;
			for (const id of ids) for (const m of id.meshes) m.material = id.material;
			for (let k = 0; k < turns; k++) {
				for (const tilt of tilts) {
					this.autoRotation = pose.turn + (k / turns) * Math.PI * 2;
					this.userRotation.x = tilt;
					this.pose();
					this.camera.fov = Math.min(150, pose.fov * widen);
					this.camera.updateProjectionMatrix();
					// The solid groups together, hiding each other…
					for (const id of ids) id.g.node.visible = !id.see;
					read();
					// …and each see-through one on its own.
					for (const see of ids.filter((id) => id.see)) {
						for (const id of ids) id.g.node.visible = id === see;
						read();
					}
					for (const id of ids) id.g.node.visible = true;
					this.camera.fov = pose.fov;
					this.camera.updateProjectionMatrix();
				}
				await yieldToMain();
			}
		} finally {
			for (const [m, material] of saved) m.material = material;
			for (const o of depthFirst) o.visible = true;
			for (const id of ids) id.material.dispose();
			target.dispose();
			r.setRenderTarget(null);
			r.shadowMap.enabled = pose.shadow;
			this.autoRotation = pose.turn;
			this.userRotation.x = pose.tilt;
			this.camera.fov = pose.fov;
			this.camera.updateProjectionMatrix();
			this.lodHold = null;
			this.pose();
			this.profiling = false;
			this.invalidate();
		}
		return Object.fromEntries([...seen].map(([file, set]) => [file, [...set].sort((a, b) => a - b)]));
	}

	/** Set while `profile` runs: the ticker's frames stay out of its timing. */
	private profiling = false;

	/**
	 * Dev measuring (perf.ts): the GPU's time for this view's frame, ms, split
	 * into `shadow` (the key's shadow map), `scene` (the model drawn once) and
	 * `post` (everything after it). Each is the best of `trials` runs of `frames`
	 * frames to the GPU's finish (as `probe`), good to ~0.1 ms. Also returns the
	 * render targets' and geometry's memory, bytes.
	 */
	async profile(frames = 12, trials = 4): Promise<ViewProfile | null> {
		const gl = this.renderer.getContext();
		if (!(gl instanceof WebGL2RenderingContext) || this.disposed) return null;
		const r = this.renderer;
		const frame = (shadow: boolean) => () => {
			r.shadowMap.needsUpdate = shadow;
			this.composer.render();
		};
		const scene = () => {
			r.shadowMap.needsUpdate = false;
			r.setRenderTarget(this.beauty);
			r.clear();
			r.render(this.scene, this.camera);
		};
		// Not the GPU's timer queries: under ANGLE on Metal they count the
		// GPU's idle time too (a bare clear read 2.7 ms, a frame 8–12 ms that
		// fences put at 3).
		const time = (draw: () => void) => gpuTime(gl, draw, () => this.disposed, frames, trials);
		this.profiling = true;
		try {
			const full = await time(frame(true));
			r.info.reset();
			frame(true)();
			const { calls, triangles } = r.info.render;
			const noShadow = await time(frame(false));
			const model = await time(scene);
			r.setRenderTarget(null);
			return {
				full,
				shadow: full - noShadow,
				scene: model,
				post: noShadow - model,
				calls,
				triangles,
				...this.quality,
				...this.memory()
			};
		} finally {
			this.profiling = false;
			this.invalidate();
		}
	}

	/** What the viewer holds in GPU memory, roughly, bytes: its render targets and its geometry (`profile`). */
	memory() {
		return { targets: this.targetBytes(), geometry: this.geometryBytes() };
	}

	/** Every render target the frame uses (shadow maps too), and roughly what each holds in GPU memory, bytes. */
	private targetBytes() {
		const found = new Map<THREE.WebGLRenderTarget, string>();
		const add = (rt: unknown, name: string) => {
			if ((rt as THREE.WebGLRenderTarget)?.isWebGLRenderTarget && !found.has(rt as THREE.WebGLRenderTarget))
				found.set(rt as THREE.WebGLRenderTarget, name);
		};
		add(this.beauty, 'beauty');
		add(this.composer.renderTarget1, 'composer 1');
		add(this.composer.renderTarget2, 'composer 2');
		for (const pass of this.composer.passes)
			for (const [k, v] of Object.entries(pass)) {
				const name = `${pass.constructor.name}.${k}`;
				if (Array.isArray(v)) v.forEach((x, i) => add(x, `${name}[${i}]`));
				else add(v, name);
			}
		this.scene.traverse((o) => {
			const shadow = (o as THREE.DirectionalLight).shadow;
			if (shadow) {
				add(shadow.map, `${o.name || o.type} shadow`);
				add(shadow.mapPass, `${o.name || o.type} shadow blur`);
			}
		});
		// Only those the GPU has storage for: a target three has never drawn
		// into (GTAOPass's own normals, with ours in their place) holds none.
		const allocated = (rt: THREE.WebGLRenderTarget) =>
			(this.renderer.properties.get(rt) as { __webglFramebuffer?: unknown }).__webglFramebuffer !== undefined;
		return [...found]
			.filter(([rt]) => allocated(rt))
			.map(([rt, name]) => {
				const tex = rt.texture;
				const texel =
					(tex.type === THREE.FloatType ? 4 : tex.type === THREE.HalfFloatType ? 2 : 1) *
					(tex.format === THREE.RedFormat ? 1 : tex.format === THREE.RGFormat ? 2 : 4);
				const samples = rt.samples;
				// Multisampled: a sample buffer for colour and depth, resolved into the texture(s).
				const color = texel * (rt.textures.length * (samples ? samples + 1 : 1));
				const depth = rt.depthBuffer ? 4 * (samples ? samples + (rt.depthTexture ? 1 : 0) : 1) : 0;
				return { name, width: rt.width, height: rt.height, samples, bytes: rt.width * rt.height * (color + depth) };
			});
	}

	/** The model's vertex and index buffers on the GPU, bytes, by attribute (each buffer once, however many meshes share it). */
	private geometryBytes() {
		const seen = new Set<ArrayBufferLike | THREE.TypedArray>();
		const by: Record<string, number> = {};
		const count = (name: string, a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null) => {
			if (!a) return;
			const array = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
				? (a as THREE.InterleavedBufferAttribute).data.array
				: (a as THREE.BufferAttribute).array;
			if (seen.has(array)) return;
			seen.add(array);
			by[name] = (by[name] ?? 0) + array.byteLength;
		};
		this.scene.traverse((o) => {
			const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
			if (!(o as THREE.Mesh).isMesh || !g) return;
			for (const [name, a] of Object.entries(g.attributes)) count(name, a);
			count('index', g.index);
		});
		return by;
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
		// three's `fov` is vertical, so a tall, narrow stage crops the model's
		// sides. Widen it until the bounding sphere fits both axes; wide
		// viewports keep the composed framing exactly.
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
		if (this.asleep) {
			this.renderer.setSize(1, 1, false);
			this.composer.setSize(1, 1);
			return;
		}
		const { clientWidth: w, clientHeight: h } = this.container;
		if (!w || !h) return;
		this.camera.aspect = w / h;
		this.updateFov();
		this.canvasRect = this.container.getBoundingClientRect();
		this.renderer.setSize(w, h, false);
		// The frame in whole pixels: at a pixel ratio of 1.5 an odd width gives a
		// half pixel that the targets drop and the passes don't, stretching the frame.
		const rw = Math.round(w * this.renderRatio);
		const rh = Math.round(h * this.renderRatio);
		this.composer.setPixelRatio(1);
		this.composer.setSize(rw, rh);
		if (this.sweep) {
			const out = this.renderer.getDrawingBufferSize(this.outputSize);
			this.sweep.outputSize(out.x, out.y);
		}
		// composer.setSize just sized occlusion to the full frame; scale it back.
		const aoScale = this.aoScale;
		if (this.gtao && aoScale > 0 && aoScale < 1) this.gtao.setSize(Math.round(rw * aoScale), Math.round(rh * aoScale));
		this.invalidate();
		// composer.setSize just pushed bloom to full resolution — put it back to
		// half. Full-res bloom is where its blocky mip artifacts come from.
		if (this.bloom) this.bloom.setSize(Math.round(rw / 2), Math.round(rh / 2));
	}

	/** The coarser levels of detail the model has, metres (`foldLods`); none for most files. */
	private lodErrors: number[] = [];
	/** The level drawn: 0 the full one, then the coarser (`chooseLod`). */
	private lod = 0;
	/** A level held whatever the view (the visibility sampler holds the full one). */
	private lodHold: number | null = null;

	/**
	 * The coarsest level of detail whose error comes to under LOD_PIXELS on
	 * screen, measured where the model is nearest the camera: a wide shot,
	 * a small or low-resolution screen (adaptive quality's steps among them)
	 * draws fewer triangles, a close shot all of them. The shadow map draws
	 * the same geometry. Only when the level changes are the triangles
	 * swapped (each piece's index; the vertices never change).
	 */
	private chooseLod() {
		if (!this.lodErrors.length || this.asleep) return;
		const nearest = Math.max(
			this.fitRadius * 0.05,
			this.camera.position.distanceTo(this.root.position) - this.fitRadius
		);
		const pixel =
			(2 * nearest * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.composer.renderTarget1.height;
		let level = 0;
		this.lodErrors.forEach((error, i) => {
			if (error <= pixel * LOD_PIXELS) level = i + 1;
		});
		if (this.lodHold !== null) level = this.lodHold;
		if (level === this.lod) return;
		this.lod = level;
		this.root.traverse((o) => {
			const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
			const lods = g?.userData.lods as Lod[] | undefined;
			if (!g || !lods || o.userData.depthFirst) return;
			g.userData.full ??= g.index;
			g.setIndex(level ? (lods[level - 1]?.index ?? g.userData.full) : g.userData.full);
		});
		this.invalidate();
	}

	/** Puts the model, camera, cuts and key where this frame has them (`render`, and the visibility sampler). */
	private pose() {
		this.chooseLod();
		// The soft boxes turn with the camera, as in the offline rig.
		if (this.softbox) {
			const c = this.camera.position;
			const yaw = Math.atan2(c.x - this.target.x, c.z - this.target.z);
			this.scene.environmentRotation.set(0, yaw, 0);
			if (this.rig === 'black') this.syncProbe(yaw);
		}
		this.syncStrips(
			this.softbox ? Math.atan2(this.camera.position.x - this.target.x, this.camera.position.z - this.target.z) : 0
		);
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
			this.glowFrame.value
				.copy(this.root.matrixWorld)
				.invert()
				.premultiply(this.toAuthored.makeTranslation(-this.offset.x, -this.offset.y, -this.offset.z));
		}
		if (this.studioOn && this.studioKeyFollow) this.aimKey();
		this.fitShadow();
		this.syncBakedLight();
	}

	render() {
		if (this.disposed || this.contextLost || this.profiling || this.asleep) return;
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
			// Averaging both axes gives 0 at top-left and 1 at bottom-right whatever
			// the aspect. Held while dragging, so turning the model doesn't also
			// sweep the ramp; it resumes from wherever the pointer ends up.
			if (this.gradientFollow && this.pointer.seen && !this.drag.active) {
				const aim = (this.pointer.x + this.pointer.y) / 2;
				// Frame-rate independent easing, so the feel is identical at 30 or 120fps.
				this.pointerOffset += (aim - this.pointerOffset) * (1 - Math.exp(-dt / this.gradientTau));
			}
			this.gradient.offset = this.gradientUserOffset + (this.gradientFollow ? this.pointerOffset : 0);
		}

		this.pose();
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
		// One shadow pass per frame, consumed by the scene render; for the slow turn
		// alone, every other frame: at ~1 mrad a frame a one-frame-old shadow is out
		// by a fraction of a pixel, and the shadow pass redraws the whole model.
		this.spinShadow = this.spinOnly ? !this.spinShadow : true;
		this.renderer.shadowMap.needsUpdate = this.spinShadow;
		const submit = performance.now();
		this.composer.render();
		this.lastFrame.cpu = performance.now() - submit;
		this.lastFrame.calls = this.renderer.info.render.calls;
		this.lastFrame.triangles = this.renderer.info.render.triangles;
		this.framesDrawn++;
		this.keepPace();
	}

	/**
	 * Adaptive quality for GPUs the full frame is too much for, aiming at the
	 * display's rate (60 fps at least) by stepping down `ladder`, least visible
	 * first; `probe` picks the starting step. While frames draw back to back,
	 * the median of the last 40 intervals over SLOW_FRAME_MS steps down once. A
	 * step that isn't STEP_GAIN faster is undone and pacing stops (the time is
	 * the CPU's or the vertices'). It never steps back up, so it settles rather than hunts.
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
		if (import.meta.env.DEV)
			console.info(`[viewer] ${median.toFixed(1)} ms frames: step ${p.step}`, this.ladder[p.step]);
	}

	/**
	 * For `warmUp`, out of sight: times frames to the GPU's finish (a polled
	 * fence, so the main thread never stalls) and steps down while a frame takes
	 * over SLOW_FRAME_MS × 0.8 (~14 ms, room for 60 fps) and each step helps.
	 */
	private async probe(draw: () => void) {
		const gl = this.renderer.getContext();
		if (!(gl instanceof WebGL2RenderingContext)) return;
		// Frames back to back, timed to the last one's finish: a single frame's
		// time is mostly the GPU waking up and the queue ahead of it (15 ms for a
		// 3 ms frame on a fast GPU); several in a row measure throughput.
		const time = () => gpuTime(gl, draw, () => this.disposed);
		let ms = await time();
		while (ms > SLOW_FRAME_MS * 0.8 && this.pace.step < this.ladder.length - 1 && !this.disposed) {
			const from = this.pace.step;
			this.setStep(from + 1);
			const next = await time();
			if (import.meta.env.DEV)
				console.info(
					`[viewer] out of sight, ${ms.toFixed(1)} → ${next.toFixed(1)} ms at step ${this.pace.step}`,
					this.ladder[this.pace.step]
				);
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
				else if (depth === 0 && value && typeof value === 'object' && !(value as THREE.Object3D).isObject3D)
					collect(value, depth + 1);
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

	/**
	 * With occlusion on, its composite reads the scene straight from the
	 * beauty target and tone maps as it shades, saving the copy into the
	 * composer's buffer and the output pass (a full-screen pass each). With
	 * occlusion off (adaptive quality's last step) or SSR drawing the scene,
	 * both come back.
	 */
	private syncPasses() {
		const merged = !!this.gtao?.enabled && !this.ssr;
		this.renderPass.resolve = !merged;
		if (this.gtao) {
			this.gtao.source = merged ? this.beauty.texture : null;
			this.gtao.finish = merged;
		}
		this.outputPass.enabled = !merged;
	}

	private setStep(i: number) {
		this.pace.step = i;
		const { ratio, ao } = this.ladder[i];
		this.aoScale = ao;
		this.renderRatio = ratio;
		if (this.gtao) this.gtao.enabled = ao > 0 || !!this.baked.uVisOn.value;
		this.syncPasses();
		this.resize();
	}

	private outputSize = new THREE.Vector2();
	private gradeAmount = 0;
	/** The pixel ratio the frame is drawn at (the canvas's is the screen's, OUTPUT_PIXEL_RATIO at most). */
	private renderRatio = 1;
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
		const view = this.view;
		view[0] = c.x;
		view[1] = c.y;
		view[2] = c.z;
		view[3] = t.x;
		view[4] = t.y;
		view[5] = t.z;
		view[6] = this.camera.fov;
		view[7] = this.camera.aspect;
		view[8] = r.rotation.x;
		view[9] = this.scrollRotation.y + this.userRotation.y;
		view[10] = r.rotation.z;
		view[11] = r.scale.x;
		view[12] = r.position.y;
		view[13] = this.gradient?.offset ?? 0;
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
		this.spinOnly = !moved;
		this.lastView.set(view);
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
			// The groups' depth-only see-through firsts (one material a group).
			if (m.userData.depthFirst) (m.material as THREE.Material).dispose();
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
		this.outputPass.dispose();
		for (const pass of this.overlayPasses) this.composer.removePass(pass);
		this.composer.dispose();
		this.envRT?.dispose();
		for (const rt of Object.values(this.softboxRT)) rt.dispose();
		this.baked.tDetail.value.dispose();
		this.pmrem.dispose();
		this.renderer.dispose();
		// The context goes now, not whenever the canvas is collected: a page
		// gets only so many, and a rebuild after a loss makes another.
		if (!this.contextLost) this.renderer.forceContextLoss();
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

/** GTAOPass's denoise noise (its `_generateNoise`), from a fixed seed rather than Math.random. */
function seededNoise(size = 64) {
	let seed = 0x5eed;
	// mulberry32
	const random = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const simplex = new SimplexNoise({ random });
	const data = new Uint8Array(size * size * 4);
	for (let i = 0; i < size; i++)
		for (let j = 0; j < size; j++) {
			const at = (i * size + j) * 4;
			data[at] = (simplex.noise(i, j) * 0.5 + 0.5) * 255;
			data[at + 1] = (simplex.noise(i + size, j) * 0.5 + 0.5) * 255;
			data[at + 2] = (simplex.noise(i, j + size) * 0.5 + 0.5) * 255;
			data[at + 3] = (simplex.noise(i + size, j + size) * 0.5 + 0.5) * 255;
		}
	const noise = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
	noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
	noise.needsUpdate = true;
	return noise;
}

/**
 * Ambient occlusion from the scene pass's own depth (GTAOPass), cheaper with
 * identical pixels, and able to run at a lower resolution:
 *  - Normals once: GTAO and its 17-tap denoiser rebuild a normal from nine depth
 *    reads per use (~150 a pixel); here one pass writes them to a texture.
 *  - Below full resolution (`aoScale`), a joint bilateral upsample weights the
 *    four nearest samples by depth too, so silhouettes keep sharp edges.
 *  - The stock pass's frame copy and multiply fold into one draw.
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

	constructor(...args: ConstructorParameters<typeof GTAOPass>) {
		super(...args);
		// The denoise's noise, as GTAOPass makes it but from a fixed seed: its
		// own uses Math.random, so each load would shade edges a little
		// differently and captures of the same view (perf.ts) wouldn't match.
		this.pdNoiseTexture.dispose();
		this.pdNoiseTexture = seededNoise();
		this.pdMaterial.uniforms.tNoise.value = this.pdNoiseTexture;
		// Occlusion is a factor from 0 to 1: eight bits hold it, at half the
		// memory and bandwidth of the stock pass's half floats.
		this.gtaoRenderTarget.dispose();
		this.pdRenderTarget.dispose();
		this.gtaoRenderTarget = new THREE.WebGLRenderTarget(this.width, this.height, { depthBuffer: false });
		this.pdRenderTarget = this.gtaoRenderTarget.clone();
		this.pdMaterial.uniforms.tDiffuse.value = this.gtaoRenderTarget.texture;
	}

	private composite = new THREE.ShaderMaterial({
		uniforms: {
			tDiffuse: { value: null },
			tAO: { value: null },
			tDepth: { value: null },
			uIntensity: { value: 1 },
			cameraNear: { value: 0.1 },
			cameraFar: { value: 100 },
			toneMappingExposure: { value: 1 },
			tNormal: { value: null },
			uRidge: { value: 0 },
			uValley: { value: 0 },
			uGrade: { value: 0 },
			uSaturation: { value: 1 },
			uTint: { value: new THREE.Color(1, 1, 1) },
			uContrast: { value: 0 },
			uBlackPoint: { value: 0 },
			uShadowTone: { value: new THREE.Color(1, 1, 1) },
			uHighTone: { value: new THREE.Color(1, 1, 1) }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,
		fragmentShader: /* glsl */ `
			#include <packing>
			#include <tonemapping_pars_fragment>
			uniform sampler2D tDiffuse;
			uniform sampler2D tAO;
			uniform sampler2D tDepth;
			uniform sampler2D tNormal;
			uniform float uRidge;
			uniform float uValley;
			uniform float uGrade;
			uniform float uSaturation;
			uniform vec3 uTint;
			uniform float uContrast;
			uniform float uBlackPoint;
			uniform vec3 uShadowTone;
			uniform vec3 uHighTone;
			const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
			uniform float uIntensity;
			uniform float cameraNear;
			uniform float cameraFar;
			varying vec2 vUv;

			float viewZ( vec2 uv ) {
				return perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cameraNear, cameraFar );
			}

			vec3 occlusion() {
				vec2 size = vec2( textureSize( tAO, 0 ) );
				// At the frame's own resolution: nothing to upsample.
				if ( size == vec2( textureSize( tDepth, 0 ) ) ) return texelFetch( tAO, ivec2( vUv * size ), 0 ).rgb;
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
				return total > 1e-6 ? sum / total : nearest;
			}

			vec3 toLinear( vec3 d ) {
				return mix( d / 12.92, pow( ( d + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, d ) );
			}
			vec3 toDisplay( vec3 x ) {
				return mix( x * 12.92, 1.055 * pow( x, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, x ) );
			}

			// The black studio renders' print (render.py's grade, after the tone
			// curve, in its order): saturation and a cool tint on the light, then
			// in display terms the blacks pinned and an S-curve, so the mid
			// tones part into deep shadow and bright highlight, then split
			// toning, shadows a cool steel and highlights a near-white. On the
			// model's own colour (un-premultiplied), not the panel behind it; before
			// the overlays (the energy trails keep their colours).
			vec3 grade( vec3 d ) {
				vec3 x = toLinear( d );
				float grey = dot( x, LUMA );
				x = ( grey + ( x - grey ) * uSaturation ) * uTint;
				d = clamp( ( toDisplay( x ) - uBlackPoint ) / ( 1.0 - uBlackPoint ), 0.0, 1.0 );
				d += ( d * d * ( 3.0 - 2.0 * d ) - d ) * uContrast;
				x = toLinear( d );
				float lum = dot( d, LUMA );
				x *= mix( uShadowTone, uHighTone, lum );
				return toDisplay( x );
			}

			// How the surface turns here, from the view normals a pixel either
			// side: spreading apart (positive) over a convex edge, closing in
			// (negative) in a crevice. A neighbour across a silhouette, on
			// another surface, counts as this pixel's own normal.
			float bend() {
				vec2 px = 1.0 / vec2( textureSize( tNormal, 0 ) );
				float z = viewZ( vUv );
				float tolerance = abs( z ) * 0.02;
				vec3 c = unpackRGBToNormal( texture2D( tNormal, vUv ).rgb );
				vec3 n[ 4 ];
				vec2 at[ 4 ];
				at[ 0 ] = vec2( px.x, 0.0 );
				at[ 1 ] = vec2( -px.x, 0.0 );
				at[ 2 ] = vec2( 0.0, px.y );
				at[ 3 ] = vec2( 0.0, -px.y );
				for ( int i = 0; i < 4; i ++ ) {
					vec2 uv = vUv + at[ i ];
					n[ i ] = abs( viewZ( uv ) - z ) > tolerance ? c : unpackRGBToNormal( texture2D( tNormal, uv ).rgb );
				}
				return ( n[ 0 ].x - n[ 1 ].x ) + ( n[ 2 ].y - n[ 3 ].y );
			}

			void main() {
				vec4 scene = texture2D( tDiffuse, vUv );
				gl_FragColor = vec4( scene.rgb * ( uIntensity > 0.0 ? mix( vec3( 1.0 ), occlusion(), uIntensity ) : vec3( 1.0 ) ), scene.a );
				// Machined edges catch the light and crevices hold shadow, as the
				// renders' edge polish and bevels have them: a sharp turn only
				// (a cylinder's facets turn too gently to count), a pixel wide.
				if ( uRidge > 0.0 || uValley > 0.0 ) {
					float b = bend();
					float ridge = smoothstep( 0.35, 0.9, b );
					float valley = smoothstep( 0.35, 0.9, -b );
					gl_FragColor.rgb = gl_FragColor.rgb * ( 1.0 - uValley * valley ) + ridge * uRidge * ( gl_FragColor.rgb + 0.03 * scene.a );
				}
				// OutputPass's work, when this pass does it too (finish).
				#if defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( LINEAR_TONE_MAPPING )
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#endif
				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
					if ( uGrade > 0.0 && gl_FragColor.a > 0.0 ) {
						vec3 own = clamp( gl_FragColor.rgb / gl_FragColor.a, 0.0, 1.0 );
						gl_FragColor.rgb = mix( own, grade( own ), uGrade ) * gl_FragColor.a;
					}
				#endif
			}`,
		depthTest: false,
		depthWrite: false,
		blending: THREE.NoBlending,
		// Tone mapped here by hand, when at all (`finish`): three adds none.
		toneMapped: false
	});

	render(
		renderer: THREE.WebGLRenderer,
		writeBuffer: THREE.WebGLRenderTarget,
		readBuffer: THREE.WebGLRenderTarget,
		delta: number,
		maskActive: boolean
	) {
		// The normals, at the depth's own resolution: for the occlusion, and
		// for the edges and creases.
		const depth = this.depthTexture as THREE.DepthTexture;
		if (this.occlude || this.ridge > 0 || this.valley > 0) {
			const { width, height } = depth.image as { width: number; height: number };
			if (this.normals.width !== width || this.normals.height !== height) this.normals.setSize(width, height);
			this.rebuildNormals.uniforms.tDepth.value = depth;
			this.rebuildNormals.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
			renderer.setRenderTarget(this.normals);
			this.normalQuad.render(renderer);
		}
		// The stock pass works out and denoises the occlusion only…
		if (this.occlude) {
			const output = this.output;
			this.output = GTAOPass.OUTPUT.Off;
			super.render(renderer, writeBuffer, readBuffer, delta, maskActive);
			this.output = output;
		}
		// …and this draws the frame with it.
		const u = this.composite.uniforms;
		u.tDiffuse.value = this.source ?? readBuffer.texture;
		this.finishLike(this.finish ? renderer : null);
		u.toneMappingExposure.value = renderer.toneMappingExposure;
		u.tNormal.value = this.normals.texture;
		u.uRidge.value = this.ridge;
		u.uValley.value = this.valley;
		u.tAO.value = this.pdRenderTarget.texture;
		u.tDepth.value = this.depthTexture;
		u.uIntensity.value = this.occlude ? this.blendIntensity : 0;
		u.cameraNear.value = (this.camera as THREE.PerspectiveCamera).near;
		u.cameraFar.value = (this.camera as THREE.PerspectiveCamera).far;
		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
		this.quad.render(renderer);
	}
	private quad = new FullScreenQuad(this.composite);

	/**
	 * The print grade (`grade` in the composite), matched to the offline
	 * renders', on the finished frame (when this pass finishes it): `amount` 0
	 * leaves it as drawn. Colours as `#rrggbb`, taken as sRGB.
	 */
	setGrade(g: {
		amount: number;
		saturation: number;
		tint: string;
		contrast: number;
		blackPoint: number;
		shadows: string;
		highlights: string;
	}) {
		const u = this.composite.uniforms;
		u.uGrade.value = g.amount;
		u.uSaturation.value = g.saturation;
		u.uContrast.value = g.contrast;
		u.uBlackPoint.value = g.blackPoint;
		// Color.set linearises the sRGB colours, as the offline grade does.
		(u.uTint.value as THREE.Color).set(g.tint);
		(u.uShadowTone.value as THREE.Color).set(g.shadows);
		(u.uHighTone.value as THREE.Color).set(g.highlights);
	}

	/**
	 * Whether it works out the occlusion at all: off, it only finishes the
	 * frame (tone mapping, the grade, the edges), for when the occlusion is
	 * baked (ModelViewer's `bakedLight`), and its buffers shrink to a pixel
	 * until it's back on (some 64 MB at a retina screen's own resolution).
	 */
	get occlude() {
		return this.occluding;
	}
	set occlude(on: boolean) {
		if (on === this.occluding) return;
		this.occluding = on;
		this.applySize();
		if (!on) this.normals.setSize(1, 1);
	}
	private occluding = true;
	/** The size the composer asks for (`setSize`), kept while the buffers are shrunk. */
	private asked?: { width: number; height: number };
	setSize(width: number, height: number) {
		// (The parent's constructor sizes it before this class's fields exist.)
		if (!this.asked) {
			super.setSize(width, height);
			this.asked = { width, height };
			return;
		}
		this.asked.width = width;
		this.asked.height = height;
		this.applySize();
	}
	private applySize() {
		const { width, height } = this.asked ?? { width: 1, height: 1 };
		super.setSize(this.occluding ? width : 1, this.occluding ? height : 1);
	}
	/** Edges brightened and crevices darkened (`bend`), 0 for neither. */
	ridge = 0;
	valley = 0;
	/** The scene to shade, when not the composer's read buffer: the beauty target's own, saving the copy into it. */
	source: THREE.Texture | null = null;
	/** Tone maps and encodes as it shades, as OutputPass would next: one full-screen pass, not two. */
	finish = false;
	private finishedAs = '';
	/** The composite's defines for the renderer's tone mapping and output colour space, as OutputPass sets its own; none for `null`. */
	private finishLike(renderer: THREE.WebGLRenderer | null) {
		const key = renderer ? `${renderer.toneMapping}|${renderer.outputColorSpace}` : '';
		if (key === this.finishedAs) return;
		this.finishedAs = key;
		const defines: Record<string, string> = {};
		if (renderer) {
			if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer)
				defines.SRGB_TRANSFER = '';
			const tone = (
				{
					[THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
					[THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
					[THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
					[THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING'
				} as Record<number, string>
			)[renderer.toneMapping];
			if (tone) defines[tone] = '';
		}
		this.composite.defines = defines;
		this.composite.needsUpdate = true;
	}

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

	/** Copies the scene into the composer's read buffer; off while the next pass reads `target` itself. */
	resolve = true;

	setSize(width: number, height: number) {
		this.target.setSize(width, height);
	}

	render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.setRenderTarget(this.target);
		renderer.clear();
		renderer.render(this.scene, this.camera);
		if (this.resolve) {
			this.copy.uniforms.tDiffuse.value = this.target.texture;
			renderer.setRenderTarget(this.renderToScreen ? null : read);
			this.quad.render(renderer);
		}
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
	const toLocal = mesh.parent
		? new THREE.Matrix3().setFromMatrix4(mesh.parent.matrixWorld).invert()
		: new THREE.Matrix3();
	return { mesh, base: mesh.position.clone(), out, up: new THREE.Vector3(0, 1, 0).applyMatrix3(toLocal) };
}

/**
 * Collapses the model's non-instanced parts into a single mesh: they share one
 * material, so separate draws are pure overhead in each scene render (shadow,
 * beauty). Instanced parts are already one draw each and stay. Quantised
 * attributes (KHR_mesh_quantization) are widened to float first, exactly, since
 * baking a world transform into a normalised Int16 would clamp it to [-1, 1].
 * UVs are dropped: nothing samples them (the surface variation is world-space)
 * and their mixed types (Uint16 / Float32) would block the merge.
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
 * Loading works on the CAD's vertex data directly, as typed arrays: the groups
 * run to hundreds of thousands of vertices, and three's per-vertex accessors
 * (getX, fromBufferAttribute: a call, a normalisation and a bounds check per
 * component) would block the main thread for ~300 ms mid-scroll.
 */

/** An attribute's raw storage: quantised (KHR_mesh_quantization) or not, interleaved or not. */
function attributeView(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
	const inter = (attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute;
	const array = (
		inter ? (attr as THREE.InterleavedBufferAttribute).data.array : (attr as THREE.BufferAttribute).array
	) as ArrayLike<number>;
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
async function trianglesBy(
	geometry: THREE.BufferGeometry,
	part: Uint32Array,
	count: number,
	bucketOf: (part: number) => number,
	index: THREE.TypedArray | undefined = geometry.index?.array
) {
	const slice = slicer();
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

/** A coarser level of detail: its error, metres, and its triangles over the full level's vertices. */
type Lod = { error: number; index: THREE.BufferAttribute };

/**
 * Levels of detail (the landing's files, scripts/lab/bake-surface.mjs): the
 * coarser primitives load as meshes beside the full one, over the same
 * vertex data. Each one's triangles go onto the full mesh's geometry
 * (`userData.lods`, finest first) and the mesh goes. Returns the errors.
 */
function foldLods(model: THREE.Object3D) {
	const levels: THREE.Mesh[] = [];
	model.traverse((o) => {
		if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.userData.lod) levels.push(o as THREE.Mesh);
	});
	const errors = new Set<number>();
	for (const level of levels) {
		const position = level.geometry.getAttribute('position');
		const full = level.parent?.children.find(
			(c) =>
				(c as THREE.Mesh).isMesh &&
				!(c as THREE.Mesh).geometry.userData.lod &&
				(c as THREE.Mesh).geometry.getAttribute('position') === position
		) as THREE.Mesh | undefined;
		if (full && level.geometry.index) {
			const lods = ((full.geometry.userData.lods as Lod[] | undefined) ??= []);
			lods.push({ error: level.geometry.userData.lod, index: level.geometry.index });
			lods.sort((a, b) => a.error - b.error);
			errors.add(level.geometry.userData.lod);
		}
		level.removeFromParent();
	}
	return [...errors].sort((a, b) => a - b);
}

/** `trianglesBy` for a geometry's levels of detail: each bucket's triangles at each level. */
async function lodsBy(
	geometry: THREE.BufferGeometry,
	part: Uint32Array,
	count: number,
	bucketOf: (part: number) => number
) {
	const lods = (geometry.userData.lods ?? []) as Lod[];
	const split: (Uint32Array | Uint16Array)[][] = [];
	for (const lod of lods) split.push(await trianglesBy(geometry, part, count, bucketOf, lod.index.array));
	return Array.from({ length: count }, (_, k) =>
		lods.map((lod, i): Lod => ({ error: lod.error, index: new THREE.BufferAttribute(split[i][k], 1) }))
	);
}

/**
 * Waits for the next frame to be drawn, then a moment more: for work that
 * should land one piece per frame (the warm-up's draws), however the tasks
 * between frames fall: two in one frame make it twice as long.
 */
function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * The GPU's time for a frame, ms: `frames` of `draw` back to back, timed
 * to the last one's finish with a fence, polled so the main thread isn't
 * stalled; the best of `trials`. Submitted in two halves with a yield
 * between (the GPU busy with the first meanwhile): four draws in one task
 * block a slow laptop's main thread ~70 ms. Polling adds a few ms per run.
 */
async function gpuTime(gl: WebGL2RenderingContext, draw: () => void, stop: () => boolean, frames = 4, trials = 2) {
	let best = Infinity;
	for (let k = 0; k < trials; k++) {
		await nextFrame();
		if (stop()) return 0;
		const t = performance.now();
		for (let f = 0; f < frames; f++) {
			draw();
			if (f === Math.floor(frames / 2) - 1) await yieldToMain();
		}
		const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		if (!sync) return 0;
		gl.flush();
		while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && !stop()) await new Promise((r) => setTimeout(r, 1));
		gl.deleteSync(sync);
		best = Math.min(best, (performance.now() - t) / frames);
	}
	return best;
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

/**
 * The key's soft shadow, filtered smoothly: three's PCF takes five taps
 * round a disc turned by per-pixel noise, which leaves the penumbra
 * grainy; this takes sixteen (each a hardware 2×2 comparison) on a fixed
 * Poisson disc `shadow.radius` texels across, so it's smooth and holds
 * still as the model turns.
 */
const SOFT_SHADOW_PARS = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
	/\/\/ Hardware PCF with LinearFilter[\s\S]*?\) \* 0\.2;/,
	/* glsl */ `vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				const vec2 disk[ 16 ] = vec2[ 16 ](
					vec2( -0.94201624, -0.39906216 ), vec2( 0.94558609, -0.76890725 ),
					vec2( -0.09418410, -0.92938870 ), vec2( 0.34495938, 0.29387760 ),
					vec2( -0.91588581, 0.45771432 ), vec2( -0.81544232, -0.87912464 ),
					vec2( -0.38277543, 0.27676845 ), vec2( 0.97484398, 0.75648379 ),
					vec2( 0.44323325, -0.97511554 ), vec2( 0.53742981, -0.47373420 ),
					vec2( -0.26496911, -0.41893023 ), vec2( 0.79197514, 0.19090188 ),
					vec2( -0.24188840, 0.99706507 ), vec2( -0.81409955, 0.91437590 ),
					vec2( 0.19984126, 0.78641367 ), vec2( 0.14383161, -0.14100790 )
				);
				shadow = 0.0;
				for ( int i = 0; i < 16; i ++ ) shadow += texture( shadowMap, vec3( shadowCoord.xy + disk[ i ] * radius, shadowCoord.z ) );
				shadow /= 16.0;`
);

function softShadows(material: THREE.Material) {
	if (SOFT_SHADOW_PARS === THREE.ShaderChunk.shadowmap_pars_fragment) return;
	const base = material.onBeforeCompile;
	const baseKey = material.customProgramCacheKey;
	material.onBeforeCompile = (shader, renderer) => {
		base.call(material, shader, renderer);
		shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', SOFT_SHADOW_PARS);
	};
	material.customProgramCacheKey = () => baseKey.call(material) + '|soft-shadow';
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

	const panel = (scale: [number, number, number], pos: [number, number, number], color: number, intensity: number) => {
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

/** A strip, not a soft box: too narrow for the light probe (`syncProbe`), lit by a light of its own (`syncStrips`). */
const isStrip = (b: { width: number }) => b.width < 0.2;

/** A rig's soft boxes: round the camera (`azimuth` 0 its side), sizes and `distance` in subject radii. */
type Softbox = { azimuth: number; elevation: number; distance: number; width: number; length: number; power: number };

/**
 * The 'studio' rig (offline rig 'studio-classic'): a big soft box overhead and
 * a little to one side for broad, even form, and a tall strip either side
 * behind to cut out the silhouette. Its azimuths read back mirrored (the cube
 * PMREM's), and all its light, reflected and diffuse, comes from the
 * environment map.
 */
const STUDIO_SOFTBOXES: Softbox[] = [
	{ azimuth: -25, elevation: 55, distance: 3, width: 3, length: 3, power: 0.5 },
	{ azimuth: -140, elevation: 25, distance: 3, width: 0.15, length: 3, power: 1.0 },
	{ azimuth: 140, elevation: 25, distance: 3, width: 0.15, length: 3, power: 0.8 }
];

/**
 * The 'black' rig (offline rig 'studio-black'): one smallish soft box far round
 * at camera-right, so that side lights and the rest falls away; two strips
 * behind at camera-left tracing its silhouette; a faint wash from above.
 * Camera-relative (`azimuth` 0 the camera's side, degrees round to the right;
 * sizes and `distance` in subject radii). The first is the key, which the
 * directional key stands in for (`shadeAzimuth` 30, `shadeElevation` 9).
 */
const SOFTBOXES: Softbox[] = [
	{ azimuth: 80, elevation: 30, distance: 2.2, width: 0.5, length: 1.0, power: 1.0 },
	{ azimuth: -150, elevation: 20, distance: 3, width: 0.1, length: 3, power: 1.6 },
	{ azimuth: -165, elevation: 12, distance: 3, width: 0.05, length: 3, power: 0.9 },
	{ azimuth: 20, elevation: 70, distance: 3, width: 2.5, length: 2.5, power: 0.06 }
];

/**
 * A rig as an environment, for the metal to reflect and the surfaces to be lit
 * by: each box a panel in a dark room, the camera's side along +z (`softbox`
 * turns it with the camera). A box's power is what the subject receives at any
 * size and distance, so its radiance is power × distance² / area: the key
 * broad and soft, the strips thin and bright. Normalised so the key is 1;
 * `environment` scales the lot. Monochrome: the parts' colour is the finishes'.
 */
function createSoftboxEnvironment(boxes: Softbox[], room = 0x000000): THREE.Scene {
	const env = new THREE.Scene();
	env.add(
		new THREE.Mesh(
			new THREE.SphereGeometry(40, 32, 16),
			new THREE.MeshBasicMaterial({ color: room, side: THREE.BackSide })
		)
	);
	const radianceOf = (b: Softbox) => (b.power * b.distance * b.distance) / (b.width * b.length);
	const key = radianceOf(boxes[0]);
	for (const box of boxes) {
		const az = THREE.MathUtils.degToRad(box.azimuth);
		const el = THREE.MathUtils.degToRad(box.elevation);
		const panel = new THREE.Mesh(
			new THREE.PlaneGeometry(box.width, box.length),
			new THREE.MeshBasicMaterial({
				color: new THREE.Color(1, 1, 1).multiplyScalar(radianceOf(box) / key),
				side: THREE.DoubleSide
			})
		);
		// −x: the cube PMREM renders the scene into reads back mirrored left to right.
		panel.position
			.set(-Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
			.multiplyScalar(box.distance);
		panel.lookAt(0, 0, 0);
		env.add(panel);
	}
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
