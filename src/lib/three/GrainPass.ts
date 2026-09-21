import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Fine animated film grain, applied last (in display space). The amount is
 * scaled by alpha so the transparent backdrop stays clean — with a
 * premultiplied canvas, noise on alpha-0 pixels shows up as a fringe.
 */
export function createGrainPass(amount = 0.03) {
	return new ShaderPass({
		uniforms: {
			tDiffuse: { value: null },
			uTime: { value: 0 },
			uAmount: { value: amount }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,
		fragmentShader: /* glsl */ `
			uniform sampler2D tDiffuse;
			uniform float uTime;
			uniform float uAmount;
			varying vec2 vUv;

			float hash( vec2 p ) {
				p = fract( p * vec2( 123.34, 456.21 ) );
				p += dot( p, p + 45.32 );
				return fract( p.x * p.y );
			}

			void main() {
				vec4 c = texture2D( tDiffuse, vUv );
				float n = hash( gl_FragCoord.xy + fract( uTime ) * 1000.0 ) - 0.5;
				c.rgb += n * uAmount * c.a;
				gl_FragColor = c;
			}`
	});
}
