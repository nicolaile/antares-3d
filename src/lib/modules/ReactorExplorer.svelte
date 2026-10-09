<!--
	@component
	The features as a strip of numbered card tabs across the top, scrolling
	sideways when they overflow, and under it a panel with the open
	feature's title and description in its corner, a scale rule beside the
	model, and arrows to step through the features. The CAD fills the panel: each feature names the model it's shown on
	(Mark-0 for the reactor, the power conversion system after), and the
	stage cuts between them, one model at a time. Each feature has its
	point on its model (cadPoints.ts, unmarked), and the model turns to
	show the open one. Selecting a feature moves the camera
	to its shot. Nothing changes on its own: the reader picks. The button
	pauses the model's slow turn. Place in a full-width `subgrid` cell.
-->
<script lang="ts" module>
	import type { Picture as PictureSource } from 'vite-imagetools';
	import type { Shot } from '$lib/three/shot';
	import type { CadLabel } from '$lib/three/cadPoints';
	import type { TrailSet } from '$lib/three/EnergyTrails';
	import type { Look } from '$lib/components/CadStage.svelte';

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
		/**
		 * Where the camera goes while this feature is open. Without one it
		 * stays on the last shot.
		 */
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

	/**
	 * A model on the stage: its files (its groups under
	 * static/models/cad/web/), and any parts carved into groups of their own
	 * and cut in half-section (ModelViewer's `carve` and `sections`).
	 */
	export type CadModelSetup = {
		files: string[];
		carve?: Record<string, { from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }>;
		sections?: Record<string, { at: [number, number, number]; along: [number, number, number]; radius: number }>;
		/** Pipes energy can run along, where a feature's look turns it on (CadStage's `trails`). */
		trails?: TrailSet;
	};
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import FeatureTab from '$lib/components/FeatureTab.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import CadStage from '$lib/components/CadStage.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import EnergyControls from '$lib/components/EnergyControls.svelte';
	import type { EnergyParams, TrailLook } from '$lib/energy/energy';
	import type { EnergyTrails } from '$lib/three/EnergyTrails';
	import type { ModelViewer } from '$lib/three/ModelViewer';
	import { CAD_POINTS } from '$lib/three/cadPoints';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import { InertiaPlugin } from 'gsap/InertiaPlugin';
	import { SplitText } from 'gsap/SplitText';
	import chevronLeft from '$lib/assets/icons/chevron-left.svg?raw';
	import chevronRight from '$lib/assets/icons/chevron-right.svg?raw';

	let {
		features,
		models,
		scale
	}: {
		features: Feature[];
		/** The scale rule's label beside the model, e.g. its height. */
		scale?: string;
		/** Each model's files and setup. */
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

	/**
	 * Each model's camera: the shot of the last feature on it that had one,
	 * so it holds still while another model is up and is framed on return.
	 */
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

	/** Each model's look, likewise: the last feature on it sets it. */
	const looks = $state(untrack(() => Object.fromEntries(names.map((m) => [m, {}]))) as Record<CadModel, Look>);
	/**
	 * What each model's stage frames (CadStage's `aim`): its camera, the shot
	 * of the last feature on it that had one, so it holds still while another
	 * model is up and is framed on return; the open point; and how long the
	 * stage waits to be seen, the hand-off (HANDOFF) when it's coming in from
	 * another model, else 0. Set as one, so they always change together.
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
	 * What each feature puts on the stage: its own panel, or its model. A
	 * switch fades the outgoing view out, then after a beat the incoming one
	 * in (HANDOFF) — never both at once. Models fade by opacity alone, never
	 * visibility: a hidden WebGL canvas can lose its last frame and flash
	 * empty on the way back.
	 */
	/**
	 * The hand-off between views, seconds: the outgoing one fades out over
	 * `out`, then after a beat the incoming one fades in from `in`, so the
	 * two never show at once.
	 */
	const HANDOFF = { out: 0.4, in: 0.55 };

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
	 * The open feature's title and description, in the panel's corner. A
	 * pick fades the old words away quickly, then the new ones come in line
	 * by line: each rises a little as it fades up, the title first, the
	 * description's lines just after, so the text settles rather than
	 * appears. Picked again mid-change, the change
	 * under way gives way to the new one.
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

	/** Arrow keys step along the strip, focus following the open tab. */
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
	 * settles with a tab's edge on the grid line. A drag never picks the tab
	 * it ends on. Touch keeps the browser's own swipe, which already feels
	 * right there. (Draggable's scroll mode wraps the tabs in a div of its
	 * own, which the strip's layout and Svelte both need not to happen.)
	 * Returns the cleanup.
	 */
	function dragStrip() {
		if (!matchMedia('(pointer: fine)').matches) return () => {};
		gsap.registerPlugin(InertiaPlugin);
		/** Where the nearest tab edge is to scroll position `x` (or the strip's end). */
		const settle = (x: number) => {
			const stops = [...features.keys()].map(scrollTo).filter((s) => s < maxScroll()).concat(maxScroll());
			return stops.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
		};
		let from: { x: number; scroll: number } | null = null;
		/** The last few moves, for the speed it's let go at. */
		let trail: { x: number; t: number }[] = [];
		const down = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse' || e.button !== 0) return;
			gsap.killTweensOf(tabsEl);
			from = { x: e.clientX, scroll: tabsEl.scrollLeft };
			trail = [{ x: e.clientX, t: e.timeStamp }];
		};
		const move = (e: PointerEvent) => {
			if (!from) return;
			const dx = e.clientX - from.x;
			if (!dragged && Math.abs(dx) < 6) return;
			if (!dragged) {
				dragged = true;
				tabsEl.setPointerCapture(e.pointerId);
				tabsEl.classList.add('dragging');
			}
			tabsEl.scrollLeft = from.scroll - dx;
			trail = [...trail, { x: e.clientX, t: e.timeStamp }].filter((p) => e.timeStamp - p.t < 100);
		};
		const up = (e: PointerEvent) => {
			if (!from) return;
			from = null;
			if (!dragged) return;
			tabsEl.classList.remove('dragging');
			if (tabsEl.hasPointerCapture(e.pointerId)) tabsEl.releasePointerCapture(e.pointerId);
			const first = trail[0];
			const dt = (e.timeStamp - first.t) / 1000;
			// px/s, the scroll's way round: dragging left scrolls right.
			const velocity = dt > 0 ? -(e.clientX - first.x) / dt : 0;
			if (prefersReducedMotion()) gsap.to(tabsEl, { scrollLeft: settle(tabsEl.scrollLeft), duration: 0.2 });
			else
				gsap.to(tabsEl, {
					// The glide's length follows the fling: 0.4s for a nudge, up to 1.4s.
					inertia: { scrollLeft: { velocity, end: settle, min: 0, max: maxScroll() }, duration: { min: 0.4, max: 1.4 } },
					ease: 'expo.out'
				});
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
		};
	}

	/**
	 * Which models may load. The opening one at once; each other only once
	 * the visitor heads for it: a feature on it is next to the open one, or
	 * its tab is pointed at or focused. Most visitors never open the later
	 * models, and they're megabytes each.
	 */
	const wanted = $state(untrack(() => Object.fromEntries(names.map((m) => [m, m === features[active].model])))) as Record<
		CadModel,
		boolean
	>;
	const want = (i: number) => {
		const m = features[i]?.model;
		if (m && !wanted[m]) wanted[m] = true;
	};
	$effect(() => {
		for (const i of [active - 1, active, active + 1]) want(i);
	});
	/** The tab under the pointer or focus, by its place in the strip. */
	function onTabIntent(e: Event) {
		const tab = (e.target as Element).closest('li');
		if (tab) want([...(e.currentTarget as Element).children].indexOf(tab));
	}
	/** The viewer on stage, for the render controls. */
	const viewers: Partial<Record<CadModel, ModelViewer>> = $state({});
	const viewer = $derived(typeof onStage === 'string' ? (viewers[onStage] ?? null) : null);
	// The render tuning panel: on in dev, or with ?controls on any build.
	let showControls = $state(false);
	// The energy tuning panel: hidden for now, ?controls only.
	let showEnergyControls = $state(false);
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
	/** The section has come into view: the rule waits for it before drawing. */
	let seen = $state(false);
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
		seen = true;
		if (viewer && !turnedIn) spinIn(viewer);
	}

	/**
	 * The scale rule frames the reactor's height on the first feature only.
	 * Coming in, its line draws down from the top, ticks and all, and the
	 * label fades up beside the top once the line is under way; leaving, it
	 * fades. It waits for the section to come into view, and for the model
	 * to be back on stage when returning from another one.
	 */
	const RULE_ON = 0;
	let ruleEl = $state<HTMLDivElement>();
	let ruleLabelEl = $state<HTMLSpanElement>();
	let ruleTl: gsap.core.Timeline | null = null;
	let ruleShown = false;
	$effect(() => {
		const show = seen && active === RULE_ON;
		const el = ruleEl;
		const label = ruleLabelEl;
		if (!el || !label) return;
		untrack(() => {
			// Clipped from the bottom up; open above and to the right so the
			// label, which sits across the top edge, isn't cut.
			const shut = 'inset(-50% -100vw 100% -50%)';
			const open = 'inset(-50% -100vw 0% -50%)';
			if (ruleTl === null && !ruleShown && !show) {
				gsap.set(el, { autoAlpha: 0, clipPath: shut });
				return;
			}
			if (show === ruleShown) return;
			ruleShown = show;
			ruleTl?.kill();
			const reduce = prefersReducedMotion();
			if (show) {
				ruleTl = gsap
					.timeline({ delay: reduce ? 0 : HANDOFF.in })
					.set(el, { autoAlpha: 1, clipPath: reduce ? open : shut })
					.set(label, { autoAlpha: 0, y: reduce ? 0 : 6 })
					.to(el, { clipPath: open, duration: reduce ? 0 : 1.1, ease: 'power3.inOut' }, 0)
					.to(label, { autoAlpha: 1, y: 0, duration: reduce ? 0.2 : 0.6, ease: 'power3.out' }, reduce ? 0 : 0.45);
			} else {
				ruleTl = gsap.timeline().to(el, { autoAlpha: 0, duration: 0.25, ease: 'power1.in' }).set(el, { clipPath: shut });
			}
		});
	});

	onMount(() => {
		const undrag = dragStrip();
		viewportEl.addEventListener('reveal', onRevealed, { once: true });
		const grab = () => turnIn?.kill();
		viewportEl.addEventListener('pointerdown', grab);
		paused = prefersReducedMotion();
		showControls = import.meta.env.DEV || new URLSearchParams(location.search).has('controls');
		showEnergyControls = new URLSearchParams(location.search).has('controls');
		return () => {
			viewportEl.removeEventListener('reveal', onRevealed);
			viewportEl.removeEventListener('pointerdown', grab);
			turnIn?.kill();
			undrag();
		};
	});

