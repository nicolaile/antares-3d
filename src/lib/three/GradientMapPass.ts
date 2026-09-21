import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export interface GradientStop {
	/** 0..1 along the ramp. */
	position: number;
	/** sRGB hex — `0x0b1622` or `'#0b1622'`. Stored raw, see `setStops`. */
	color: number | string;
	alpha?: number;
}

export type RepeatMode = 'none' | 'repeat' | 'mirror';
export type MixSpace = 'srgb' | 'linear' | 'oklab';

/** Fixed size so the shader can index with a loop counter (GLSL ES 1.0). */
const MAX_STOPS = 8;

const REPEAT: Record<RepeatMode, number> = { none: 0, repeat: 1, mirror: 2 };
const SPACE: Record<MixSpace, number> = { srgb: 0, linear: 1, oklab: 2 };

/**
 * Black, through a single light band, back to black — a hard graphic ramp
 * rather than a shaded one, which is what turns the vessel into a silhouette
 * with one bright edge. Swap freely; any 2–8 stops work.
 */
export const DEFAULT_STOPS: GradientStop[] = [
	{ position: 0, color: 0x000000 },
	{ position: 0.32, color: 0xd9d9d9 },
	{ position: 1, color: 0x000000 }
];

/**
 * Luminance-to-colour gradient map, ported from the WGSL source in
 * `ref/Gradient-map-source` to GLSL for three's WebGL renderer.
 *
 * Runs AFTER OutputPass, i.e. in display space. The original converts its
 * linear input to sRGB before taking luma; ours is already sRGB by then, so
 * that conversion is dropped rather than applied twice.
 *
 * Alpha is the thing to get right. The canvas is transparent over the CSS
 * stage, and the composer's colour is premultiplied — so silhouette pixels
 * carry darkened RGB. Taking luma of that maps edges to the wrong end of the
 * ramp and fringes the model. The shader unmultiplies before luma and
 * re-premultiplies on the way out, exactly as the WGSL does.
 */
