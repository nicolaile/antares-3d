<script lang="ts" module>
	/**
	 * Stages build their models one at a time, in start order (`later` ones
	 * last): each is seconds of downloading and a long main-thread task, and
	 * two at once make both late and the page stutter.
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
	import { initScroll, destroyScroll, onTick, gsap, prefersReducedMotion } from '$lib/motion/scroll';
	// Types only: three.js loads on demand as its own chunk (see start()).
	import type { ColourSlots, ModelViewer, RenderParams } from '$lib/three/viewer/ModelViewer';
	import poster from '$lib/assets/images/model-poster.webp?w=2560;1600;900&enhanced';
	import type { Shot } from '$lib/three/viewer/shot';
	import { LOOK } from '$lib/three/viewer/look';

	let {
		src,
		groups = undefined,
		explode = undefined,
		carve = undefined,
		colours = undefined,
		sections = undefined,
		shot,
		paused = false,
		later = false,
		poster: posterOn = true,
		hold = false,
		asleep = false,
		onready = undefined
	}: {
		/** The model: one .glb, or several that make it up between them (ModelViewer's `url`). */
		src: string | string[];
		/** The model's groups, kept apart so each can be dimmed or cut open (ModelViewer's `groups`). */
		groups?: string[];
		/** Groups split into pieces that move apart (ModelViewer's `explode`). */
		explode?: Record<string, { fold?: number; phase?: number; layers?: boolean; columns?: boolean }>;
		/** Parts carved into groups of their own (ModelViewer's `carve`). */
		carve?: Record<
			string,
			{ from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }
		>;
		/** Parts given a colour of their own (ModelViewer's `colours`). */
		colours?: ColourSlots;
		/** Groups cut in half-section (ModelViewer's `sections`). */
		sections?: Record<string, { at: [number, number, number]; along: [number, number, number]; radius: number }>;
		/** Where the camera is. Changing it glides the camera to the new shot. */
		shot: Shot;
		/** Stops the slow turn. The model holds the angle it reached. */
		paused?: boolean;
		/** Out of sight to begin with: its model loads after those in view (read once, at the start). */
		later?: boolean;
		/** The render shown until the canvas fades in. Off for a model it doesn't show, so it isn't fetched. */
		poster?: boolean;
		/** Nothing is fetched, even within a screen of view, until this turns false: for a model the visitor may never reach. */
		hold?: boolean;
		/**
		 * Off stage: once faded out, the viewer frees its frame's GPU memory and
		 * stops drawing (ModelViewer's `sleep`); it wakes at once when this turns false.
		 */
		asleep?: boolean;
		/** Fires once the model is in the scene, for the render controls. */
		onready?: (viewer: ModelViewer) => void;
	} = $props();

	/*
	 * The poster renders the opening shot, shown until the live model is ready
	 * and again if WebGL fails or the context is lost. It scales as the camera
	 * does: the model fills a fixed share of the frame height until the frame is
	 * too narrow and the lens fits the width. POSTER_FIT is that share (bounding
	 * sphere height over frame height, measured from the viewer). Recapture both
	 * together if the opening shot, lens or look change.
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

	// Pausing and resuming both force a fresh frame: the viewer draws on demand,
	// so a model coming back into view could otherwise show a stale canvas.
	$effect(() => {
		if (!viewer) return;
		viewer.spinning = !paused;
		viewer.invalidate();
	});

	/** How long off stage before sleeping, seconds: the explorer's fade out (0.4 s) and some. */
	const SLEEP_AFTER = 1;
	$effect(() => {
		if (!viewer) return;
		const v = viewer;
		if (!asleep) return v.wake();
		const call = gsap.delayedCall(SLEEP_AFTER, () => v.sleep());
		return () => call.kill();
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

	// The first framing is instant, in the load handler below.
	$effect(() => {
		const next = shot;
		if (viewer && loaded) frame(viewer, next);
	});

	onMount(() => {
		// onMount never runs during SSR, so WebGL is safely client-only.
		const reduce = prefersReducedMotion();
		const light = matchMedia('(pointer: coarse)').matches || innerWidth < 768;
		initScroll();

		// The ticker keeps running off-screen; skip frames nobody can see. Under a
		// fifth of the stage in view counts as off: it holds its last frame.
		const IN_VIEW = 0.2;
		let visible = true;
		const io = new IntersectionObserver(([entry]) => (visible = entry.intersectionRatio >= IN_VIEW), {
			threshold: [0, IN_VIEW]
		});
		io.observe(host);

		let unmounted = false;
		let stop: (() => void) | null = null;
		let rebuilds = 0;

		/** Builds a viewer and wires it up; `stop` tears exactly this one down. */
		async function start() {
			const done = await inTurn(untrack(() => later));
			const { ModelViewer } = await import('$lib/three/viewer/ModelViewer').catch((e) => {
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
					colours,
					sections,
					// 512×256: renders within 0.2/255 of the 1k original (mean), a quarter of the bytes.
					hdr: '/hdr/studio_small_09_512.hdr',
					// Capped below retina 2×: the frame is pixel-bound, and 1.5 draws 44% fewer
					// (3.6 → 2.2 ms on an M4 Max) for a barely softer image; 4× multisampling
					// keeps the edges. Phones also take occlusion at half size.
					maxPixelRatio: 1.5,
					// Dev, ?visibility: the part indices kept for the visibility sampler (perf.ts).
					keepParts: import.meta.env.DEV && new URLSearchParams(location.search).has('visibility'),
					aoScale: light ? 0.5 : 1,
					// Off: the CAD has coincident surfaces, stable while still, but the idle
					// drift re-rolls the depth test every frame and makes those seams flicker.
					breathe: false,
					// ~80 s per revolution: slow enough to read as presentation, not animation.
					autoRotate: 0.08,
					onProgress: (f) => (progress = f),
					material: 'satin',
					color: 0x949494,
					// Both add nothing visible at this look, so their passes are skipped
					// entirely; their sliders hide via availableParams().
					bloom: false,
					grain: false,
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
					// SSR off: it costs ~20 fps for no visible gain on this matte coating, where
					// the environment map carries the reflections. `{ opacity: 0.35 }` turns it on.
					ssr: false,
					// Ground shadows off: the contact shadow is invisible at this look yet
					// costs a depth pass of every mesh plus four blurs each frame.
					groundShadow: false,
					contactShadow: false,
					// Off: even fine world-space noise reads as mottling on a shell this large and smooth.
					surfaceVariation: 0,
					// Toggled from the controls panel. No pointer tracking: the ramp is parked
					// at a fixed offset (gradientOffset) that the cursor would undo.
					gradientMap: { on: false, space: 'oklab', repeat: 'none', followPointer: false },
					// Studio look (backdrop sweep + softbox shadow), toggled from the controls
					// panel: it applies its own lighting preset and undoes it when turned off.
					studio: { on: false },
					// DoF off: stock BokehPass has no in-focus range, so the whole model goes
					// soft and its blurred alpha fringes the silhouette on a light stage.
					dof: false
				});
			} catch {
				failed = true;
				return done();
			}
			let offTick = () => {};
			let resetTween: gsap.core.Tween | null = null;
			let reveal: gsap.core.Timeline | null = null;

			// Letting go eases the drag offset back to zero. Don't gate this on
			// `resetTween.isActive()`: a killed tween reports active until its duration
			// elapses, which would swallow the reset after a quick re-grab.
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

			// Dev-only console handle, e.g. `__viewer.userRotation.x = 0.5` to watch the reset.
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
						if (!visible) return;
						// Awake on stage whatever order the hand-off's calls arrive in; a no-op when it is.
						if (!asleep) v.wake();
						v.render();
					});

					// The poster shows this exact frame, so the canvas only crossfades in:
					// any motion would double the image.
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

		// three.js, the model and the lighting load only once the stage is within a
		// screen of view (and not held), so they never hold up the rest of the page.
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
