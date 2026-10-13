import * as THREE from 'three';

/**
 * Breaks up a mathematically uniform surface with fine world-space value
 * noise that modulates roughness and albedo by a few percent. Fine only: a
 * broader low-frequency term reads as smudges on large smooth panels. It is the single biggest cue separating "CG material" from
 * "painted metal" — real coatings are never the same roughness twice.
 *
 * World space (not UV) so it works on the instanced parts, which share one
 * geometry and would otherwise repeat an identical pattern 432 times. The
 * pattern follows `worldPosition`, which moves with the model, so it sticks
 * to the surface as the vessel turns.
 */
export function applySurfaceVariation(
	material: THREE.MeshPhysicalMaterial,
	opts: { roughness?: number; albedo?: number; scale?: number } = {}
) {
	const uniforms = {
		uRoughVar: { value: opts.roughness ?? 0.08 },
		uAlbedoVar: { value: opts.albedo ?? 0.02 },
		uNoiseScale: { value: opts.scale ?? 1 }
	};

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);

		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vSurfWorld;')
			// worldPosition exists here: shadows/env maps force <worldpos_vertex> on.
			.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSurfWorld = worldPosition.xyz;');

		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				/* glsl */ `#include <common>
				varying vec3 vSurfWorld;
				uniform float uRoughVar;
				uniform float uAlbedoVar;
				uniform float uNoiseScale;

				float surfHash( vec3 p ) {
					p = fract( p * 0.3183099 + vec3( 0.1, 0.2, 0.3 ) );
					p *= 17.0;
					return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
				}
				float surfNoise( vec3 x ) {
					vec3 i = floor( x );
					vec3 f = fract( x );
					f = f * f * ( 3.0 - 2.0 * f );
					return mix(
						mix( mix( surfHash( i ), surfHash( i + vec3( 1, 0, 0 ) ), f.x ),
							 mix( surfHash( i + vec3( 0, 1, 0 ) ), surfHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
						mix( mix( surfHash( i + vec3( 0, 0, 1 ) ), surfHash( i + vec3( 1, 0, 1 ) ), f.x ),
							 mix( surfHash( i + vec3( 0, 1, 1 ) ), surfHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
						f.z );
				}
				// Fine speckle only, centred on zero.
				float surfVariation() {
					return surfNoise( vSurfWorld * uNoiseScale * 6.0 ) - 0.5;
				}`
			)
			.replace(
				'#include <color_fragment>',
				'#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + surfVariation() * uAlbedoVar * 2.0;'
			)
			.replace(
				'#include <roughnessmap_fragment>',
				'#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + surfVariation() * uRoughVar * 2.0, 0.04, 1.0 );'
			);
	};
	// Distinct program from a stock MeshPhysicalMaterial with the same flags.
	material.customProgramCacheKey = () => 'surface-variation';
	return uniforms;
}