export class GradientMapPass extends ShaderPass {
	constructor(stops: GradientStop[] = DEFAULT_STOPS) {
		super({
			name: 'GradientMapPass',
			uniforms: {
				tDiffuse: { value: null },
				uStopColor: { value: Array.from({ length: MAX_STOPS }, () => new THREE.Color()) },
				uStopAlpha: { value: new Array(MAX_STOPS).fill(1) },
				uStopPos: { value: new Array(MAX_STOPS).fill(1) },
				uRepeat: { value: 0 },
				uSpace: { value: 0 },
				uScatter: { value: 0 },
				uFrequency: { value: 2 },
				uOffset: { value: 0 },
				uAmount: { value: 1 }
			},
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDiffuse;
				uniform vec3 uStopColor[ ${MAX_STOPS} ];
				uniform float uStopAlpha[ ${MAX_STOPS} ];
				uniform float uStopPos[ ${MAX_STOPS} ];
				uniform int uRepeat;
				uniform int uSpace;
				uniform float uScatter;
				uniform float uFrequency;
				uniform float uOffset;
				uniform float uAmount;
				varying vec2 vUv;

				const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

				vec3 srgbToLinear( vec3 c ) { return pow( max( c, 0.0 ), vec3( 2.2 ) ); }
				vec3 linearToSrgb( vec3 c ) { return pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) ); }

				vec3 srgbToOklab( vec3 c ) {
					vec3 lin = srgbToLinear( c );
					float l = 0.4121656120 * lin.r + 0.5362752080 * lin.g + 0.0514575653 * lin.b;
					float m = 0.2118591070 * lin.r + 0.6807189584 * lin.g + 0.1074065790 * lin.b;
					float s = 0.0883097947 * lin.r + 0.2818474174 * lin.g + 0.6302613616 * lin.b;
					float l_ = pow( max( l, 0.0 ), 1.0 / 3.0 );
					float m_ = pow( max( m, 0.0 ), 1.0 / 3.0 );
					float s_ = pow( max( s, 0.0 ), 1.0 / 3.0 );
					return vec3(
						0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
						1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
						0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
					);
				}

				vec3 oklabToSrgb( vec3 lab ) {
					float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
					float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
					float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
					float l = l_ * l_ * l_;
					float m = m_ * m_ * m_;
					float s = s_ * s_ * s_;
					vec3 lin = vec3(
						 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
						-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
						-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
					);
					return linearToSrgb( clamp( lin, 0.0, 1.0 ) );
				}

				vec3 toMix( vec3 c ) {
					if ( uSpace == 1 ) return srgbToLinear( c );
					if ( uSpace == 2 ) return srgbToOklab( c );
					return c;
				}
				vec3 fromMix( vec3 c ) {
					if ( uSpace == 1 ) return linearToSrgb( c );
					if ( uSpace == 2 ) return oklabToSrgb( c );
					return c;
				}

				float hash3( vec3 p ) {
					vec3 p3 = fract( p * 0.1031 );
					p3 += dot( p3, p3.yzx + 33.33 );
					return fract( ( p3.x + p3.y ) * p3.z );
				}

				float gradientT( float luma, float scatterOffset ) {
					if ( uRepeat == 0 ) return clamp( luma + scatterOffset - uOffset, 0.0, 1.0 );
					if ( uRepeat == 1 ) return fract( ( luma - uOffset ) * uFrequency + scatterOffset );
					return 1.0 - abs( fract( ( luma - uOffset ) * uFrequency * 0.5 + scatterOffset ) - 0.5 ) * 2.0;
				}

				vec4 ramp( float t ) {
					if ( t <= uStopPos[ 0 ] ) return vec4( uStopColor[ 0 ], uStopAlpha[ 0 ] );
					for ( int i = 0; i < ${MAX_STOPS - 1}; i ++ ) {
						float p1 = uStopPos[ i + 1 ];
						if ( t <= p1 ) {
							float p0 = uStopPos[ i ];
							float f = ( t - p0 ) / max( p1 - p0, 1e-5 );
							vec3 c = fromMix( mix( toMix( uStopColor[ i ] ), toMix( uStopColor[ i + 1 ] ), f ) );
							return vec4( c, mix( uStopAlpha[ i ], uStopAlpha[ i + 1 ], f ) );
						}
					}
					return vec4( uStopColor[ ${MAX_STOPS - 1} ], uStopAlpha[ ${MAX_STOPS - 1} ] );
				}

				void main() {
					vec4 src = texture2D( tDiffuse, vUv );
					// Unmultiply before luma: premultiplied edge pixels read darker
					// than their true colour and would map to the wrong end of the ramp.
					vec3 rgb = src.a > 0.0 ? src.rgb / src.a : src.rgb;

					float luma = dot( clamp( rgb, 0.0, 1.0 ), LUMA );
					float scatterOffset = uScatter > 0.0
						? ( hash3( vec3( gl_FragCoord.xy, 1.0 ) ) - 0.5 ) * uScatter
						: 0.0;

					vec4 mapped = ramp( gradientT( luma, scatterOffset ) );
					vec3 outRgb = mix( rgb, mapped.rgb, uAmount * mapped.a );

					// Re-premultiply; alpha passes through untouched so the
					// silhouette against the CSS stage is unchanged.
					gl_FragColor = vec4( outRgb * src.a, src.a );
				}`
		});

		this.enabled = false;
		this.setStops(stops);
	}

	/**
	 * Any 2–8 stops. The list is padded out to 8 by repeating the last one, so
	 * the shader always walks a fixed array and needs no stop count — dynamic
	 * indexing by a non-loop variable is illegal in GLSL ES 1.0.
	 */
	setStops(stops: GradientStop[]) {
		const sorted = [...stops].sort((a, b) => a.position - b.position).slice(0, MAX_STOPS);
		if (sorted.length === 0) return;
		const colors = this.uniforms.uStopColor.value as THREE.Color[];
		const alphas = this.uniforms.uStopAlpha.value as number[];
		const positions = this.uniforms.uStopPos.value as number[];
		for (let i = 0; i < MAX_STOPS; i++) {
			const stop = sorted[Math.min(i, sorted.length - 1)];
			// LinearSRGBColorSpace means "already in the working space" — i.e. do
			// NOT convert. three's default would treat the hex as sRGB and
			// linearise it, but this pass runs after OutputPass in display space
			// and compares against sRGB luma, so the stops must stay as authored.
			if (typeof stop.color === 'number') colors[i].setHex(stop.color, THREE.LinearSRGBColorSpace);
			else colors[i].setStyle(stop.color, THREE.LinearSRGBColorSpace);
			alphas[i] = stop.alpha ?? 1;
			positions[i] = stop.position;
		}
	}

	set repeatMode(mode: RepeatMode) {
		this.uniforms.uRepeat.value = REPEAT[mode];
	}
	set mixSpace(space: MixSpace) {
		this.uniforms.uSpace.value = SPACE[space];
	}
	/** 0 = untouched, 1 = fully mapped. */
	set amount(v: number) {
		this.uniforms.uAmount.value = v;
	}
	get amount() {
		return this.uniforms.uAmount.value as number;
	}
	set scatter(v: number) {
		this.uniforms.uScatter.value = v;
	}
	get scatter() {
		return this.uniforms.uScatter.value as number;
	}
	set frequency(v: number) {
		this.uniforms.uFrequency.value = v;
	}
	get frequency() {
		return this.uniforms.uFrequency.value as number;
	}
	set offset(v: number) {
		this.uniforms.uOffset.value = v;
	}
	get offset() {
		return this.uniforms.uOffset.value as number;
	}
}
