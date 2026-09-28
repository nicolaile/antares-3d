<!--
	@component
	The R1 power-conversion diagram with energy flowing through its pipes.

	Layers, bottom to top: the WebGL flow map (`FlowMapEnergy`) glowing along
	the pipe centrelines; the line art in three tiers of weight and tone, so
	the glow sits inside the pipes rather than over them; the labelled
	markers; the pause button.

	The first time it scrolls into view the lines draw themselves on, then
	the detail, markers and flow follow. Off-screen it stops. With reduced
	motion it is a still frame; without WebGL it is the drawing and markers.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import DiagramLabel from '$lib/components/DiagramLabel.svelte';
	import EnergyControls from '$lib/components/EnergyControls.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import { DEFAULT_LINE_WEIGHT, DEFAULT_PARAMS, sampleNetwork, type EnergyParams } from '$lib/energy/energy';
	import { FlowMapEnergy, MAX_BACKING } from '$lib/energy/FlowMapEnergy';
	import { centreline, walls } from '$lib/energy/pipes';
	import { CENTRES, DETAIL, FRAME, HATCH, HIDDEN, MARKERS, OUTLINES, PIPES, ROUTES, STRUCTURE } from '$lib/energy/r1';
	import { prefersReducedMotion } from '$lib/scroll';

	let { label }: { /** Accessible description of the diagram. */ label: string } = $props();

	/** Where the still frame sits: one pulse rising out of the core. */
	const STILL_HEAD = 700;
	/** Seconds from the start of the draw-on until the energy begins. */
	const FLOW_DELAY = 1.9;

	const uid = $props.id();

	/** Draw-on sweeps left to right, so each line waits by where it starts. */
	const delay = (d: string, offset: number) => {
		const x = parseFloat(d.slice(1));
		return `${(offset + (x / FRAME.width) * 0.9).toFixed(2)}s`;
	};
	const outlines = OUTLINES.map((d) => ({ d, delay: delay(d, 0) }));
	const structure = [...STRUCTURE, ...Object.values(PIPES).flatMap((p) => walls(p))].map((d) => ({
		d,
		delay: delay(d, 0.15)
	}));

	let params: EnergyParams = $state({ ...DEFAULT_PARAMS });
	let lineWeight = $state(DEFAULT_LINE_WEIGHT);
	let paused = $state(false);
	let dark = $state(false);
	// The tuning panel: on in dev, or with ?controls on any build.
	let showControls = $state(false);
	/** Motion allowed: false means a still frame and no pause button. */
	let moving = $state(false);
	/** Lines hidden, waiting to draw on. Only ever set from script. */
	let pending = $state(false);
	let revealed = $state(false);
	/** Draw-on finished: the dash tricks come off. */
	let settled = $state(false);

	let host: HTMLElement;
	let canvas: HTMLCanvasElement;
	/** Diagram units per CSS pixel, so line weights hold on screen at any size. */
	let unit = $state(FRAME.width / 800);

	onMount(() => {
		showControls = import.meta.env.DEV || new URLSearchParams(location.search).has('controls');
		moving = !prefersReducedMotion();
		pending = moving;

		const net = sampleNetwork(ROUTES.map(centreline), MARKERS);
		let flow: FlowMapEnergy | null = null;
		try {
			flow = new FlowMapEnergy(canvas, net, { frame: FRAME, dots: MARKERS });
		} catch {
			flow = null;
		}

		let head = moving ? 0 : STILL_HEAD;
		let time = 0;
		const draw = () => flow?.render(head, time, $state.snapshot(params) as EnergyParams, dark ? 'dark' : 'light');

		const fit = () => {
			const cw = host.clientWidth;
			if (!cw) return;
			unit = FRAME.width / cw;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const scale = Math.min(1, MAX_BACKING / (cw * dpr));
			flow?.resize(Math.round(cw * dpr * scale), Math.round(host.clientHeight * dpr * scale));
			draw();
		};
		const ro = new ResizeObserver(fit);
		ro.observe(host);

		let visible = false;
		let flowing = !moving;
		const io = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (pending && entry.intersectionRatio >= 0.35) {
					pending = false;
					revealed = true;
					setTimeout(() => (flowing = true), FLOW_DELAY * 1000);
					setTimeout(() => (settled = true), 3200);
				}
			},
			{ threshold: [0, 0.35] }
		);
		io.observe(host);

		let raf = 0;
		let last = performance.now();
		if (flow && moving) {
			raf = requestAnimationFrame(function tick(now) {
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;
				if (visible && flowing && !paused) {
					time += dt;
					head = (head + dt * params.speed) % net.total;
				}
				if (visible) draw();
				raf = requestAnimationFrame(tick);
			});
		}

		// A still frame has no loop to pick up control changes, so redraw on them.
		const stopParams = moving
			? () => {}
			: $effect.root(() => {
					$effect(() => {
						JSON.stringify(params);
						void dark;
						draw();
					});
				});

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			io.disconnect();
			stopParams();
			flow?.destroy();
		};
	});
