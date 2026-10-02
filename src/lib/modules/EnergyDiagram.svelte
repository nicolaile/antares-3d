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
	import { onMount, untrack } from 'svelte';
	import DiagramLabel from '$lib/components/DiagramLabel.svelte';
	import EnergyControls from '$lib/components/EnergyControls.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import {
		DEFAULT_LINE_WEIGHT,
		DEFAULT_PARAMS,
		DEFAULT_TONES,
		cloneTones,
		dotFlares,
		sampleNetwork,
		type EnergyParams
	} from '$lib/energy/energy';
	import { FlowMapEnergy, MAX_BACKING } from '$lib/energy/FlowMapEnergy';
	import { centreline, walls } from '$lib/energy/pipes';
	import {
		CENTRES,
		DETAIL,
		FRAME,
		HATCH,
		HIDDEN,
		MARKERS,
		OUTLINES,
		PIPES,
		ROUTE_TEMPS,
		ROUTES,
		STRUCTURE
	} from '$lib/energy/r1';
	import { prefersReducedMotion } from '$lib/scroll';

	let {
		label,
		dark: startDark = false
	}: {
		/** Accessible description of the diagram. */
		label: string;
		/** Starts on the dark stage, for dark sections. The controls can still flip it. */
		dark?: boolean;
	} = $props();

	/** Where the still frame sits: one pulse rising out of the core. */
	const STILL_HEAD = 700;
	/** Seconds from the start of the draw-on until the energy begins. */
	const FLOW_DELAY = 1.9;

	const uid = $props.id();

	/** Draw-on sweeps left to right, so each line waits by where it starts. */
	const delay = (d: string, offset: number) => {
		const x = parseFloat(d.slice(1));
		return `${(offset + ((x - FRAME.x) / FRAME.width) * 0.9).toFixed(2)}s`;
	};
	const outlines = OUTLINES.map((d) => ({ d, delay: delay(d, 0) }));
	const structure = [...STRUCTURE, ...Object.values(PIPES).flatMap((p) => walls(p))].map((d) => ({
		d,
		delay: delay(d, 0.15)
	}));

	let params: EnergyParams = $state({ ...DEFAULT_PARAMS });
	let lineWeight = $state(DEFAULT_LINE_WEIGHT);
	let tones = $state(cloneTones(DEFAULT_TONES));
	/** Per-tier opacity, and colour where one overrides the ink. */
	const toneStyle = $derived(
		Object.entries(tones)
			.map(([k, t]) => `--o-${k}: ${t.opacity};` + (t.color ? ` --c-${k}: ${t.color};` : ''))
			.join(' ')
	);
	/** The ink token as it resolves right now, so the colour pickers start from it. */
	let ink = $state('');
	let paused = $state(false);
	let dark = $state(untrack(() => startDark));
	// The tuning panel: on in dev, or with ?controls on any build.
	let showControls = $state(false);
	/** Motion allowed: false means a still frame and no pause button. */
	let moving = $state(false);
	/** Lines hidden, waiting to draw on. Only ever set from script. */
	let pending = $state(false);
	let revealed = $state(false);
	/** Draw-on finished: the dash tricks come off. */
	let settled = $state(false);
	/** The marker being hovered or focused. */
	let active = $state<number | null>(null);
	/**
	 * Hovering a marker spotlights its part: the rest of the drawing and the
	 * other markers dim. Off for now — the marker's own label still opens.
	 * Flip to true to bring the spotlight back.
	 */
	const SPOTLIGHT = false;
	const spot = $derived(SPOTLIGHT ? active : null);
	const focusPipes = MARKERS.map((m) => m.focus.pipes.map((k) => centreline(PIPES[k])));
	/** Holes are padded so a part's own outline never sits at the veil's edge. */
	const PAD = 18;

	let host: HTMLElement;
	let markersEl: HTMLElement;
	let canvas: HTMLCanvasElement;
	/** Diagram units per CSS pixel, so line weights hold on screen at any size. */
	let unit = $state(FRAME.width / 800);
	/**
	 * Line weights hold in screen pixels, so a small diagram would carry the
	 * same ink in far less room and read heavy, a huge one faint. This leans
	 * them gently with the diagram's width — the square root of its size
	 * against the desktop layout, held to 0.8–1.2 — so the drawing keeps the
	 * same density everywhere while the lines stay hairlines.
	 */
	let fitWeight = $state(1);
	const DESKTOP_WIDTH = 880;

	onMount(() => {
		showControls = import.meta.env.DEV || new URLSearchParams(location.search).has('controls');
		const readInk = () => (ink = getComputedStyle(host).getPropertyValue('--ink').trim());
		readInk();
		const stopInk = $effect.root(() => {
			$effect(() => {
				void dark;
				// After the class lands, so the dark ink resolves.
				queueMicrotask(readInk);
			});
		});
		moving = !prefersReducedMotion();
		pending = moving;

		const net = sampleNetwork(ROUTES.map(centreline), Object.values(PIPES).map(centreline), MARKERS);
		let flow: FlowMapEnergy | null = null;
		try {
			flow = new FlowMapEnergy(canvas, net, { frame: FRAME, dots: MARKERS, temps: ROUTE_TEMPS });
		} catch {
			flow = null;
		}

		let head = moving ? 0 : STILL_HEAD;
		let time = 0;
		// One plain copy of the settings, refreshed only when they change —
		// not a fresh snapshot every frame.
		let look = $state.snapshot(params) as EnergyParams;
		let theme: 'light' | 'dark' = 'light';
		/** Something on screen changed since the last draw. */
		let dirty = true;
		// Each marker lights up as a pulse passes through it: the same flare
		// the canvas draws behind it, handed to the marker as --lit (0..1).
		const flares = new Float32Array(MARKERS.length);
		const lightMarkers = () => {
			dotFlares(net, look, head, flares);
			const els = markersEl?.children;
			if (!els) return;
			for (let i = 0; i < els.length && i < flares.length; i++) {
				(els[i] as HTMLElement).style.setProperty('--lit', flares[i].toFixed(3));
			}
		};
		const draw = () => {
			flow?.render(head, time, look, theme);
			lightMarkers();
			dirty = false;
		};

		// Dev-only handle for tuning from the console, e.g. park a pulse:
		// __energy.paused = true; __energy.head = 900
		if (import.meta.env.DEV) {
			(window as unknown as Record<string, unknown>).__energy = {
				get head() {
					return head;
				},
				set head(v: number) {
					head = v;
					dirty = true;
				},
				set paused(v: boolean) {
					paused = v;
				},
				total: net.total
			};
		}

		const fit = () => {
			const cw = host.clientWidth;
			if (!cw) return;
			unit = FRAME.width / cw;
			fitWeight = Math.min(1.2, Math.max(0.8, Math.sqrt(cw / DESKTOP_WIDTH)));
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

		// Draw only when something moved, and at most 60 times a second: a
		// 120Hz screen gains nothing at this speed, and a paused diagram
		// costs nothing at all.
		const FRAME_MS = 1000 / 60 - 1;
		let raf = 0;
		let last = performance.now();
		let lastDraw = 0;
		if (flow && moving) {
			raf = requestAnimationFrame(function tick(now) {
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;
				if (visible && flowing && !paused) {
					time += dt;
					head = (head + dt * look.speed) % net.total;
					dirty = true;
				}
				if (visible && dirty && now - lastDraw >= FRAME_MS) {
					draw();
					lastDraw = now;
				}
				raf = requestAnimationFrame(tick);
			});
		}

		// Settings and theme: refresh the copy and redraw. Covers the still
		// frame too, which has no loop of its own.
		const stopParams = $effect.root(() => {
			$effect(() => {
				void JSON.stringify(params); // track every field
				look = $state.snapshot(params) as EnergyParams;
				theme = dark ? 'dark' : 'light';
				dirty = true;
				if (!moving) draw();
			});
		});

		return () => {
			stopInk();
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
	style={toneStyle}
	style:--unit={unit}
	style:--fit-weight={fitWeight}
	style:--weight={lineWeight}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>

	<svg viewBox="{FRAME.x} {FRAME.y} {FRAME.width} {FRAME.height}" role="img" aria-label={label}>
		<defs>
			<pattern id="{uid}-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<line x1="0" y1="0" x2="0" y2="9" />
			</pattern>
			<!-- The spotlight holes are blurred so a lit part fades into the dimmed rest. -->
			<filter id="{uid}-soft" x="-10%" y="-10%" width="120%" height="120%">
				<feGaussianBlur stdDeviation="9" />
			</filter>
			{#each MARKERS as m, i (m.label)}
				<mask id="{uid}-focus-{i}" maskUnits="userSpaceOnUse" x={FRAME.x} y={FRAME.y} width={FRAME.width} height={FRAME.height}>
					<rect class="mask-veil" x={FRAME.x} y={FRAME.y} width={FRAME.width} height={FRAME.height} />
					<g filter="url(#{uid}-soft)">
						{#each m.focus.areas as [x0, y0, x1, y1], j (j)}
							<rect class="mask-hole" x={x0 - PAD} y={y0 - PAD} width={x1 - x0 + PAD * 2} height={y1 - y0 + PAD * 2} rx={PAD} />
						{/each}
						{#each focusPipes[i] as d, j (j)}<path class="mask-pipe" {d} />{/each}
					</g>
				</mask>
			{/each}
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
		<!-- One veil per marker, so moving between markers crossfades. -->
		{#each MARKERS as m, i (m.label)}
			<rect
				class="veil"
				class:on={spot === i}
				x={FRAME.x}
				y={FRAME.y}
				width={FRAME.width}
				height={FRAME.height}
				mask="url(#{uid}-focus-{i})"
			/>
		{/each}
	</svg>

	<div class="markers" class:focused={spot !== null} bind:this={markersEl}>
		{#each MARKERS as m, i (m.label)}
			<DiagramLabel
				label={m.label}
				x={(m.x - FRAME.x) / FRAME.width}
				y={(m.y - FRAME.y) / FRAME.height}
				order={i}
				lit={active === i}
				onactive={(on) => {
					if (on) active = i;
					else if (active === i) active = null;
				}}
			/>
		{/each}
	</div>

	<div class="tools" data-tool>
		{#if showControls}
			<EnergyControls bind:params bind:lineWeight bind:tones bind:dark {ink} />
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
		/* The controls panel caps its height against this box. */
		container-type: size;
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
	/* The dark sections' own grey, so the diagram sits in them seamlessly. */
	.diagram.dark {
		--stage: var(--grey-850);
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
		--w: calc(var(--unit) * var(--weight) * var(--density) * var(--fit-weight));
	}
	/* Opacity and colour per tier come from --o-* and --c-* on the figure. */
	.outline {
		opacity: var(--o-outline);
	}
	.outline path {
		stroke: var(--c-outline, var(--ink));
	}
	.outline path {
		stroke-width: calc(var(--w) * 1);
	}
	.structure {
		opacity: var(--o-structure);
	}
	.structure path {
		stroke: var(--c-structure, var(--ink));
	}
	.structure path {
		stroke-width: calc(var(--w) * 0.8);
	}
	.detail {
		opacity: var(--o-detail);
	}
	.detail path {
		stroke: var(--c-detail, var(--ink));
	}
	.detail path {
		stroke-width: calc(var(--w) * 0.7);
	}
	.axes {
		opacity: var(--o-axes);
	}
	.axes path {
		stroke: var(--c-axes, var(--ink));
	}
	.axes path {
		stroke-width: calc(var(--w) * 0.7);
	}
	.hatch {
		opacity: var(--o-hatch);
	}
	/* Pattern content inherits from where the pattern is defined, not used. */
	pattern line {
		stroke: var(--c-hatch, var(--ink));
		stroke-width: calc(var(--unit) * var(--weight) * var(--density) * var(--fit-weight) * 0.6);
	}
	/* Phones: at this size hatching and axes only muddy the parts they sit on. */
	@media screen and (max-width: 767px) {
		.hatch,
		.axes {
			display: none;
		}
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

	/* Spotlight: the stage colour laid over everything but the lit part. */
	.veil {
		fill: var(--stage);
		opacity: 0;
		transition: opacity 0.35s ease;
	}
	.veil.on {
		opacity: 0.72;
	}
	.mask-veil {
		fill: var(--grey-0);
	}
	.mask-hole {
		fill: var(--grey-950);
	}
	.diagram > svg .mask-pipe {
		fill: none;
		stroke: var(--grey-950);
		stroke-width: 46;
	}
	/* Once drawn on, markers answer at once rather than on the reveal's delay. */
	.settled .markers :global(.marker) {
		transition: opacity 0.3s ease;
	}
	.focused :global(.marker:not(.lit)) {
		opacity: 0.35;
	}

	.tools {
		position: absolute;
		right: var(--space-24);
		bottom: var(--space-24);
		display: flex;
		align-items: flex-end;
		gap: var(--space-8);
	}
	@media screen and (max-width: 767px) {
		.tools {
			right: var(--space-16);
			bottom: var(--space-16);
		}
	}
</style>
