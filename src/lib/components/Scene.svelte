<script lang="ts">
	import { onMount } from 'svelte';
	import { ModelViewer } from '$lib/three/ModelViewer';
	import { initScroll, destroyScroll, onTick, gsap, ScrollTrigger, prefersReducedMotion } from '$lib/scroll';
	import { currentTheme, onThemeChange, type Theme } from '$lib/theme';
	import type { RenderParams } from '$lib/three/ModelViewer';

	let {
		src = '/models/cylinder.glb',
		trigger = null,
		onready = undefined
	}: {
		src?: string;
		trigger?: HTMLElement | null;
		/** Fires once the model is in the scene, for the render controls. */
		onready?: (viewer: ModelViewer) => void;
	} = $props();

	/**
	 * The rig is lit for a bright surround. On the dark theme the same values
	 * leave the metal reading brighter than its ground, so the environment and
	 * exposure come down to seat it. Only these two — everything else is
	 * theme-independent.
	 */
	const THEME_RENDER: Record<Theme, Partial<RenderParams>> = {
		light: { environment: 1.15, exposure: 1.13 },
		dark: { environment: 0.7, exposure: 1.0 }
	};

	let host: HTMLDivElement;
	let loaded = $state(false);
	/**
	 * The studio look paints its own backdrop across the whole frame, so the
	 * inset rounded stage would crop it into a window onto a lit room. Full
	 * bleed while it is on.
	 */
	let bleed = $state(false);
	let progress = $state(0);

	onMount(() => {
		// onMount never runs during SSR, so WebGL is safely client-only.
		const reduce = prefersReducedMotion();
		const viewer = new ModelViewer(host, {
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
		let ctx: ReturnType<typeof gsap.context> | null = null;
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
			if (viewer.isDragging || viewer.userRotationSettled) return;
			resetTween?.kill();
			viewer.settleUserRotation();
			resetTween = gsap.to(viewer.userRotation, {
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
			(window as unknown as Record<string, unknown>).__viewer = viewer;
		}

		// Driven by the viewer's own drag-end event, which fires wherever the
		// pointer was released — a canvas `pointerup` misses off-canvas releases.
		const canvas = viewer.renderer.domElement;
		canvas.addEventListener('pointerdown', cancelReset);
		const offDragEnd = viewer.onDragEnd(releaseDrag);

		let offTheme = () => {};
		let offStudio = () => {};
		const applyTheme = (theme: Theme) => {
			for (const [k, v] of Object.entries(THEME_RENDER[theme])) {
				viewer.setParam(k as keyof RenderParams, v as number);
			}
		};

		viewer.load().then(() => {
			loaded = true;
			// Before `onready`, so the controls panel reads post-theme values.
			applyTheme(currentTheme());
			offTheme = onThemeChange(applyTheme);
			bleed = viewer.isStudio;
			offStudio = viewer.onStudioChange((on) => (bleed = on));
			onready?.(viewer);
			offTick = onTick(() => viewer.render());

			// Reveal: fade up while the model settles from a slight scale and
			// quarter-turn. userRotation ends at 0, so it hands off cleanly to
			// the drag/reset logic. Under reduced motion it is a plain fade.
			reveal = gsap.timeline();
			reveal.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: reduce ? 0.6 : 1.4, ease: 'power2.out' }, 0);
			if (!reduce) {
				reveal
					.from(viewer.root.scale, { x: 0.94, y: 0.94, z: 0.94, duration: 1.8, ease: 'power3.out' }, 0)
					.from(viewer.userRotation, { y: -0.35, duration: 2.0, ease: 'power3.out' }, 0);
			}

			const r = viewer.radius;

			// One shot per mode, keyed at the scroll positions the mode bar jumps
			// to (0, ¼, ½, ¾), so clicking a mode lands exactly on its shot and
			// scrolling glides between them. Positions are in units of `r`.
			// Segments are linear on purpose — a constant-rate glide. An ease with
			// a fast middle (power1.inOut) reads as a quicker, snappier move.
			//
			// Core's z offset is 10° off vertical, and that angle is load-bearing.
			// `lookAt` derives yaw from the HORIZONTAL part of the view
			// direction; looking straight down that part collapses to nothing and
			// the roll swings wildly — measured 21°/step leaving Core at 1.1°
			// tilt. Without easing to help, the tilt has to do all the work:
			// 3.7°/step at 10°. Still reads as a top-down.
			const shots = [
				{ pos: [0.8, 0.45, 0.95], target: [0, 0, 0], spin: 0 }, // Integrated Shielding
				{ pos: [0.15, 0.1, 0.55], target: [0, 0.05, 0], spin: Math.PI * 0.75 }, // Reactivity Controls
				// Core — top-down. Camera and target share the x offset: a pure pan
				// that shifts the deck right, clear of the copy in the left column.
				{ pos: [-0.1, 0.86, 0.15], target: [-0.1, 0, 0], spin: Math.PI * 1.1 },
				{ pos: [-0.5, 0.85, 0.5], target: [0, 0.12, 0], spin: Math.PI * 1.6 } // Sodium Heat Pipes
			];

			ctx = gsap.context(() => {
				const tl = gsap.timeline({
					scrollTrigger: {
						trigger: trigger ?? document.body,
						start: 'top top',
						end: 'bottom bottom',
						scrub: 1
					}
				});

				const seg = 1 / shots.length;
				shots.slice(1).forEach((shot, i) => {
					const at = i * seg;
					const [x, y, z] = shot.pos;
					const [tx, ty, tz] = shot.target;
					tl.to(viewer.camera.position, { x: x * r, y: y * r, z: z * r, duration: seg, ease: 'none' }, at)
						.to(viewer.target, { x: tx * r, y: ty * r, z: tz * r, duration: seg, ease: 'none' }, at)
						.to(viewer.scrollRotation, { y: shot.spin, duration: seg, ease: 'none' }, at);
				});
				// Last quarter holds the final shot so the track length stays 4 slices.
				tl.to({}, { duration: seg });
			});

			ScrollTrigger.refresh();
		});

		return () => {
			ctx?.revert();
			offTheme();
			offStudio();
			reveal?.kill();
			resetTween?.kill();
			canvas.removeEventListener('pointerdown', cancelReset);
			offDragEnd();
			offTick();
			viewer.dispose();
			destroyScroll();
		};
	});
</script>

<div class="stage" class:bleed bind:this={host} aria-hidden="true">
	{#if !loaded}
		<div class="progress" style:transform="scaleX({progress})"></div>
	{/if}
</div>

<style>
	/* Spans column 1 through 12: the full grid width, inset by the margin.
	   Fixed so it holds still while the scroll track runs behind it. */
	.stage {
		position: fixed;
		top: calc(var(--grid-margin) + var(--bar-block) + var(--bar-gap));
		right: var(--grid-margin);
		bottom: var(--grid-margin);
		left: var(--grid-margin);
		z-index: 0;
		/* Per-theme: a soft falloff on light, flat black on dark. */
		background: var(--stage-surface);
		border-radius: var(--stage-radius);
		/* Clips the canvas to the rounded corners. */
		overflow: hidden;
	}
	.stage :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
	/* Studio: the backdrop is the page. Snaps rather than animates — every
	   intermediate size would reallocate the composer's multisampled targets
	   through the ResizeObserver, which is far more than a 250ms slide is worth. */
	.stage.bleed {
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		border-radius: 0;
	}

	/* Loading: a hairline that fills across the stage floor, nothing else. */
	.progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1px;
		background: color-mix(in oklab, var(--ink) 45%, transparent);
		transform-origin: left center;
		transition: transform 0.25s ease-out;
	}
</style>
