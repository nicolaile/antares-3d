<script lang="ts" module>
	/**
	 * The stages on a page put their models together one at a time, in the
	 * order they start (those that start out of sight, `later`, after the
	 * rest): each is seconds of downloading and a long run of work on the
	 * main thread, and two at once only made both late and the page stutter.
	 */
	let queue: Promise<unknown> = Promise.resolve();
	function inTurn(later: boolean): Promise<() => void> {
		return (async () => {
			// Out of sight: let the stages in view take their place first.
			if (later) await new Promise((r) => setTimeout(r, 0));
			const before = queue;
			let done!: () => void;
			queue = new Promise<void>((r) => (done = r));
			await before;
			return done;
		})();
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { initScroll, destroyScroll, onTick, gsap, prefersReducedMotion } from '$lib/scroll';
	// Types only: three.js itself loads on demand, as its own chunk (see start()).
	import type { ModelViewer, RenderParams } from '$lib/three/ModelViewer';
	import poster from '$lib/assets/images/model-poster.webp?w=2560;1600;900&enhanced';
	import type { Shot } from '$lib/three/shot';
	import { LOOK } from '$lib/three/look';

	let {
		src = '/models/cylinder.glb',
		groups = undefined,
		explode = undefined,
		carve = undefined,
		sections = undefined,
		shot,
		paused = false,
		later = false,
		poster: posterOn = true,
		hold = false,
		onready = undefined
	}: {
		/** The model: one .glb, or several that make it up between them (ModelViewer's `url`). */
		src?: string | string[];
		/** The model's groups, kept apart so each can be dimmed or cut open (ModelViewer's `groups`). */
		groups?: string[];
		/** Groups split into pieces that move apart (ModelViewer's `explode`). */
		explode?: Record<string, { fold?: number; phase?: number; layers?: boolean; columns?: boolean }>;
		/** Parts carved into groups of their own (ModelViewer's `carve`). */
		carve?: Record<string, { from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }>;
		/** Groups cut in half-section (ModelViewer's `sections`). */
		sections?: Record<string, { at: [number, number, number]; along: [number, number, number]; radius: number }>;
		/** Where the camera is. Changing it glides the camera to the new shot. */
		shot: Shot;
		/** Stops the slow turn. The model holds the angle it reached. */
		paused?: boolean;
		/** Out of sight to begin with: its model loads after those in view (read once, at the start). */
		later?: boolean;
		/**
		 * The render shown until the canvas fades in. Off for a model it
		 * doesn't show: then it isn't fetched at all.
		 */
		poster?: boolean;
		/**
		 * Not wanted yet: nothing is fetched, even within a screen of view,
		 * until it turns false. For a model the visitor may never reach.
		 */
		hold?: boolean;
		/** Fires once the model is in the scene, for the render controls. */
		onready?: (viewer: ModelViewer) => void;
	} = $props();


	/*
	 * The poster is a render of the opening shot, shown until the live model
	 * is ready, and again if WebGL fails or the context is lost. It scales the
	 * way the camera does: the model fills a fixed share of the frame height,
	 * until the frame is too narrow and the lens widens to fit the width.
	 * POSTER_FIT is that share — the bounding sphere's height over the frame
	 * height, measured from the viewer when the poster was captured. Recapture
	 * both together if the opening shot, lens or look change.
	 */
	const POSTER_FIT = 0.9357;

	let host: HTMLDivElement;
	let viewer: ModelViewer | null = $state(null);
	let loaded = $state(false);
	let progress = $state(0);
	/** False once the live canvas has faded in over the poster. */
	let posterShown = $state(true);
	/** WebGL couldn't start: the poster stays, the loading line goes. */
	let failed = $state(false);

	/** Starts the load once the stage is near and not held (set on mount). */
	let begin: (() => void) | null = null;
	$effect(() => {
		if (!hold) begin?.();
	});

	// Pausing and resuming both force a fresh frame: the viewer draws on
	// demand, so without one a model coming back into view could show a
	// stale or empty canvas until the next change.
	$effect(() => {
		if (!viewer) return;
		viewer.spinning = !paused;
		viewer.invalidate();
	});

	/** Puts the camera on a shot, gliding there unless `instant`. */
	function frame(v: ModelViewer, next: Shot, instant = false) {
		const r = v.radius;
		const [x, y, z] = next.pos;
		const [tx, ty, tz] = next.target;
		const duration = instant || next.snap || prefersReducedMotion() ? 0 : 1.6;
		const delay = instant || next.snap ? 0 : (next.after ?? 0);
		const ease = 'power2.inOut';
		gsap.to(v.camera.position, { x: x * r, y: y * r, z: z * r, duration, delay, ease, overwrite: true });
		gsap.to(v.target, { x: tx * r, y: ty * r, z: tz * r, duration, delay, ease, overwrite: true });
		gsap.to(v.scrollRotation, { y: next.spin, z: next.lean ?? 0, duration, delay, ease, overwrite: true });
		gsap.to(v, { fov: next.fov ?? 38, duration, delay, ease, overwrite: true });
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
		const light = matchMedia('(pointer: coarse)').matches || innerWidth < 768;
		initScroll();

		// Off-screen, the page is still scrolling on the same ticker; skip the
		// frame entirely rather than rendering a canvas nobody can see.
		let visible = true;
		const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
		io.observe(host);

		let unmounted = false;
		let stop: (() => void) | null = null;
		let rebuilds = 0;

		/** Builds a viewer and wires it up; `stop` tears exactly this one down. */
		async function start() {
			const done = await inTurn(untrack(() => later));
			const { ModelViewer } = await import('$lib/three/ModelViewer').catch((e) => {
				done();
				throw e;
			});
			if (unmounted) return done();
			let v: ModelViewer;
			try {
				v = new ModelViewer(host, {
					url: src,
					groups,
					explode,
					carve,
					sections,
					// 512×256: renders within 0.2/255 of the 1k original (mean), a quarter of the bytes.
					hdr: '/hdr/studio_small_09_512.hdr',
					// Phones: GPUs pay per pixel, so fewer of them, and occlusion at half size.
					maxPixelRatio: light ? 1.5 : 2,
					aoScale: light ? 0.5 : 1,
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
			} catch {
				failed = true;
				return done();
			}
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
			// The reveal is only a crossfade, so it can finish under the drag.
			const cancelReset = () => resetTween?.kill();

			// Dev-only handle for tuning feel from the console, e.g.
			// __viewer.userRotation.x = 0.5 to watch the reset run.
			if (import.meta.env.DEV) {
				(window as unknown as Record<string, unknown>).__viewer = v;
				// Every viewer on the page, when there's more than one (the CAD stages).
				(((window as unknown as Record<string, unknown>).__viewers ??= []) as ModelViewer[]).push(v);
			}

			// Driven by the viewer's own drag-end event, which fires wherever the
			// pointer was released — a canvas `pointerup` misses off-canvas releases.
			const canvas = v.renderer.domElement;
			canvas.addEventListener('pointerdown', cancelReset);
			const offDragEnd = v.onDragEnd(releaseDrag);

			v.load()
				.then(async () => {
					// The final look, after the studio preset has had its say. Before
					// `onready`, so the controls panel reads these as its baseline.
					for (const [k, value] of Object.entries(LOOK)) {
						v.setParam(k as keyof RenderParams, value as number | string);
					}
					frame(v, shot, true);
					// Every shader, buffer and blend drawn once, out of sight, so the
					// first frames seen (and the first see-through fade) don't stall.
					await v.warmUp();
					if (unmounted) return;
					v.spinning = !paused;
					viewer = v;
					loaded = true;
					onready?.(v);
					offTick = onTick(() => {
						if (visible) v.render();
					});

					// Reveal: the poster already shows this exact frame, so the live
					// canvas simply crossfades in over it — any motion here would
					// double the image. The poster drops once the canvas is opaque.
					reveal = gsap.timeline({ onComplete: () => (posterShown = false) });
					reveal.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: reduce ? 0.3 : 0.6, ease: 'power1.out' }, 0);
				})
				.catch(() => {
					// The model or lighting didn't arrive: the poster is the model.
					failed = true;
				})
				.finally(done);

			// The GPU dropped the context: show the poster, then try a fresh
			// viewer with a fresh canvas. Twice at most — a device that keeps
			// losing it is better off with the still.
			const offLost = v.onContextLost(() => {
				// Its turn is over: a load cut short by the loss mustn't hold up the others.
				done();
				stop?.();
				stop = null;
				posterShown = true;
				loaded = false;
				if (rebuilds++ < 2) setTimeout(() => !unmounted && start(), 800);
			});

			stop = () => {
				offLost();
				reveal?.kill();
				resetTween?.kill();
				gsap.killTweensOf([v, v.camera.position, v.target, v.scrollRotation]);
				canvas.removeEventListener('pointerdown', cancelReset);
				offDragEnd();
				offTick();
				v.dispose();
				viewer = null;
			};
		}

		// Fetch three.js, the model and the lighting only as the stage comes
		// within a screen of view, so they never hold up the rest of the page;
		// and, while held, not until it's let go as well.
		let isNear = false;
		let begun = false;
		begin = () => {
			if (begun || !isNear || untrack(() => hold)) return;
			begun = true;
			start();
		};
		const near = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				near.disconnect();
				isNear = true;
				begin?.();
			},
			{ rootMargin: '100% 0px' }
		);
		near.observe(host);

		return () => {
			begin = null;
			unmounted = true;
			near.disconnect();
			io.disconnect();
			stop?.();
			destroyScroll();
		};
	});
</script>

<div class="scene" bind:this={host} aria-hidden="true" style:--poster-fit={POSTER_FIT}>
	{#if posterOn && posterShown}
		<enhanced:img class="poster" src={poster} alt="" sizes="(max-width: 767px) 100vw, 70vw" />
	{/if}
	{#if !loaded && !failed}
		<div class="progress" style:transform="scaleX({progress})"></div>
	{/if}
</div>

<style>
	/* Fills whatever holds it; the parent decides size and placement. */
	.scene {
		position: absolute;
		inset: 0;
		/* The poster sizes itself against this box, like the camera does, and
		   is wider than it on most screens. */
		container-type: size;
		overflow: hidden;
	}

	/* Full height while the frame is wide; once it narrows past the fit, the
	   width takes over — the same switch the viewer's lens makes. */
	.scene :global(.poster) {
		position: absolute;
		left: 50%;
		top: 50%;
		width: auto;
		height: min(100cqh, calc(100cqw / var(--poster-fit)));
		max-width: none;
		translate: -50% -50%;
		pointer-events: none;
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