</script>

<figure
	class="diagram"
	class:dark
	class:pending
	class:revealed
	class:settled
	bind:this={host}
	style:--unit={unit}
	style:--weight={lineWeight}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>

	<svg viewBox="0 0 {FRAME.width} {FRAME.height}" role="img" aria-label={label}>
		<defs>
			<pattern id="{uid}-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<line x1="0" y1="0" x2="0" y2="9" />
			</pattern>
			<pattern id="{uid}-winding" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-60)">
				<line x1="0" y1="0" x2="0" y2="4" />
			</pattern>
		</defs>
		<!-- Everything a section drawing adds once the parts are there: fades in after the draw-on. -->
		<g class="secondary">
			<g class="tone hatch">
				{#each HATCH as h, i (i)}
					<rect x={h.x} y={h.y} width={h.w} height={h.h} fill="url(#{uid}-{h.dense ? 'winding' : 'hatch'})" />
				{/each}
			</g>
			<g class="tone detail">
				{#each DETAIL as d, i (i)}<path {d} />{/each}
			</g>
			<g class="tone axes">
				{#each HIDDEN as d, i (i)}<path class="hidden" {d} />{/each}
				{#each CENTRES as d, i (i)}<path class="centre" {d} />{/each}
			</g>
		</g>
		<g class="tone structure">
			{#each structure as line, i (i)}<path d={line.d} pathLength="1" style:--delay={line.delay} />{/each}
		</g>
		<g class="tone outline">
			{#each outlines as line, i (i)}<path d={line.d} pathLength="1" style:--delay={line.delay} />{/each}
		</g>
	</svg>

	<div class="markers">
		{#each MARKERS as m, i (m.label)}
			<DiagramLabel label={m.label} x={m.x / FRAME.width} y={m.y / FRAME.height} order={i} />
		{/each}
	</div>

	<div class="tools">
		{#if showControls}
			<EnergyControls bind:params bind:lineWeight bind:dark />
		{/if}
		{#if moving}
			<IconButton
				label={paused ? 'Resume energy flow' : 'Pause energy flow'}
				pressed={paused}
				onclick={() => (paused = !paused)}
			>
				<svg viewBox="0 0 12 12" aria-hidden="true">
					{#if paused}
						<path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
					{:else}
						<rect x="3" y="2" width="2" height="8" fill="currentColor" />
						<rect x="7" y="2" width="2" height="8" fill="currentColor" />
					{/if}
				</svg>
			</IconButton>
		{/if}
	</div>
</figure>

<style>
	.diagram {
		--stage: var(--grey-100);
		/*
		 * One ink for every line; each tier is a group opacity of it. The grey
		 * scale jumps from 400 to 700, so tokens alone give two usable tones —
		 * this gives five, evenly spaced, and they re-derive on the dark stage.
		 * Opacity is per group, not per line, so joins never double up darker.
		 */
		--ink: var(--grey-950);
		--label-ink: var(--grey-950);
		--label-fill: var(--grey-0);
		/* Low-density screens: hairlines this fine blur to grey, so thicken. */
		--density: 1;
		position: relative;
		/* The frame's own proportion, so line art and canvas map 1:1. */
		aspect-ratio: 1930 / 1284;
		margin: 0;
		overflow: hidden;
		background: var(--stage);
		transition: background 0.4s ease;
	}
	@media (max-resolution: 1.5dppx) {
		.diagram {
			--density: 1.3;
		}
	}
	.diagram.dark {
		--stage: var(--grey-950);
		--ink: var(--grey-0);
		--label-ink: var(--grey-0);
		--label-fill: var(--grey-950);
	}

	.diagram > canvas,
	.diagram > svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	/* On dark, the energy adds light, like a real glow. */
	.dark > canvas {
		mix-blend-mode: plus-lighter;
	}

	/* Weights are CSS px on screen; --unit converts them to diagram units. */
	.diagram > svg :is(path, line) {
		fill: none;
		stroke-linejoin: round;
		transition: stroke 0.4s ease;
	}
	.tone {
		--w: calc(var(--unit) * var(--weight) * var(--density));
	}
	.tone :is(path, line) {
		stroke: var(--ink);
	}
	.outline {
		opacity: 0.5;
	}
	.outline path {
		stroke-width: calc(var(--w) * 1);
	}
	.structure {
		opacity: 0.38;
	}
	.structure path {
		stroke-width: calc(var(--w) * 0.8);
	}
	.detail {
		opacity: 0.3;
	}
	.detail path {
		stroke-width: calc(var(--w) * 0.7);
	}
	.axes {
		opacity: 0.26;
	}
	.axes path {
		stroke-width: calc(var(--w) * 0.7);
	}
	.hatch {
		opacity: 0.2;
	}
	/* Pattern content inherits from where the pattern is defined, not used. */
	pattern line {
		stroke: var(--ink);
		stroke-width: calc(var(--unit) * var(--weight) * var(--density) * 0.6);
	}
	.dark .outline {
		opacity: 0.55;
	}
	.hatch rect {
		stroke: none;
	}
	.hidden {
		stroke-dasharray: 7 5;
	}
	.centre {
		stroke-dasharray: 28 7 4 7;
	}

	/* Draw-on: each line is one dash of its own length, slid into place. */
	.pending :is(.outline, .structure) path {
		stroke-dasharray: 1 1;
		stroke-dashoffset: 1;
	}
	.revealed:not(.settled) :is(.outline, .structure) path {
		stroke-dasharray: 1 1;
		stroke-dashoffset: 0;
		transition: stroke-dashoffset 1.1s cubic-bezier(0.45, 0, 0.2, 1) var(--delay);
	}
	.pending .secondary,
	.pending > canvas,
	.pending .markers :global(.marker) {
		opacity: 0;
	}
	.revealed .secondary {
		transition: opacity 0.8s ease 1.1s;
	}
	.revealed > canvas {
		transition: opacity 1s ease 1.9s;
	}
	.pending .markers :global(.marker) {
		scale: 0.3;
	}
	.revealed .markers :global(.marker) {
		transition:
			opacity 0.35s ease,
			scale 0.45s cubic-bezier(0.3, 1.6, 0.5, 1);
		transition-delay: calc(1.5s + var(--order) * 70ms);
	}

	.markers {
		position: absolute;
		inset: 0;
	}

	.tools {
		position: absolute;
		right: var(--space-20);
		bottom: var(--space-20);
		display: flex;
		align-items: flex-end;
		gap: var(--space-8);
	}
	@media screen and (max-width: 767px) {
		.tools {
			right: var(--space-12);
			bottom: var(--space-12);
		}
	}
</style>
