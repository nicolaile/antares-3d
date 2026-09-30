<!--
	@component
	The live 3D model on a dark stage (columns 5–12), with a numbered
	feature list beside it (1–4) that fills the stage's height: the open
	card stretches to take up what the closed ones leave. Selecting a
	feature moves the camera to that feature's shot. Nothing changes on its
	own: the reader picks. A ruler beside the model gives its height; the
	button pauses its slow turn. Place in a full-width `subgrid` cell.
-->
<script lang="ts" module>
	import type { Picture as PictureSource } from 'vite-imagetools';
	import type { Shot } from '$lib/three/shot';

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
		 * Shows the model while this feature is open, from this camera shot.
		 * Without one the model hides: the stage shows the feature's panel, or
		 * stays empty until it has one.
		 */
		shot?: Shot;
		/** The feature's own stage, in place of the model. */
		panel?: Panel;
	};
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import FeatureCard from '$lib/components/FeatureCard.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Scene from '$lib/components/Scene.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import type { ModelViewer } from '$lib/three/ModelViewer';
	import { gsap, ScrollTrigger, prefersReducedMotion } from '$lib/scroll';

	let {
		features,
		measure
	}: {
		features: Feature[];
		/** The ruler beside the model, e.g. `{ label: 'Measures', value: '2.5M/8.2ft' }`. */
		measure?: { label: string; value: string };
	} = $props();

	let active = $state(0);
	let paused = $state(false);
	/** The model only shows for features with a camera shot. */
	const modelShown = $derived(!!features[active].shot);
	/**
	 * The camera stays on the last shot while the model is hidden, so it
	 * doesn't swing about unseen and is already framed when the model returns.
	 */
	/** A plain three-quarter view, for a feature list with no shots at all. */
	const FALLBACK: Shot = { pos: [0, 0.7, 1.4], target: [0, 0, 0], spin: 0 };
	let shot = $state(untrack(() => features.find((f) => f.shot)?.shot) ?? FALLBACK);
	$effect(() => {
		const next = features[active].shot;
		if (next) shot = next;
	});

	/**
	 * What each feature puts on the stage: the model, its own panel, or
	 * nothing yet. A switch fades the outgoing view out (0.3s), then the
	 * incoming one in (0.3s) — never both at once. The model fades by
	 * opacity alone, never visibility: a hidden WebGL canvas can lose its
	 * last frame and flash empty on the way back.
	 */
	type View = 'model' | number | null;
	const viewOf = (i: number): View => (features[i].shot ? 'model' : features[i].panel ? i : null);
	let modelEl = $state<HTMLElement>();
	const panelEls: HTMLElement[] = $state([]);
	let showing: View = untrack(() => viewOf(active));
	let fade: gsap.core.Timeline | null = null;

	const layersOf = (v: View): HTMLElement[] =>
		v === 'model' ? [modelEl, ruler].filter((el): el is HTMLElement => !!el) : v === null ? [] : [panelEls[v]];
	const hideVars = (el: HTMLElement) =>
		el === modelEl ? { opacity: 0, pointerEvents: 'none' } : { autoAlpha: 0 };
	const showVars = (el: HTMLElement) =>
		el === modelEl ? { opacity: 1, pointerEvents: 'auto' } : { autoAlpha: 1 };

	$effect(() => {
		const next = viewOf(active);
		if (next === showing) return;
		showing = next;
		const incoming = layersOf(next);
		// Everything else goes, including a view left half-shown by a switch
		// cut short.
		const all: View[] = ['model', ...features.map((_, i) => (features[i].panel ? i : null))];
		const outgoing = all.flatMap((v) => layersOf(v)).filter((el) => !incoming.includes(el));
		const t = prefersReducedMotion() ? 0 : 0.3;
		fade?.kill();
		fade = gsap.timeline();
		for (const el of outgoing) fade.to(el, { ...hideVars(el), duration: t, ease: 'power1.in' }, 0);
		for (const el of incoming) fade.to(el, { ...showVars(el), duration: t, ease: 'power1.out' }, t);
	});

	function select(i: number) {
		if (i !== active) active = i;
	}
	let viewer: ModelViewer | null = $state(null);
	// The render tuning panel: on in dev, or with ?controls on any build.
	let showControls = $state(false);

	let ruler = $state<HTMLElement>();
	/** Draws the ruler on; built once mounted, unless motion is reduced. */
	let drawRuler: gsap.core.Timeline | null = null;
	/** The ruler has had its first reveal, so returning to the model replays it. */
	let rulerRevealed = false;

	onMount(() => {
		paused = prefersReducedMotion();
		showControls = import.meta.env.DEV || new URLSearchParams(location.search).has('controls');
		if (!ruler || prefersReducedMotion()) return;

		// The ruler draws itself on: the top rule across, left to right, then
		// the scale down its side, ticks appearing as it goes, while the label
		// and value fade up. Clipped rather than scaled, so the ticks never
		// stretch.
		const q = (sel: string) => ruler!.querySelector(sel);
		const ctx = gsap.context(() => {
			drawRuler = gsap
				.timeline({ paused: true })
				.fromTo(
					q('.ruler-top'),
					{ clipPath: 'inset(0 100% 0 0)' },
					{ clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'power2.inOut' },
					0
				)
				.fromTo(
					q('.ruler-scale'),
					{ clipPath: 'inset(0 0 100% 0)' },
					{ clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'power2.inOut' },
					0.25
				)
				.fromTo(
					[q('.ruler-label'), q('.ruler-value')],
					{ autoAlpha: 0, y: 6 },
					{ autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' },
					0.35
				);
			ScrollTrigger.create({
				trigger: ruler,
				start: 'top 80%',
				once: true,
				onEnter: () => {
					rulerRevealed = true;
					if (modelShown) drawRuler?.restart();
				}
			});
		});
		return () => {
			ctx.revert();
			drawRuler = null;
		};
	});

	// Back on the model: redraw, once the outgoing view has faded (0.3s).
	let replay: gsap.core.Tween | null = null;
	$effect(() => {
		const shown = modelShown;
		replay?.kill();
		if (!drawRuler || !rulerRevealed) return;
		if (shown) {
			drawRuler.pause(0);
			replay = gsap.delayedCall(0.3, () => drawRuler?.play());
		}
	});

</script>

<div class="explorer" style:--closed-count={features.length - 1}>
	<Cell span={4} tablet={{ span: 5 }}>
		<ol class="list">
			{#each features as feature, i (feature.title)}
				<FeatureCard
					index={i}
					title={feature.title}
					text={feature.text}
					open={i === active}
					onselect={() => select(i)}
				/>
			{/each}
		</ol>
	</Cell>

	<Cell start={5} span={8} tablet={{ start: 6, span: 7 }} self="stretch">
		<div class="viewport">
			<!-- The model stays mounted under a panel, so it never reloads. -->
			<div class="layer model" bind:this={modelEl}>
				<Scene {shot} paused={paused || !modelShown} onready={(v) => (viewer = v)} />
			</div>
			{#each features as feature, i (feature.title)}
				{#if feature.panel}
					{@const p = feature.panel}
					<div class="layer panel" aria-hidden={i !== active} bind:this={panelEls[i]}>
						<div class="panel-image" style:aspect-ratio={p.image.ratio}>
							<Picture src={p.image.src} alt={p.image.alt} ratio={p.image.ratio} fit="contain" sizes="(max-width: 767px) 100vw, 50vw" />
						</div>
						<div class="figure">
							<p class="value type-body">
								<svg class="mark" viewBox="0 0 10 9" aria-hidden="true"><path d="M5 0l5 9H0z" fill="currentColor" /></svg>
								{p.value}
							</p>
							<p class="detail type-caption">{p.detail}</p>
							{#if p.graphic}<img class="graphic" src={p.graphic} alt="" />{/if}
						</div>
					</div>
				{/if}
			{/each}
			{#if measure}
				<div class="ruler type-annotation" aria-hidden="true" bind:this={ruler}>
					<span class="ruler-label">{measure.label}</span>
					<span class="ruler-top"></span>
					<span class="ruler-value">{measure.value}</span>
					<span class="ruler-scale"></span>
				</div>
			{/if}
		</div>
	</Cell>

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

{#if showControls}
	<Controls {viewer} />
{/if}

<style>
	/* 673px tall at 1440, capped to the screen. The list and the stage share
	   this height; the open card takes what the closed ones leave. */
	.explorer {
		--stage-height: min(calc(var(--size-font) * 42), calc(100svh - var(--page-margin) * 2));
		--list-gap: var(--space-4);
		--open-height: calc(
			var(--stage-height) - var(--closed-count) * (var(--size-font) * 6 + var(--list-gap))
		);
		position: relative;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: stretch;
		height: var(--stage-height);
	}

	.list {
		display: grid;
		align-content: start;
		gap: var(--list-gap);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.viewport {
		position: relative;
		height: 100%;
		overflow: hidden;
		border-radius: var(--stage-radius);
		background: var(--grey-800);
	}
	/* The model and each panel fill the stage, stacked; GSAP fades between
	   them (see the script). Panels start hidden: the page opens on the
	   model. */
	.layer {
		position: absolute;
		inset: 0;
	}
	.panel {
		opacity: 0;
		visibility: hidden;
	}

	/* The cut-away bleeds off the right and bottom edges: 155% of the stage's
	   height, its left edge 42% across, so the vessel's top half fills the
	   right of the panel. */
	.panel-image {
		position: absolute;
		top: 2%;
		left: 42%;
		height: 155%;
	}
	.panel-image :global(.picture) {
		height: 100%;
	}

	/* The figure sits left of the image, a little below the middle. */
	.figure {
		position: absolute;
		top: 58%;
		left: 30%;
		display: grid;
		justify-items: start;
		gap: var(--space-4);
		color: var(--grey-0);
	}
	.value,
	.detail {
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
	.detail {
		color: var(--grey-300);
	}
	.graphic {
		display: block;
		width: calc(var(--size-font) * 4.5);
		margin-top: var(--space-20);
	}

	/* The poster is a render on the old light stage; on dark it would show as
	   a pale box while the model loads. The canvas fades in on its own.
	   Recapture it on grey-800 to bring it back. */
	.viewport :global(.poster) {
		display: none;
	}

	/* The model's height, drawn beside it. The ruler itself is a zero-width
	   line at 74% across the stage; everything hangs off it: the label to
	   its left, a rule across its top out to the value, and the scale down
	   its left side with a tick every fifth of the way. Placed for the
	   opening shot. */
	.ruler {
		--tick: var(--space-12);
		--mid: calc(var(--type-annotation-size) * var(--type-annotation-leading) / 2);
		position: absolute;
		top: 12%;
		bottom: 11%;
		left: 74%;
		width: 0;
		color: var(--grey-0);
		pointer-events: none;
	}
	.ruler-label,
	.ruler-value {
		position: absolute;
		top: 0;
		white-space: nowrap;
	}
	.ruler-label {
		right: calc(var(--tick) * 2);
		color: var(--grey-400);
	}
	.ruler-value {
		left: calc(var(--tick) * 4.5);
	}
	.ruler-top {
		position: absolute;
		top: var(--mid);
		left: calc(var(--tick) * -1);
		width: calc(var(--tick) * 5);
		border-top: 1px solid var(--grey-400);
	}
	.ruler-scale {
		position: absolute;
		top: var(--mid);
		bottom: 0;
		right: 0;
		width: var(--tick);
		border-right: 1px solid var(--grey-400);
		border-bottom: 1px solid var(--grey-400);
		background: repeating-linear-gradient(
			to bottom,
			transparent 0 calc(100% / 5 - 1px),
			var(--grey-400) calc(100% / 5 - 1px) calc(100% / 5)
		);
	}

	.pause {
		position: absolute;
		right: var(--space-20);
		bottom: var(--space-20);
	}

	/* Phones: the model on top, the list under it, at its own height. */
	@media screen and (max-width: 767px) {
		.explorer {
			--open-height: auto;
			height: auto;
			row-gap: var(--space-20);
		}
		.explorer > :global(:first-child) {
			grid-row: 2;
		}
		.viewport {
			aspect-ratio: 1;
		}
		.ruler {
			display: none;
		}
		.pause {
			top: var(--space-20);
			bottom: auto;
		}
	}
</style>
