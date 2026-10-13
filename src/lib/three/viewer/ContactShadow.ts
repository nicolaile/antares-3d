import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

export interface ContactShadowOptions {
	/** World-space width and depth of the shadow catcher. */
	size: number;
	/** Height above the ground at which geometry stops contributing. */
	far: number;
	/** Render-target resolution; the blur hides anything above 512. */
	resolution?: number;
	/** Blur radius in texels of the first pass; a second pass at 40% smooths the tail. */
	blur?: number;
	opacity?: number;
	color?: THREE.ColorRepresentation;
	/** Objects to hide during the depth pass — e.g. a ground plane that would read as a solid floor. */
	exclude?: THREE.Object3D[];
}

/**
 * Soft ground-contact shadow, the "product on a white table" look.
 *
 * Not a shadow map. An orthographic camera sits *on the ground looking up*
 * and renders the model's depth: geometry touching the floor is near (dark),
 * geometry high up is far (faint), anything past `far` vanishes. Two blur
 * passes turn that into the soft falloff, and a flat plane displays it.
 */
export class ContactShadow {
	/** Add this to the scene; its origin is the ground point under the model. */
	readonly group = new THREE.Group();

	private plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
	private shadowCamera: THREE.OrthographicCamera;
	private depthMaterial: THREE.MeshDepthMaterial;
	private rt: THREE.WebGLRenderTarget;
	private rtBlur: THREE.WebGLRenderTarget;
	private blurScene = new THREE.Scene();
	private blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private blurQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
	private hBlur: THREE.ShaderMaterial;
	private vBlur: THREE.ShaderMaterial;
	private blur: number;
	private res: number;
	private exclude: THREE.Object3D[];

	constructor(
		private renderer: THREE.WebGLRenderer,
		opts: ContactShadowOptions
	) {
		const { size, far } = opts;
		this.res = opts.resolution ?? 512;
		this.blur = opts.blur ?? 5;
		this.exclude = opts.exclude ?? [];

		const rtOpts: THREE.RenderTargetOptions = {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: false
		};
		this.rt = new THREE.WebGLRenderTarget(this.res, this.res, rtOpts);
		this.rtBlur = new THREE.WebGLRenderTarget(this.res, this.res, { ...rtOpts, depthBuffer: false });

		// On the ground, looking straight up (+Y). Image-up is world +Z,
		// image-right is world +X — the display plane below matches that.
		this.shadowCamera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
		this.shadowCamera.rotation.x = Math.PI / 2;
		this.group.add(this.shadowCamera);

		// Depth as coverage: alpha = 1 at the floor, 0 at `far`.
		this.depthMaterial = new THREE.MeshDepthMaterial({
			depthPacking: THREE.BasicDepthPacking,
			blending: THREE.NoBlending
		});
		const color = new THREE.Color(opts.color ?? 0x000000);
		this.depthMaterial.onBeforeCompile = (shader) => {
			shader.uniforms.uShadowColor = { value: color };
			shader.fragmentShader = shader.fragmentShader
				.replace('void main() {', 'uniform vec3 uShadowColor;\nvoid main() {')
				.replace(
					'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
					// Eased so the falloff tails off rather than ending in a hard line.
					'gl_FragColor = vec4( uShadowColor, pow( 1.0 - fragCoordZ, 1.6 ) );'
				);
		};

		this.hBlur = new THREE.ShaderMaterial({ ...HorizontalBlurShader, uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms) });
		this.vBlur = new THREE.ShaderMaterial({ ...VerticalBlurShader, uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms) });
		this.blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hBlur);
		this.blurQuad.frustumCulled = false;
		this.blurScene.add(this.blurQuad);

		this.plane = new THREE.Mesh(
			new THREE.PlaneGeometry(size, size),
			new THREE.MeshBasicMaterial({
				map: this.rt.texture,
				transparent: true,
				opacity: opts.opacity ?? 0.5,
				depthWrite: false,
				// Lies flat with its normal down so UVs match the upward camera;
				// DoubleSide makes it visible from above.
				side: THREE.DoubleSide,
				toneMapped: false
			})
		);
		this.plane.rotation.x = Math.PI / 2;
		this.plane.renderOrder = -1;
		this.group.add(this.plane);
	}

	/** Display opacity of the shadow plane. */
	get opacity() {
		return this.plane.material.opacity;
	}
	set opacity(v: number) {
		this.plane.material.opacity = v;
	}

	/** Call once per frame before the main render. */
	update(scene: THREE.Scene) {
		const r = this.renderer;
		const prevRT = r.getRenderTarget();
		const prevBg = scene.background;
		const prevOverride = scene.overrideMaterial;
		const prevShadowAuto = r.shadowMap.autoUpdate;
		const prevClear = r.getClearColor(new THREE.Color());
		const prevAlpha = r.getClearAlpha();

		// Depth pass. Shadow-map updates are suppressed — this camera would
		// otherwise trigger a full, wasted shadow render of its own.
		this.plane.visible = false;
		const wasVisible = this.exclude.map((o) => o.visible);
		this.exclude.forEach((o) => (o.visible = false));
		scene.background = null;
		scene.overrideMaterial = this.depthMaterial;
		r.shadowMap.autoUpdate = false;
		r.setClearColor(0x000000, 0);
		r.setRenderTarget(this.rt);
		r.clear();
		r.render(scene, this.shadowCamera);
		scene.overrideMaterial = prevOverride;
		scene.background = prevBg;
		r.shadowMap.autoUpdate = prevShadowAuto;
		this.exclude.forEach((o, i) => (o.visible = wasVisible[i]));
		this.plane.visible = true;

		// Wide blur for the body, then a tighter one to smooth the gradient.
		this.blurPass(this.blur);
		this.blurPass(this.blur * 0.4);

		r.setClearColor(prevClear, prevAlpha);
		r.setRenderTarget(prevRT);
	}

	private blurPass(amount: number) {
		const r = this.renderer;
		const step = amount / this.res;

		this.blurQuad.material = this.hBlur;
		this.hBlur.uniforms.tDiffuse.value = this.rt.texture;
		this.hBlur.uniforms.h.value = step;
		r.setRenderTarget(this.rtBlur);
		r.render(this.blurScene, this.blurCamera);

		this.blurQuad.material = this.vBlur;
		this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture;
		this.vBlur.uniforms.v.value = step;
		r.setRenderTarget(this.rt);
		r.render(this.blurScene, this.blurCamera);
	}

	dispose() {
		this.rt.dispose();
		this.rtBlur.dispose();
		this.depthMaterial.dispose();
		this.hBlur.dispose();
		this.vBlur.dispose();
		this.blurQuad.geometry.dispose();
		this.plane.geometry.dispose();
		this.plane.material.dispose();
	}
}
