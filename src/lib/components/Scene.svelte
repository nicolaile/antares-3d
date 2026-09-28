<script lang="ts">
	import { onMount } from 'svelte';
	import { ModelViewer } from '$lib/three/ModelViewer';
	import { initScroll, destroyScroll, onTick, gsap, prefersReducedMotion } from '$lib/scroll';
	import type { RenderParams } from '$lib/three/ModelViewer';
	import type { Shot } from '$lib/three/shot';
	import { LOOK } from '$lib/three/look';

	let {
		src = '/models/cylinder.glb',
		shot,
		paused = false,
		onready = undefined
	}: {
		src?: string;
		/** Where the camera is. Changing it glides the camera to the new shot. */
		shot: Shot;
		/** Stops the slow turn. The model holds the angle it reached. */
		paused?: boolean;
		/** Fires once the model is in the scene, for the render controls. */
		onready?: (viewer: ModelViewer) => void;
	} = $props();


	let host: HTMLDivElement;
	let viewer: ModelViewer | null = $state(null);
	let loaded = $state(false);
	let progress = $state(0);

	$effect(() => {
		if (viewer) viewer.spinning = !paused;
	});

	/** Puts the camera on a shot, gliding there unless `instant`. */
	function frame(v: ModelViewer, next: Shot, instant = false) {
		const r = v.radius;
		const [x, y, z] = next.pos;
		const [tx, ty, tz] = next.target;
		const duration = instant || prefersReducedMotion() ? 0 : 1.6;
		const ease = 'power2.inOut';
		gsap.to(v.camera.position, { x: x * r, y: y * r, z: z * r, duration, ease, overwrite: true });
		gsap.to(v.target, { x: tx * r, y: ty * r, z: tz * r, duration, ease, overwrite: true });
		gsap.to(v.scrollRotation, { y: next.spin, duration, ease, overwrite: true });
		gsap.to(v, { fov: next.fov ?? 38, duration, ease, overwrite: true });
	}

	// Re-frame whenever the shot changes after load. The first framing is
	// instant, in the load handler below.
	$effect(() => {
		const next = shot;
		if (viewer && loaded) frame(viewer, next);
	});

	onMount(() => {
		// onMount never runs during SSR, so WebGL is safely client-only.
		const reduce = prefersReducedMotion();
		const v = new ModelViewer(host, {
			url: src,
			hdr: '/hdr/studio_small_09_1k.hdr',
			// Off. The CAD model has coincident surfaces (parts that touch exactly);
			// they resolve deterministically while nothing moves, but the idle
			// drift re-rolled the depth test every frame and made those seams
			// flicker continuously. Measured: frozen = 0 differing pixels,
			// breathing = ~25k.
			breathe: false,
			// ~80s per revolution. Slow enough to read as presentation rather
			// than animation; raise for a faster turn.
			autoRotate: 0.08,
			onProgress: (f) => (progress = f),
			material: 'satin',
			color: 0x949494,
			// Both were sitting at zero and contributing nothing: bloom changed 0
			// of 19.5M framebuffer bytes, grain only the last bit (max channel
			// difference 1). Omitting the passes entirely rather than running
			// them at zero. Their sliders hide themselves via availableParams().
			bloom: false,
			grain: false,
			// The look, as dialled in through the controls panel.
			params: {
				roughness: 0.43,
				metalness: 0.96,
				clearcoat: 0.55,
				coatRoughness: 1,
				materialEnv: 3,
				key: 14,
				rim: 5,
				ambient: 0,
				environment: 1.15,
				exposure: 1.13,
				ao: 1.15,
				// Parks the whole ramp at its first stop, so the model reads as a
				// flat silhouette rather than a shaded gradient.
				gradientOffset: 1
			},
			// SSR is built and wired but off: measured ~20 fps for no visible gain
			// on this matte coating — the environment map already carries its
			// reflections. Flip to `{ opacity: 0.35 }` to try it on a glossier preset.
			ssr: false,
			// Both ground shadows off. The contact shadow sat at opacity 0 —
			// contributing zero pixels (verified by framebuffer diff) while still
			// rendering all 153 meshes to a depth target plus four blur passes
			// every frame: 63 draw calls and 160k triangles for nothing.
			groundShadow: false,
			contactShadow: false,
			// Off: even fine world-space noise reads as mottling on a shell this
			// large and smooth. Raise above 0 only for close-up hero shots.
			surfaceVariation: 0,
			// Built but off — toggled from the controls panel.
			// Pointer tracking off: the ramp is parked at a fixed offset (below),
			// and letting the cursor sweep it would undo that on first move.
			gradientMap: { on: false, space: 'oklab', repeat: 'none', followPointer: false },
			// Studio look (backdrop sweep + softbox shadow), separate from the
			// gradient map. Also built but off; the toggle applies its own
			// lighting preset over the values above and undoes it on the way out.
			studio: { on: false },
			// DoF off: stock BokehPass has no in-focus range, so the whole model
			// goes soft, and its blurred alpha fringes the silhouette against a
			// light stage. Kept wired for a darker backdrop or a hero still.
			dof: false
		});
		initScroll();
		let offTick = () => {};
		let resetTween: gsap.core.Tween | null = null;
		let reveal: gsap.core.Timeline | null = null;

		// Letting go hands the model back to the timeline: ease the drag offset
		// out to zero.
		//
		// Do NOT gate this on `resetTween.isActive()`. GSAP's `isActive()` tests
		// whether "now" falls inside the tween's time window, not whether it is
		// still alive — a killed tween keeps reporting true until its original
		// duration elapses. Gating on it silently swallowed the reset whenever
		// the model was re-grabbed within 1.6s of a release. Killing any
		// in-flight tween outright is both simpler and correct.
		const releaseDrag = () => {
			if (v.isDragging || v.userRotationSettled) return;
			resetTween?.kill();
			v.settleUserRotation();
			resetTween = gsap.to(v.userRotation, {
				x: 0,
				y: 0,
				duration: 1.6,
				ease: 'power2.out'
			});
		};
		// Grabbing again cancels an in-flight reset so the two don't fight.
		const cancelReset = () => {
			resetTween?.kill();
			// Grabbing during the reveal takes over cleanly instead of fighting it.
			reveal?.kill();
		};

		// Dev-only handle for tuning feel from the console, e.g.
		// __viewer.userRotation.x = 0.5 to watch the reset run.
		if (import.meta.env.DEV) {
			(window as unknown as Record<string, unknown>).__viewer = v;
		}

		// Driven by the viewer's own drag-end event, which fires wherever the
		// pointer was released — a canvas `pointerup` misses off-canvas releases.
		const canvas = v.renderer.domElement;
		canvas.addEventListener('pointerdown', cancelReset);
		const offDragEnd = v.onDragEnd(releaseDrag);

		// Off-screen, the page is still scrolling on the same ticker; skip the
		// frame entirely rather than rendering a canvas nobody can see.
		let visible = true;
		const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
		io.observe(host);

		v.load().then(() => {
			// The final look, after the studio preset has had its say. Before
			// `onready`, so the controls panel reads these as its baseline.
			for (const [k, value] of Object.entries(LOOK)) {
				v.setParam(k as keyof RenderParams, value as number | string);
			}
			frame(v, shot, true);
			v.spinning = !paused;
			viewer = v;
			loaded = true;
			onready?.(v);
			offTick = onTick(() => {
				if (visible) v.render();
			});

			// Reveal: fade up while the model settles from a slight scale and
			// quarter-turn. userRotation ends at 0, so it hands off cleanly to
			// the drag/reset logic. Under reduced motion it is a plain fade.
			reveal = gsap.timeline();
			reveal.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: reduce ? 0.6 : 1.4, ease: 'power2.out' }, 0);
			if (!reduce) {
				reveal
					.from(v.root.scale, { x: 0.94, y: 0.94, z: 0.94, duration: 1.8, ease: 'power3.out' }, 0)
					.from(v.userRotation, { y: -0.35, duration: 2.0, ease: 'power3.out' }, 0);
			}
		});

		return () => {
			io.disconnect();
			reveal?.kill();
			resetTween?.kill();
			gsap.killTweensOf([v, v.camera.position, v.target, v.scrollRotation]);
			canvas.removeEventListener('pointerdown', cancelReset);
			offDragEnd();
			offTick();
			v.dispose();
			viewer = null;
			destroyScroll();
		};
	});
</script>

<div class="scene" bind:this={host} aria-hidden="true">
	{#if !loaded}
		<div class="progress" style:transform="scaleX({progress})"></div>
	{/if}
</div>

<style>
	/* Fills whatever holds it; the parent decides size and placement. */
	.scene {
		position: absolute;
		inset: 0;
	}
	.scene :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Loading: a hairline that fills across the floor, nothing else. */
	.progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1px;
		background: var(--grey-400);
		transform-origin: left;
	}
</style>
