<!--
	@component
	The features as a numbered strip of tabs (01–07) across the top, the
	open one widened to carry its title and description, and the CAD under
	it across the full width: each feature names the model it's shown on
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

	let {
		features,
		models
	}: {
		features: Feature[];
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

	function select(i: number) {
		if (i !== active) active = i;
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
		};
	});

</script>

<div class="explorer">
	<ol class="tabs" style:--count={features.length} onpointerover={onTabIntent} onfocusin={onTabIntent}>
		{#each features as feature, i (feature.title)}
			<FeatureTab index={i} title={feature.title} text={feature.text} open={i === active} onselect={() => select(i)} />
		{/each}
	</ol>

	<!-- Phones: the open feature under the strip, too narrow to sit in its tab. -->
	<p class="detail type-body-default">
		<span>{features[active].title}</span>
		<span class="detail-text">{features[active].text}</span>
	</p>

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
	   whatever the strip leaves. */
	.explorer {
		grid-column: 1 / -1;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100svh;
	}

	/* The strip: a hairline across the row, the tabs hung from it, 38px
	   tall at 1440 (a 22px badge, 8px clear above and below). Widths in the
	   strip's own units: a closed tab 5 base units (80px at 1440), the open
	   one four and a half of the page's columns (516px at 1440), room for
	   the longest title at 16px. */
	.tabs {
		--strip-height: calc(var(--size-font) * 2.375);
		--closed-width: calc(var(--size-font) * 5);
		--open-width: calc((100cqw - 11 * var(--grid-gutter)) / 12 * 4.5 + 4 * var(--grid-gutter));
		container-type: inline-size;
		position: relative;
		z-index: 1;
		display: flex;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--grey-775);
		list-style: none;
	}
	.detail {
		display: none;
	}

	/* The model framed in its middle, on the band itself. Its top edge
	   fades rather than cuts: what runs up under the strip and
	   the open tab's description melts into the band instead of stopping at a
	   line, and the text reads clear over it. */
	.viewport {
		position: relative;
		overflow: hidden;
		mask-image: linear-gradient(to bottom, transparent, black calc(var(--size-font) * 9));
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
		right: 0;
		bottom: var(--space-24);
	}

	/* Phones: the tabs share the row equally, numbers only, and the open
	   feature reads under them. */
	@media screen and (max-width: 767px) {
		.explorer {
			grid-template-rows: none;
			height: auto;
		}
		.tabs {
			--closed-width: calc(100cqw / var(--count));
			--open-width: var(--closed-width);
		}
		.tabs :global(.copy) {
			display: none;
		}
		.detail {
			display: grid;
			margin: var(--space-16) 0 0;
		}
		.detail-text {
			color: var(--grey-400);
		}
		.viewport {
			height: auto;
			aspect-ratio: 1;
		}
		/* No room beside the image: the figure takes the top corner. */
		.figure {
			top: 0;
			left: 0;
		}
		.pause {
			top: var(--space-24);
			bottom: auto;
		}
	}
</style>
