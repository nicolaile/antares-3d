<!--
	@component
	The features as a strip of numbered card tabs, scrolling sideways when
	they overflow, over a panel with the open feature's title and description,
	and a pause button.

	The CAD fills the panel: each feature names the model it's shown on, and
	the stage cuts between models one at a time. Opening a feature turns its
	model to the feature's point (cadPoints.ts, unmarked) and moves the camera
	to its shot. Autoplay moves on every 15 s; pause holds it and the slow turn.
	Place in a full-width `subgrid` cell.
-->
<script lang="ts" module>
	import type { Picture as PictureSource } from 'vite-imagetools';
	import type { Shot } from '$lib/three/viewer/shot';
	import type { CadLabel } from '$lib/three/cad/cadPoints';
	import type { TrailSet } from '$lib/three/EnergyTrails';
	import type { ColourSlots } from '$lib/three/viewer/ModelViewer';
	import type { Look } from '$lib/explorer/CadStage.svelte';

	/**
	 * A feature's own stage, in place of the model: an image bleeding off
	 * the stage's right and bottom edges, and a figure with a small graphic
	 * under it.
	 */
	export type Panel = {
		image: { src: PictureSource; alt: string; ratio: string };
		value: string;
		detail: string;
		/** URL of a small line graphic under the figure. */
		graphic?: string;
	};

	export type Feature = {
		title: string;
		text: string;
		/** Where the camera goes while this feature is open; without one it stays on the last shot. */
		shot?: Shot;
		/** The feature's own stage, in place of the model. */
		panel?: Panel;
		/** Which of the explorer's `models` this feature is shown on. */
		model?: CadModel;
		/** What shows of the model while this feature is open: parts put away, covers cut open (CadStage). */
		look?: Look;
		/** Holds the model still while this feature is open: no slow turn. */
		still?: boolean;
	};

	/** The CAD models, by the names their points use (cadPoints.ts). */
	export type CadModel = CadLabel['model'];

	/** A model on the stage and its setup, passed on to ModelViewer. */
	export type CadModelSetup = {
		/** Its groups' files, under static/models/cad/web/. */
		files: string[];
		/** Parts carved into groups of their own (ModelViewer's `carve`). */
		carve?: Record<
			string,
			{ from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }
		>;
		/** Parts given a colour of their own (ModelViewer's `colours`). */
		colours?: ColourSlots;
		/** Groups cut in half-section (ModelViewer's `sections`). */
		sections?: Record<string, { at: [number, number, number]; along: [number, number, number]; radius: number }>;
		/** Pipes energy can run along, where a feature's look turns it on (CadStage's `trails`). */
		trails?: TrailSet;
	};
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { onMount, untrack } from 'svelte';
	import FeatureTab from '$lib/components/FeatureTab.svelte';
	import PauseButton from '$lib/components/PauseButton.svelte';
	import WipBadge from '$lib/components/WipBadge.svelte';
	import CadStage from '$lib/explorer/CadStage.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Controls from '$lib/explorer/Controls.svelte';
	import EnergyControls from '$lib/explorer/EnergyControls.svelte';
	import PerfHud from '$lib/dev/PerfHud.svelte';
	import type { PerfTarget } from '$lib/dev/perf';
	import type { EnergyParams, TrailLook } from '$lib/energy/energy';
	import type { EnergyTrails } from '$lib/three/EnergyTrails';
	import type { ModelViewer } from '$lib/three/viewer/ModelViewer';
	import { CAD_POINTS } from '$lib/three/cad/cadPoints';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
	import { InertiaPlugin } from 'gsap/InertiaPlugin';
	import { SplitText } from 'gsap/SplitText';

	let {
		features,
		models,
		wip = false
	}: {
		features: Feature[];
		/** Tags the 3D models as stand-ins (WipBadge, under the model). */
		wip?: boolean;
		models: Partial<Record<CadModel, CadModelSetup>>;
	} = $props();

	let active = $state(0);
	let paused = $state(false);
	const names = Object.keys(untrack(() => models)) as CadModel[];

	/** The 01–07 points on each model; point n is feature n. */
	const pointsOf = (model: CadModel) =>
		CAD_POINTS.filter((p) => p.model === model && features[p.point - 1]).map((p) => ({
			number: p.point,
			at: p.at
		}));

	/** A plain three-quarter view, for a model none of whose features has a shot. */
	const FALLBACK: Shot = { pos: [0, 0.7, 1.4], target: [0, 0, 0], spin: 0 };
	const firstShot = (m: CadModel) => features.find((f) => f.model === m && f.shot)?.shot ?? FALLBACK;
	/** The groups some feature on `model` takes apart, by how many pieces (CadStage's `explode`). */
	const explodeOf = (model: CadModel) =>
		Object.fromEntries(
			features
				.filter((f) => f.model === model)
				.flatMap((f) => Object.entries(f.look?.explode ?? {}))
				.flatMap(([g, e]) =>
					e.sectors || e.layers || e.columns
						? [
								[
									g,
									{
										fold: e.sectors,
										phase: e.phase === undefined ? undefined : (e.phase * Math.PI) / 180,
										layers: e.layers,
										columns: e.columns
									}
								]
							]
						: []
				)
		) as Record<string, { fold?: number; phase?: number; layers?: boolean; columns?: boolean }>;

	/** Each model's look: the last feature on it sets it. */
	const looks = $state(untrack(() => Object.fromEntries(names.map((m) => [m, {}]))) as Record<CadModel, Look>);
	/**
	 * What each model's stage frames (CadStage's `aim`): the shot of the last
	 * feature on it that had one, so it holds still while another model is up
	 * and is framed on return; the open point; and the wait before it's seen
	 * (HANDOFF when coming in from another model, else 0). Set as one object
	 * so they always change together.
	 */
	const aims = $state(
		untrack(() =>
			Object.fromEntries(
				names.map((m) => [m, { shot: firstShot(m), point: features[active].model === m ? active + 1 : null, lead: 0 }])
			)
		) as Record<CadModel, { shot: Shot; point: number | null; lead: number }>
	);
	let lastModel: CadModel | undefined = untrack(() => features[active].model);
	$effect(() => {
		const f = features[active];
		const i = active;
		untrack(() => {
			if (f.model) {
				aims[f.model] = {
					shot: f.shot ?? aims[f.model].shot,
					point: i + 1,
					lead: f.model !== lastModel ? HANDOFF.in : 0
				};
				if (!f.panel) looks[f.model] = f.look ?? {};
			}
			lastModel = f.model;
		});
	});

	/**
	 * The hand-off between views, seconds: the outgoing one fades out over
	 * `out`, then after a beat the incoming one fades in from `in`, so the
	 * two never show at once.
	 */
	const HANDOFF = { out: 0.4, in: 0.55 };

	/** What a feature puts on the stage: its own panel (by feature index), or its model. */
	type View = CadModel | number | null;
	const viewOf = (i: number): View => (features[i].panel ? i : (features[i].model ?? null));
	const stageEls: Partial<Record<CadModel, HTMLElement>> = $state({});
	const panelEls: HTMLElement[] = $state([]);
	const opening: View = untrack(() => viewOf(active));
	let showing = opening;
	let fade: gsap.core.Timeline | null = null;
	/** The model on stage; the others hold still and stop drawing. */
	const onStage = $derived(viewOf(active));

	const layerOf = (v: View) => (v === null ? undefined : typeof v === 'number' ? panelEls[v] : stageEls[v]);
	const isStage = (el: HTMLElement) => Object.values(stageEls).includes(el);
	// Models fade by opacity alone, never visibility: a hidden WebGL canvas can
	// lose its last frame and flash empty on the way back.
	const hideVars = (el: HTMLElement) => (isStage(el) ? { opacity: 0, pointerEvents: 'none' } : { autoAlpha: 0 });
	const showVars = (el: HTMLElement) => (isStage(el) ? { opacity: 1, pointerEvents: 'auto' } : { autoAlpha: 1 });

	$effect(() => {
		const next = viewOf(active);
		if (next === showing) return;
		showing = next;
		const incoming = layerOf(next);
		// Everything else goes, including a view left half-shown by a switch
		// cut short.
		const all: View[] = [...names, ...features.flatMap((f, i) => (f.panel ? [i] : []))];
		const outgoing = all.map(layerOf).filter((el): el is HTMLElement => !!el && el !== incoming);
		const k = prefersReducedMotion() ? 0 : 1;
		fade?.kill();
		fade = gsap.timeline();
		for (const el of outgoing) fade.to(el, { ...hideVars(el), duration: HANDOFF.out * k, ease: 'power1.in' }, 0);
		if (incoming) fade.to(incoming, { ...showVars(incoming), duration: 0.6 * k, ease: 'power1.out' }, HANDOFF.in * k);
	});

	let tabsEl: HTMLOListElement;
	/**
	 * Whether there are tabs scrolled out of view on either side: on screens
	 * wider than the content column, where the strip stops at the panel's
	 * edges, those edges fade (see the styles).
	 */
	const more = { left: false, right: false };
	function edges() {
		const left = tabsEl.scrollLeft > 1;
		const right = tabsEl.scrollLeft < maxScroll() - 1;
		if (left === more.left && right === more.right) return;
		more.left = left;
		more.right = right;
		// Eased in or out as tabs go out of view or come back.
		const fade = parseFloat(getComputedStyle(document.body).fontSize) * 3;
		gsap.to(tabsEl, {
			'--fade-left': `${left ? fade : 0}px`,
			'--fade-right': `${right ? fade : 0}px`,
			duration: 0.35,
			ease: 'power2.out',
			overwrite: 'auto'
		});
	}

	/** A drag just ended: the click it ends on isn't a pick. */
	let dragged = false;

	/** How far the strip scrolls to bring tab `i` to its left edge, on the grid line. */
	const scrollTo = (i: number) => {
		const tabs = tabsEl.children as HTMLCollectionOf<HTMLElement>;
		return tabs[i].offsetLeft - tabs[0].offsetLeft;
	};
	const maxScroll = () => tabsEl.scrollWidth - tabsEl.clientWidth;

	function select(i: number) {
		if (i === active) return;
		active = i;
		// The strip eases the picked tab to the middle every time (as far as
		// its ends allow), so the strip always answers the same way. It takes
		// over from a fling or an earlier pick still under way.
		const tab = tabsEl.children[i] as HTMLElement;
		// (The strip is positioned, so a tab's offsetLeft is measured in it.)
		const middle = tab.offsetLeft - (tabsEl.clientWidth - tab.offsetWidth) / 2;
		gsap.to(tabsEl, {
			scrollLeft: gsap.utils.clamp(0, maxScroll(), middle),
			duration: prefersReducedMotion() ? 0 : 0.7,
			ease: 'expo.out',
			overwrite: 'auto'
		});
	}
	const step = (d: number) => select((active + d + features.length) % features.length);

	/**
	 * Autoplay: each feature open for AUTOPLAY seconds, its tab filling as the
	 * time runs (FeatureTab's `progress`), then on to the next, wrapping round.
	 * A pick restarts the count. Runs only while the explorer is in view, holds
	 * while the model is dragged or paused, and is off for reduced motion.
	 */
	const AUTOPLAY = 15;
	let progress = $state(0);
	let explorerEl: HTMLDivElement;
	let inView = false;
	let holding = false;
	let autoplay: gsap.core.Tween | null = null;
	const clock = { t: 0 };
	function syncAutoplay() {
		if (autoplay) autoplay.paused(!inView || holding || untrack(() => paused));
	}
	$effect(() => {
		void paused;
		syncAutoplay();
	});
	$effect(() => {
		void active;
		untrack(() => {
			autoplay?.kill();
			clock.t = 0;
			progress = 0;
			if (prefersReducedMotion()) return;
			autoplay = gsap.to(clock, {
				t: 1,
				duration: AUTOPLAY,
				ease: 'none',
				onUpdate: () => (progress = clock.t),
				onComplete: () => step(1)
			});
			syncAutoplay();
		});
	});

	/**
	 * The open feature's title and description. A pick fades the old words out
	 * quickly, then the new ones rise in line by line, title first. A pick
	 * mid-change takes over from the one under way.
	 */
	let detailEl: HTMLDivElement;
	/**
	 * The feature the panel's words are for: catches up with `active` once
	 * the old words are out. Written in by hand, not by the template:
	 * SplitText swaps the text nodes out for its lines and back, and Svelte
	 * would go on updating the ones it made, no longer on the page.
	 */
	let said = untrack(() => active);
	const firstWords = untrack(() => ({ title: features[active].title, text: features[active].text }));
	let words: gsap.core.Timeline | gsap.core.Tween | null = null;
	let split: SplitText | null = null;
	$effect(() => {
		const next = active;
		untrack(() => {
			if (next === said && !words) return;
			const blocks = [...detailEl.children] as HTMLElement[];
			const reduce = prefersReducedMotion();
			words?.kill();
			split?.revert();
			split = null;
			words = gsap.to(blocks, {
				autoAlpha: 0,
				duration: 0.2,
				ease: 'power2.in',
				onComplete: () => {
					said = next;
					blocks[0].textContent = features[next].title;
					blocks[1].textContent = features[next].text;
					reveal(blocks, reduce);
				}
			});
		});
	});
	function reveal(blocks: HTMLElement[], reduce: boolean) {
		gsap.registerPlugin(SplitText);
		gsap.set(blocks, { autoAlpha: 1 });
		if (reduce) {
			words = gsap.fromTo(blocks, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, onComplete: () => (words = null) });
			return;
		}
		split = SplitText.create(blocks, { type: 'lines' });
		words = gsap.fromTo(
			split.lines,
			{ autoAlpha: 0, y: 10 },
			{
				autoAlpha: 1,
				y: 0,
				duration: 0.9,
				ease: 'power3.out',
				stagger: 0.07,
				// Back to plain text once it's in, so it rewraps with the panel.
				onComplete: () => {
					split?.revert();
					split = null;
					words = null;
				}
			}
		);
	}

	/** The tabs and the panel they control, tied together by id. */
	const uid = $props.id();
	const tabId = (i: number) => `${uid}-tab-${i}`;
	const panelId = `${uid}-panel`;

	/** Arrow keys, Home and End step along the strip, focus following the open tab. */
	function onTabKey(e: KeyboardEvent) {
		const to = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: features.length - 1 }[e.key];
		if (to === undefined) return;
		e.preventDefault();
		const i = (to + features.length) % features.length;
		select(i);
		(tabsEl.children[i]?.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
	}

	/**
	 * With a mouse, the strip drags: flung, it glides on (InertiaPlugin) and
	 * settles with a tab's edge on the grid line. A drag never picks the tab it
	 * ends on. Touch keeps the browser's own swipe. Not Draggable: its scroll
	 * mode wraps the tabs in a div, which the layout and Svelte can't have.
	 * Returns the cleanup.
	 */
	function dragStrip() {
		if (!matchMedia('(pointer: fine)').matches) return () => {};
		gsap.registerPlugin(InertiaPlugin);
		/** Where the nearest tab edge is to scroll position `x` (or the strip's end). */
		const settle = (x: number) => {
			const stops = [...features.keys()]
				.map(scrollTo)
				.filter((s) => s < maxScroll())
				.concat(maxScroll());
			return stops.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
		};
		/**
		 * The drag's own position, which may run past the strip's ends: there the
		 * tabs stretch with growing resistance (`pull`) and spring back on release.
		 * It eases toward the pointer on GSAP's ticker, so it glides between mouse events.
		 */
		const at = { x: 0 };
		/** How far the tabs stretch for `over` px dragged past an end: never more than STRETCH. */
		const STRETCH = parseFloat(getComputedStyle(document.body).fontSize) * 6;
		const pull = (over: number) => Math.sign(over) * STRETCH * (1 - 1 / ((Math.abs(over) / STRETCH) * 0.55 + 1));
		const apply = () => {
			const scroll = gsap.utils.clamp(0, maxScroll(), at.x);
			tabsEl.scrollLeft = scroll;
			tabsEl.style.setProperty('--pull', `${-pull(at.x - scroll)}px`);
		};
		/** Where the pointer has taken the drag; `at` closes on it each frame. */
		let target = 0;
		/** Share of the gap closed per frame at 60fps: about 0.2s to all but catch up. */
		const CATCH = 0.3;
		const chase = (_t: number, delta: number) => {
			const k = 1 - Math.pow(1 - CATCH, delta / (1000 / 60));
			at.x += (target - at.x) * k;
			if (Math.abs(target - at.x) < 0.1) at.x = target;
			apply();
		};
		const startChase = () => gsap.ticker.add(chase);
		const stopChase = () => gsap.ticker.remove(chase);
		/** The spring back from past an end. */
		let spring: gsap.core.Tween | null = null;

		/** The pointer's x and the drag position when the drag took hold. */
		let from: { x: number; at: number } | null = null;
		let pressed = false;
		let pressX = 0;
		/** The last few moves, for the speed it's let go at. */
		let trail: { x: number; t: number }[] = [];
		const down = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse' || e.button !== 0) return;
			gsap.killTweensOf(tabsEl);
			spring?.kill();
			stopChase();
			at.x = target = tabsEl.scrollLeft;
			pressed = true;
			pressX = e.clientX;
			from = null;
			trail = [{ x: e.clientX, t: e.timeStamp }];
		};
		const move = (e: PointerEvent) => {
			if (!pressed) return;
			if (!from) {
				if (Math.abs(e.clientX - pressX) < 6) return;
				// Measured from where it takes hold, 6px along from the press, so
				// the strip doesn't lurch to catch up the threshold (but keeps
				// all of a fast first move past it).
				from = { x: pressX + Math.sign(e.clientX - pressX) * 6, at: at.x };
				dragged = true;
				tabsEl.setPointerCapture(e.pointerId);
				tabsEl.classList.add('dragging');
				startChase();
			}
			target = from.at - (e.clientX - from.x);
			trail = [...trail, { x: e.clientX, t: e.timeStamp }].filter((p) => e.timeStamp - p.t < 100);
		};
		const up = (e: PointerEvent) => {
			if (!pressed) return;
			pressed = false;
			if (!from) return;
			from = null;
			tabsEl.classList.remove('dragging');
			if (tabsEl.hasPointerCapture(e.pointerId)) tabsEl.releasePointerCapture(e.pointerId);
			stopChase();
			const max = maxScroll();
			const reduce = prefersReducedMotion();
			if (at.x < 0 || at.x > max) {
				// Stretched past an end: springs back to it.
				spring = gsap.to(at, {
					x: gsap.utils.clamp(0, max, at.x),
					duration: reduce ? 0.2 : 0.7,
					ease: 'expo.out',
					onUpdate: apply
				});
			} else {
				const first = trail[0];
				const dt = (e.timeStamp - first.t) / 1000;
				// px/s, the scroll's way round: dragging left scrolls right.
				const velocity = dt > 0 ? -(e.clientX - first.x) / dt : 0;
				apply();
				if (reduce) gsap.to(tabsEl, { scrollLeft: settle(at.x), duration: 0.2 });
				else
					gsap.to(tabsEl, {
						// The glide's length follows the fling: 0.4s for a nudge, up to 1.4s.
						inertia: { scrollLeft: { velocity, end: settle, min: 0, max }, duration: { min: 0.4, max: 1.4 } },
						ease: 'expo.out'
					});
			}
			// The click this drag ends on still fires; it isn't a pick.
			requestAnimationFrame(() => (dragged = false));
		};
		tabsEl.addEventListener('pointerdown', down);
		tabsEl.addEventListener('pointermove', move);
		tabsEl.addEventListener('pointerup', up);
		tabsEl.addEventListener('pointercancel', up);
		return () => {
			tabsEl.removeEventListener('pointerdown', down);
			tabsEl.removeEventListener('pointermove', move);
			tabsEl.removeEventListener('pointerup', up);
			tabsEl.removeEventListener('pointercancel', up);
			gsap.killTweensOf(tabsEl);
			spring?.kill();
			stopChase();
		};
	}

	/**
	 * Which models may load. The opening one at once; each other only once
	 * the visitor heads for it: a feature on it is next to the open one, or
	 * its tab is pointed at or focused. Most visitors never open the later
	 * models, and they're megabytes each.
	 */
	const wanted = $state(
		untrack(() => Object.fromEntries(names.map((m) => [m, m === features[active].model])))
	) as Record<CadModel, boolean>;
	const want = (i: number) => {
		const m = features[i]?.model;
		if (m && !wanted[m]) wanted[m] = true;
	};
	$effect(() => {
		for (const i of [active - 1, active, active + 1]) want(i);
	});
	/** Wants the model of the tab under the pointer or focus. */
	function onTabIntent(e: Event) {
		const tab = (e.target as Element).closest('li');
		if (tab) want([...(e.currentTarget as Element).children].indexOf(tab));
	}
	const viewers: Partial<Record<CadModel, ModelViewer>> = $state({});
	/** The viewer on stage, for the render controls. */
	const viewer = $derived(typeof onStage === 'string' ? (viewers[onStage] ?? null) : null);
	// Dev only: the render tuning panel always, the energy tuning panel with
	// ?controls, the 3D's live readout and measuring runs (PerfHud) with ?perf.
	let showControls = $state(false);
	let showEnergyControls = $state(false);
	let showPerf = $state(false);
	const perfTarget: PerfTarget = {
		count: untrack(() => features.length),
		select: (i) => select(i),
		viewerFor: (i) => {
			const m = features[i]?.model;
			return m ? viewers[m] : undefined;
		},
		modelFor: (i) => features[i]?.model,
		viewers: () => Object.values(viewers).filter((v): v is ModelViewer => !!v),
		setPaused: (on) => (paused = on)
	};
	/**
	 * The energy along each model's pipes, and its tuning (EnergyControls):
	 * the panel tunes the model on stage, from that model's own settings.
	 */
	const trails: Partial<Record<CadModel, EnergyTrails>> = {};
	const tuning: Partial<Record<CadModel, { params: EnergyParams; look: TrailLook }>> = $state({});
	const tuned = $derived(typeof onStage === 'string' ? onStage : null);
	$effect(() => {
		for (const [model, t] of Object.entries(tuning) as [CadModel, { params: EnergyParams; look: TrailLook }][]) {
			const p = $state.snapshot(t.params);
			const look = $state.snapshot(t.look);
			trails[model]?.setParams(p);
			trails[model]?.setLook(look);
		}
	});

	/**
	 * The entrance: when the section's reveal fades the viewport in, the
	 * model on stage turns a quarter turn into place. If it isn't loaded
	 * yet, it turns in once it is. Grabbing it ends the turn there.
	 */
	const TURN_IN = { from: -Math.PI / 2, duration: 2.4, ease: 'power3.out' };
	let viewportEl: HTMLDivElement;
	let revealed = false;
	let turnedIn = false;
	let turnIn: gsap.core.Tween | null = null;
	$effect(() => {
		// `viewer` read first, so this re-runs as the model loads.
		const v = viewer;
		if (v && revealed && !turnedIn) spinIn(v);
	});
	function spinIn(v: ModelViewer) {
		turnedIn = true;
		turnIn = gsap.fromTo(v.userRotation, { y: TURN_IN.from }, { y: 0, duration: TURN_IN.duration, ease: TURN_IN.ease });
	}
	function onRevealed() {
		revealed = true;
		if (viewer && !turnedIn) spinIn(viewer);
	}

	onMount(() => {
		const undrag = dragStrip();
		edges();
		const resized = new ResizeObserver(edges);
		resized.observe(tabsEl);
		viewportEl.addEventListener('reveal', onRevealed, { once: true });
		const grab = () => {
			turnIn?.kill();
			holding = true;
			syncAutoplay();
		};
		const letGo = () => {
			holding = false;
			syncAutoplay();
		};
		viewportEl.addEventListener('pointerdown', grab);
		window.addEventListener('pointerup', letGo);
		window.addEventListener('pointercancel', letGo);
		const seenOnPage = new IntersectionObserver(([e]) => {
			inView = e.isIntersecting;
			syncAutoplay();
		});
		seenOnPage.observe(explorerEl);
		paused = prefersReducedMotion();
		if (dev) {
			const flags = new URLSearchParams(location.search);
			showControls = true;
			showEnergyControls = flags.has('controls');
			showPerf = flags.has('perf');
		}
		return () => {
			viewportEl.removeEventListener('reveal', onRevealed);
			viewportEl.removeEventListener('pointerdown', grab);
			window.removeEventListener('pointerup', letGo);
			window.removeEventListener('pointercancel', letGo);
			seenOnPage.disconnect();
			autoplay?.kill();
			turnIn?.kill();
			undrag();
			resized.disconnect();
		};
	});