</script>

<div class="explorer">
	<ol class="tabs" bind:this={tabsEl} onpointerover={onTabIntent} onfocusin={onTabIntent} onkeydown={onTabKey}>
		{#each features as feature, i (feature.title)}
			<FeatureTab index={i} title={feature.title} open={i === active} onselect={() => !dragged && select(i)} />
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
						<Picture src={p.image.src} alt={p.image.alt} ratio={p.image.ratio} fit="contain" sizes="(max-width: 767px) 100vw, 50vw" />
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

		<div class="detail" bind:this={detailEl}>
			<!-- The opening feature's words; each pick writes its own in (see `reveal`). -->
			<h3 class="detail-title type-body-default">{firstWords.title}</h3>
			<p class="detail-text type-caption">{firstWords.text}</p>
		</div>

		{#if scale}
			<div class="rule" aria-hidden="true" bind:this={ruleEl}>
				<span class="rule-label type-caption" bind:this={ruleLabelEl}>{scale}</span>
			</div>
		{/if}

		<div class="steps">
			<button type="button" class="step" aria-label="Previous feature" onclick={() => step(-1)}>{@html chevronLeft}</button>
			<button type="button" class="step" aria-label="Next feature" onclick={() => step(1)}>{@html chevronRight}</button>
		</div>

		<div class="pause" data-tool>
			<IconButton label={paused ? 'Resume rotation' : 'Pause rotation'} pressed={paused} onclick={() => (paused = !paused)}>
				<svg viewBox="0 0 12 12" aria-hidden="true">
					{#if paused}
						<path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
					{:else}
						<rect x="3" y="2" width="2" height="8" fill="currentColor" />
						<rect x="7" y="2" width="2" height="8" fill="currentColor" />
					{/if}
				</svg>
			</IconButton>
		</div>
	</div>
</div>

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
		/* 6px at 1440, between the tabs and down to the panel alike. */
		--gap: calc(var(--size-font) * 0.375);
		row-gap: var(--gap);
		height: 92svh;
	}

	/* The strip: card tabs a little over a fifth of the row wide (335px at
	   1440), so the last ones run off the edge and the strip scrolls. It
	   runs out to both edges of the screen, padded back in so the first tab
	   starts on the grid line: scrolled, the tabs slide off the screen's
	   edge rather than being cut at the column's. */
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
	@media (pointer: coarse) {
		.tabs {
			scroll-snap-type: x proximity;
		}
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}

	/* The panel: a lifted card the model sits in, the feature in its top
	   corner, the steps in its bottom one. */
	.viewport {
		position: relative;
		overflow: hidden;
		border-radius: var(--stage-radius);
		background: var(--grey-825);
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

	/* The scale rule, right of the model: a vertical hairline with ticks
	   and its label at the top, framing the vessel's height. */
	.rule {
		--tick: calc(var(--size-font) * 0.625);
		position: absolute;
		top: 15%;
		bottom: 15%;
		left: 67%;
		width: var(--tick);
		border-left: 1px solid var(--grey-500);
		background: repeating-linear-gradient(to bottom, var(--grey-500) 0 1px, transparent 1px 20%) left / var(--tick) calc(100% + 1px) no-repeat;
		pointer-events: none;
	}
	.rule::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: calc(var(--size-font) * 3);
		border-top: 1px solid var(--grey-500);
	}
	.rule::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: var(--tick);
		border-top: 1px solid var(--grey-500);
	}
	.rule-label {
		position: absolute;
		top: 0;
		left: calc(var(--size-font) * 3.5);
		translate: 0 -50%;
		color: var(--grey-300);
		white-space: nowrap;
	}

	.steps {
		position: absolute;
		left: var(--space-16);
		bottom: var(--space-16);
		z-index: 1;
		display: flex;
		gap: var(--space-8);
	}
	.step {
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 1.5);
		height: calc(var(--size-font) * 1.5);
		padding: 0;
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--grey-775);
		color: var(--grey-0);
		cursor: pointer;
		transition: background 0.25s ease;
	}
	.step:hover {
		background: var(--grey-750);
	}
	.step:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: 2px;
	}
	.step :global(svg) {
		width: calc(var(--size-font) * 0.875);
		height: auto;
	}
	.step :global(path) {
		stroke: currentColor;
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
		color: var(--grey-0);
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
		color: var(--grey-300);
	}
	.graphic {
		display: block;
		width: calc(var(--size-font) * 4.5);
		margin-top: var(--space-24);
	}

	.pause {
		position: absolute;
		right: var(--space-16);
		bottom: var(--space-16);
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
		.rule {
			display: none;
		}
		/* No room beside the image: the figure takes the bottom corner. */
		.figure {
			top: auto;
			bottom: var(--space-64);
			left: var(--space-16);
		}
	}
</style>