</script>

<div class="explorer" bind:this={explorerEl}>
	<ol
		class="tabs"
		role="tablist"
		aria-label="Features"
		bind:this={tabsEl}
		onpointerover={onTabIntent}
		onfocusin={onTabIntent}
		onkeydown={onTabKey}
		onscroll={edges}
	>
		{#each features as feature, i (feature.title)}
			<FeatureTab
				index={i}
				title={feature.title}
				open={i === active}
				progress={i === active ? progress : 0}
				id={tabId(i)}
				controls={panelId}
				onselect={() => !dragged && select(i)}
			/>
		{/each}
	</ol>

	<div class="viewport" bind:this={viewportEl}>
		<!-- Every model stays mounted, so switching never reloads one; those
		     not on stage at the start wait hidden. -->
		{#each names as model (model)}
			<div class="layer stage" class:waiting={model !== opening} bind:this={stageEls[model]}>
				<CadStage
					src={models[model]!.files}
					carve={models[model]!.carve}
					colours={models[model]!.colours}
					sections={models[model]!.sections}
					trails={models[model]!.trails}
					aim={aims[model]}
					points={pointsOf(model)}
					look={looks[model]}
					explode={explodeOf(model)}
					paused={paused || !!features[active].still}
					hidden={onStage !== model}
					hold={!wanted[model]}
					onready={(v) => (viewers[model] = v)}
					ontrails={(t) => {
						trails[model] = t;
						tuning[model] = { params: { ...t.params }, look: { ...t.initialLook } };
					}}
				/>
			</div>
		{/each}
		{#each features as feature, i (feature.title)}
			{#if feature.panel}
				{@const p = feature.panel}
				<div class="layer panel" aria-hidden={i !== active} bind:this={panelEls[i]}>
					<div class="panel-image" style:aspect-ratio={p.image.ratio}>
						<Picture
							src={p.image.src}
							alt={p.image.alt}
							ratio={p.image.ratio}
							fit="contain"
							sizes="(max-width: 767px) 100vw, 50vw"
						/>
					</div>
					<div class="figure">
						<p class="value type-body-large">
							<svg class="mark" viewBox="0 0 10 9" aria-hidden="true"><path d="M5 0l5 9H0z" fill="currentColor" /></svg>
							{p.value}
						</p>
						<p class="detail-figure type-caption">{p.detail}</p>
						{#if p.graphic}<img class="graphic" src={p.graphic} alt="" />{/if}
					</div>
				</div>
			{/if}
		{/each}

		<div class="detail" role="tabpanel" id={panelId} aria-labelledby={tabId(active)} bind:this={detailEl}>
			<!-- The opening feature's words; each pick writes its own in (see `reveal`). -->
			<h3 class="detail-title type-body-large">{firstWords.title}</h3>
			<p class="detail-text type-caption">{firstWords.text}</p>
		</div>

		<!-- Under the model, centred on the panel's foot: on the model it's about, not the panel. -->
		{#if wip}<WipBadge label="3D model · WIP" corner="bottom" />{/if}

		<div class="pause">
			<PauseButton bind:paused label="Pause animation" tone="dark" />
		</div>
	</div>
</div>

{#if showPerf}
	<PerfHud {viewers} onStage={typeof onStage === 'string' ? onStage : null} target={perfTarget} />
{/if}

{#if showControls}
	<Controls {viewer} />
	{#if showEnergyControls && tuned && tuning[tuned]}
		{@const t = trails[tuned]!}
		<div class="energy-controls">
			<EnergyControls
				bind:params={tuning[tuned].params}
				bind:trail={tuning[tuned].look}
				defaults={{ params: t.params, trail: t.initialLook }}
			/>
		</div>
	{/if}
{/if}

<style>
	/* Beside the render controls' toggle, its panel opening up from there. */
	.energy-controls {
		position: fixed;
		right: calc(var(--grid-margin) + var(--toggle-size) + var(--space-8));
		bottom: var(--page-margin);
		z-index: 3;
	}

	/* The strip and the stage together fill the screen: the stage takes
	   whatever the strip leaves, a touch short so the panel's foot shows. */
	.explorer {
		grid-column: 1 / -1;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		/* Between the tabs, and down to the panel alike. */
		--gap: calc(var(--size-font) * 0.375);
		row-gap: var(--gap);
		/* The strip and panel together, a touch under a screen. */
		height: 88svh;
	}

	/* The strip: card tabs a little over a fifth of the row wide, so the last
	   ones run off the edge and the strip scrolls. It runs out to both screen
	   edges, padded back in so the first tab starts on the grid line: scrolled,
	   tabs slide off the screen's edge rather than being cut at the column's. */
	.tabs {
		--tab-width: calc(var(--size-font) * 21);
		position: relative;
		z-index: 1;
		display: flex;
		gap: var(--gap);
		margin: 0 calc(var(--grid-margin) * -1);
		padding: 0 var(--grid-margin);
		scroll-padding-inline: var(--grid-margin);
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		list-style: none;
	}
	/* A mouse drags it (the script settles it on a tab); touch swipes it
	   natively, settling on a tab. */
	@media (pointer: fine) {
		.tabs {
			cursor: grab;
		}
		.tabs:global(.dragging),
		.tabs:global(.dragging) :global(*) {
			cursor: grabbing;
		}
	}
	/* Stretched past an end by a drag (the script's --pull). */
	.tabs > :global(.tab) {
		translate: var(--pull, 0px) 0;
	}
	@media (pointer: coarse) {
		.tabs {
			scroll-snap-type: x proximity;
		}
	}
	/* Wider than the content column (--content-max), the screen's edges line
	   up with nothing: the strip stops where the panel does and fades out on
	   any side where tabs run on out of view, so it reads as scrolling rather
	   than cut. The script eases --fade-left and --fade-right. */
	@media screen and (min-width: 1921px) {
		.tabs {
			margin-inline: 0;
			padding-inline: 0;
			scroll-padding-inline: 0;
			mask-image: linear-gradient(
				to right,
				transparent,
				black var(--fade-left, 0px),
				black calc(100% - var(--fade-right, 0px)),
				transparent
			);
		}
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}

	/* The panel: a lifted card the model sits in, the feature in its top
	   corner, the pause in its bottom one. */
	.viewport {
		position: relative;
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--grey-950);
	}
	.detail {
		position: absolute;
		top: var(--space-64);
		left: var(--space-16);
		z-index: 1;
		width: calc(var(--size-font) * 20);
		pointer-events: none;
	}
	.detail-title,
	.detail-text {
		margin: 0;
	}
	.detail-text {
		margin-top: var(--space-16);
		color: var(--grey-400);
	}

	/* Each model and each panel fill the stage, stacked; GSAP fades between
	   them (see the script). Panels start hidden: the page opens on a model. */
	.layer {
		position: absolute;
		inset: 0;
	}
	.panel {
		opacity: 0;
		visibility: hidden;
	}

	/* A model not on stage at the start waits hidden, by opacity alone. */
	.stage.waiting {
		opacity: 0;
		pointer-events: none;
	}

	/* The cut-away whole, centred on the stage like the model. Its own
	   frame has room above the vessel, so it's set a little low. */
	.panel-image {
		position: absolute;
		top: 2%;
		left: 50%;
		height: 100%;
		translate: -50% 0;
	}
	.panel-image :global(.picture) {
		height: 100%;
	}

	/* The figure sits left of the image, a little below the middle. */
	.figure {
		position: absolute;
		top: 58%;
		left: 17%;
		display: grid;
		justify-items: start;
		gap: var(--space-4);
		color: var(--white);
	}
	.value,
	.detail-figure {
		margin: 0;
	}
	.value {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	/* The Antares triangle, at the figure's cap height. */
	.mark {
		width: 0.7em;
		height: auto;
	}
	.detail-figure {
		color: var(--button);
	}
	.graphic {
		display: block;
		width: calc(var(--size-font) * 4.5);
		margin-top: var(--space-24);
	}

	.pause {
		position: absolute;
		left: var(--space-16);
		bottom: var(--space-16);
		z-index: 1;
	}

	/* Phones: narrower tabs, still scrolling; the panel square, the
	feature over the model's top. */
	@media screen and (max-width: 767px) {
		.explorer {
			grid-template-rows: none;
			height: auto;
		}
		.tabs {
			--tab-width: calc(var(--size-font) * 14);
		}
		.viewport {
			height: auto;
			aspect-ratio: 3 / 4.4;
		}
		.detail {
			top: var(--space-16);
			width: auto;
			right: var(--space-16);
		}
		/* The model starts under the description, not behind it. */
		.layer {
			top: calc(var(--size-font) * 9);
		}
		/* No room beside the image: the figure takes the bottom corner. */
		.figure {
			top: auto;
			bottom: var(--space-64);
			left: var(--space-16);
		}
	}
</style>
