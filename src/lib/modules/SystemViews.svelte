<!--
	@component
	R1 two ways, switched at the bottom left: the section (the energy
	diagram) and an isometric line drawing of the assembled CAD
	(IsoDrawing). A short paragraph sits at the bottom left, under the
	drawing's corner (beside it, over the switch, when the switch is on);
	the drawing takes the width from the second column.

	Switching turns one into the other: the 3D camera swings from the front
	elevation the section is drawn in round to the isometric while the two
	drawings crossfade. The diagram's markers fade out and back in on their
	parts in 3D (IsoDrawing.ANCHORS, some approximate), each as the model's
	build-up reaches it; one whose part is turned out of sight hides until
	it's back in view.

	Back to the section, the isometric turns slightly home and fades as
	the section draws itself on again (EnergyDiagram's reveal), and the
	markers fade back in on it.

	In the isometric, dragging turns the model (and up and down, tilts it);
	it eases after the pointer, and starts from the plain isometric on each
	visit.
	On touch only sideways drags turn it, so the page still scrolls.

	The CAD loads as the section nears the screen, so the switch is ready
	when it's reached. With reduced motion the switch is a cut.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Vector3 } from 'three';
	import Cell from '$lib/layout/Cell.svelte';
	import EnergyDiagram from '$lib/modules/EnergyDiagram.svelte';
	import { FRAME, MARKERS } from '$lib/energy/r1';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	// Types only: three.js and the CAD load on demand, as their own chunk.
	import type { IsoDrawing } from '$lib/three/IsoDrawing';

	let {
		label,
		text
	}: {
		/** Accessible description of the section diagram. */
		label: string;
		text: string;
	} = $props();

	type View = 'section' | 'isometric';
	const VIEWS: { id: View; name: string }[] = [
		{ id: 'section', name: 'Section' },
		{ id: 'isometric', name: 'Isometric' }
	];
	let view: View = $state('section');
	/** Off for now: the section only, the switch hidden and the CAD not loaded. */
	const SWITCHABLE = false;

	let root: HTMLElement;
	let isoHost: HTMLDivElement;
	let markersEl: HTMLElement | undefined = $state();
	let diagram: EnergyDiagram | undefined = $state();
	/**
	 * Headed back to the section: it's hidden and draws itself on again
	 * over the fading isometric, rather than fading in.
	 */
	let returning = false;
	/** How far into the switch back the section starts drawing on, seconds. */
	const REDRAW_AT = 0.35;
	let redraw: gsap.core.Tween | null = null;

	/**
	 * Trial: the isometric builds itself up as it arrives, a section cut
	 * sweeping from nothing (0) to the whole model (1), its cut faces
	 * hatched as it goes and each label appearing as the cut reaches its
	 * part. Starts with the camera's swing (SWITCH) and carries on a while
	 * after it settles.
	 *
	 * Across X. At first the camera looks straight down X (the elevation),
	 * where every slice would show the model's whole outline and it would
	 * seem to be there from the start; so the sweep waits until the camera
	 * is a third of the way round (0.4s into its 1.2s swing) and the cut is
	 * turning oblique.
	 */
	/** The switch itself, seconds: the camera's swing and the crossfade. */
	const SWITCH = 1.2;
	/** How much of the swing the isometric turns back through as it fades out to the section. */
	const EXIT_TURN = 0.2;
	const SWEEP = {
		axis: 'x' as const,
		fromMax: false,
		duration: 3.5,
		delay: 0.4,
		ease: 'power2.inOut'
	};
	const sweep = { cut: 1 };
	let sweeping: gsap.core.Tween | null = null;
	function buildUp() {
		sweeping?.kill();
		sweep.cut = 0;
		iso?.setSection(SWEEP.axis, 0, SWEEP.fromMax);
		sweeping = gsap.to(sweep, {
			cut: 1,
			duration: prefersReducedMotion() ? 0 : SWEEP.duration,
			delay: prefersReducedMotion() ? 0 : SWEEP.delay,
			ease: SWEEP.ease,
			onUpdate: () => iso?.setSection(SWEEP.axis, sweep.cut, SWEEP.fromMax)
		});
	}
	let iso: IsoDrawing | null = null;
	let ready: Promise<IsoDrawing | null> | null = null;

	/** Where the switch is, 0 the section and 1 the isometric, eased. */
	const progress = { t: 0 };
	let drawing = $state(1);
	let isoShown = $state(0);
	/** Each marker's place on the model, by MARKERS index; none for parts not in the CAD. */
	let anchors: (Vector3 | null)[] = [];
	/** Each anchored marker's index into the viewer's anchors, for its visibility. */
	let anchorIndex: number[] = [];

	const ramp = (from: number, to: number, t: number) => {
		const x = Math.min(1, Math.max(0, (t - from) / (to - from)));
		return x * x * (3 - 2 * x);
	};

	/**
	 * Markers don't travel between the views: they fade out where they are
	 * in the first half of the switch, and back in at their place in the
	 * other in the second, on their part in the isometric. There, one whose
	 * part is out of sight (still to be built up, or turned away) stays hidden.
	 */
	function placeMarkers() {
		const els = markersEl?.children;
		if (!els) return;
		const t = progress.t;
		const onModel = t >= 0.5;
		const fade = onModel ? ramp(0.7, 1, t) : 1 - ramp(0, 0.3, t);
		for (let i = 0; i < els.length && i < MARKERS.length; i++) {
			const at = anchors[i];
			const p = onModel && at && iso ? iso.project(at) : null;
			let shown = fade;
			let translate = '';
			if (p) {
				const x = ((MARKERS[i].x - FRAME.x) / FRAME.width) * layout.width;
				const y = ((MARKERS[i].y - FRAME.y) / FRAME.height) * layout.height;
				// The isometric's canvas can run past the figure (the panel's height).
				translate = `${(p.x + layout.left - x).toFixed(1)}px ${(p.y + layout.top - y).toFixed(1)}px`;
				if (!iso!.anchorVisible(anchorIndex[i])) shown = 0;
			} else if (onModel) shown = 0;
			// Write only what changed: this runs every frame the drawing does.
			const was = written[i] ?? (written[i] = { translate: '', shown: 1 });
			const el = els[i] as HTMLElement;
			if (was.translate !== translate) el.style.translate = was.translate = translate;
			shown = Math.round(shown * 100) / 100;
			if (was.shown !== shown) {
				was.shown = shown;
				el.style.filter = shown < 1 ? `opacity(${shown})` : '';
				el.style.pointerEvents = shown < 0.5 ? 'none' : '';
			}
		}
	}
	/** What placeMarkers last wrote to each marker. */
	const written: { translate: string; shown: number }[] = [];
	/**
	 * The markers' layer's size and the isometric canvas's offset in it,
	 * measured when they change size rather than read every frame (which
	 * would force a layout each time).
	 */
	const layout = { width: 0, height: 0, left: 0, top: 0 };
	function measure() {
		if (!markersEl || !isoHost) return;
		layout.width = markersEl.clientWidth;
		layout.height = markersEl.clientHeight;
		layout.left = isoHost.offsetLeft;
		layout.top = isoHost.offsetTop;
	}

	/**
	 * The isometric only works while it can be seen: the section on screen,
	 * and the isometric showing or on its way in or out. Otherwise it does
	 * nothing at all, not even its frame loop.
	 */
	// Assumed until the observer first reports: better a little work than a blank stage.
	let onScreen = true;
	function syncActive() {
		if (iso) iso.active = onScreen && (view === 'isometric' || progress.t > 0);
	}

	function apply() {
		const t = progress.t;
		drawing = returning ? 1 : 1 - ramp(0, 0.45, t);
		isoShown = ramp(0.15, 0.6, t);
		// The way in swings all the way round from the elevation; the way back
		// only starts to turn home (EXIT_TURN of the swing) as it fades.
		iso?.pose(returning ? 1 - EXIT_TURN * (1 - t) : t);
		placeMarkers();
	}

	/**
	 * The isometric's lines as the section's outlines: the same ink at the
	 * same opacity over the same stage, and the same weight. Read from the
	 * diagram's own styles, so it follows them (the dev controls included).
	 */
	function matchLines(viewer: IsoDrawing) {
		const figure = isoHost.closest('figure') ?? isoHost;
		const style = getComputedStyle(figure);
		const read = (name: string, fallback: number) => parseFloat(style.getPropertyValue(name)) || fallback;
		viewer.setLineStyle({
			ink: style.getPropertyValue('--c-outline').trim() || style.getPropertyValue('--ink').trim() || '#ffffff',
			paper: style.getPropertyValue('--stage').trim() || '#000000',
			opacity: read('--o-outline', 1),
			weight: read('--weight', 0.5) * read('--fit-weight', 1) * read('--density', 1)
		});
	}

	/** Loads the isometric once; null if it can't (no WebGL, say). */
	function load() {
		ready ??= import('$lib/three/IsoDrawing')
			.then(async ({ IsoDrawing }) => {
				const viewer = new IsoDrawing(isoHost);
				matchLines(viewer);
				anchors = MARKERS.map((m) => IsoDrawing.anchor(m.label));
				let k = 0;
				anchorIndex = anchors.map((a) => (a ? k++ : -1));
				viewer.setAnchors(anchors.filter((a): a is Vector3 => a !== null));
				await viewer.open();
				viewer.pose(progress.t);
				// The camera moves (and the stage resizes) after the frame; markers follow then.
				viewer.onFrame = placeMarkers;
				iso = viewer;
				measure();
				syncActive();
				// Scriptable from the console, like __cad on /cad.
				if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__iso = viewer;
				return viewer;
			})
			.catch(() => null);
		return ready;
	}

	/**
	 * The visitor's turn and tilt, radians: where the drag has taken them
	 * (`aim`), and where the model is on its way there, eased after it.
	 */
	const turned = { turn: 0, tilt: 0 };
	const aim = { turn: 0, tilt: 0 };
	/** Radians per CSS pixel dragged. */
	const DRAG = 0.006;
	let follow: { turn: (v: number) => void; tilt: (v: number) => void } | null = null;
	function turnTo(turn: number, tilt: number, duration = 0.9) {
		follow ??= {
			turn: gsap.quickTo(turned, 'turn', { duration, ease: 'power3.out', onUpdate: () => iso?.rotate(turned.turn, turned.tilt) }),
			tilt: gsap.quickTo(turned, 'tilt', { duration, ease: 'power3.out', onUpdate: () => iso?.rotate(turned.turn, turned.tilt) })
		};
		follow.turn(turn);
		follow.tilt(tilt);
	}

	let drag: { id: number; x: number; y: number } | null = $state(null);
	function onpointerdown(e: PointerEvent) {
		if (view !== 'isometric' || !iso || e.button !== 0) return;
		// The markers keep their own clicks.
		if ((e.target as HTMLElement).closest('button')) return;
		drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onpointermove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.id || !iso) return;
		const [lo, hi] = iso.tiltRange;
		aim.turn -= (e.clientX - drag.x) * DRAG;
		// Touch keeps vertical drags for the page.
		if (e.pointerType === 'mouse') aim.tilt = Math.min(hi, Math.max(lo, aim.tilt + (e.clientY - drag.y) * DRAG));
		drag.x = e.clientX;
		drag.y = e.clientY;
		turnTo(aim.turn, aim.tilt);
	}
	function onpointerup(e: PointerEvent) {
		if (drag?.id === e.pointerId) drag = null;
	}

	async function show(next: View) {
		if (next === view) return;
		view = next;
		syncActive();
		redraw?.kill();
		// Back to the section: the isometric turns slightly home as it fades
		// (any turn is undone next time, while it's hidden), and the section
		// draws itself on again.
		if (next === 'section') {
			returning = true;
			diagram?.conceal();
			redraw = gsap.delayedCall(prefersReducedMotion() ? 0 : REDRAW_AT, () => diagram?.reveal());
			sweeping?.kill();
		} else returning = false;
		if (next === 'isometric' && !(await load())) {
			view = 'section';
			return;
		}
		// Clicked again while loading: the latest choice wins.
		if (view !== next) return;
		if (iso) matchLines(iso);
		if (next === 'isometric') {
			// Start from the plain isometric: the last visit's turn goes, unseen.
			gsap.killTweensOf(turned);
			follow = null;
			aim.turn = aim.tilt = turned.turn = turned.tilt = 0;
			iso?.rotate(0, 0);
			buildUp();
		}
		gsap.to(progress, {
			t: next === 'isometric' ? 1 : 0,
			duration: prefersReducedMotion() ? 0 : SWITCH,
			ease: 'power3.inOut',
			overwrite: true,
			onUpdate: apply,
			// Back at the section, the isometric rests.
			onComplete: syncActive
		});
	}

	onMount(() => {
		// Load ahead, while the section is still a screen away.
		const io = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting || !SWITCHABLE) return;
				io.disconnect();
				load();
			},
			{ rootMargin: '100% 0px' }
		);
		io.observe(root);
		const seen = new IntersectionObserver(([entry]) => {
			onScreen = entry.isIntersecting;
			syncActive();
		});
		seen.observe(root);
		const sized = new ResizeObserver(() => {
			measure();
			placeMarkers();
		});
		sized.observe(isoHost);
		if (markersEl) sized.observe(markersEl);
		return () => {
			io.disconnect();
			seen.disconnect();
			sized.disconnect();
			gsap.killTweensOf(progress);
			redraw?.kill();
			sweeping?.kill();
			iso?.destroy();
		};
	});
</script>

<div class="views" class:full={SWITCHABLE} bind:this={root}>
	<Cell start={1} span={3} tablet={{ start: 1, span: 12 }}>
		<div class="side">
			<div class="intro">
				<p class="text type-caption">{text}</p>
			</div>
			{#if SWITCHABLE}
				<div class="switch type-body-default" role="group" aria-label="Drawing">
					{#each VIEWS as v, i (v.id)}
						{#if i > 0}<span class="slash" aria-hidden="true">/</span>{/if}
						<button type="button" class:active={view === v.id} aria-pressed={view === v.id} onclick={() => show(v.id)}>
							{v.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</Cell>
	<Cell start={2} span={11} tablet={{ start: 1, span: 12 }}>
		<!-- svelte-ignore a11y_no_static_element_interactions: dragging to turn is a pointer extra; the switch and markers stay the keyboard's way in. -->
		<div
			class="turn"
			class:turnable={view === 'isometric'}
			class:dragging={drag !== null}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
		>
			<EnergyDiagram {label} dark {drawing} bind:markersEl bind:this={diagram}>
				{#snippet layer()}
					<div class="iso" bind:this={isoHost} style:opacity={isoShown} aria-hidden="true"></div>
				{/snippet}
			</EnergyDiagram>
		</div>
	</Cell>
</div>

<style>
	.views {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--space-40);
	}

	.side {
		/* Over the drawing's stage, which runs under it. */
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-24);
		height: 100%;
		box-sizing: border-box;
		padding-bottom: var(--space-40);
		/* Only its text and switch take the pointer: the markers and the
		   drag reach the drawing through the rest. */
		pointer-events: none;
	}
	.side > * {
		pointer-events: auto;
	}
	.intro {
		display: grid;
		gap: var(--space-24);
		/* 280px at 1440: the paragraph's short measure. */
		max-width: calc(var(--size-font) * 17.5);
	}
	.intro p {
		margin: 0;
	}
	.text {
		color: var(--secondary);
	}

	.switch {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
	}
	.switch button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--secondary);
		font: inherit;
		cursor: pointer;
	}
	.switch button.active {
		color: inherit;
		cursor: default;
	}
	.switch button:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: var(--space-4);
	}

	.turnable {
		cursor: grab;
		/* Sideways drags turn the model; vertical ones still scroll the page. */
		touch-action: pan-y;
	}
	.turnable.dragging {
		cursor: grabbing;
	}

	.iso {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.iso :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	/*
	 * Desktop: the paragraph under the drawing, at the bottom left. The
	 * section keeps its own proportions, held to the screen's height on
	 * wide, short ones.
	 *
	 * Section only (the switch off): the panel hugs the drawing. The frame's
	 * empty margin above and below is trimmed (235 and 234 of its 1284), so
	 * the drawing's top lines up with the text's, and its right edge
	 * (199 of 1930 in) sits on the grid's.
	 *
	 * With the switch (`full`): one screen tall, the switch at its foot and
	 * the section centred; the isometric takes the panel's whole height, so
	 * the model has room as it's turned.
	 */
	@media screen and (min-width: 992px) {
		.views {
			/* The drawing on the first row (and the text beside it, with the
			   switch); section only, the text on a row of its own below. */
			grid-template-rows: auto;
			/* The section's widened frame runs past the page's edge; trimmed
			   sideways only, so the isometric can still run tall. */
			overflow-x: clip;
		}
		/* Section only: the trimmed margin is clipped too, so the frame's
		   stage colour and focus veils stay inside the band. */
		.views:not(.full) {
			overflow: clip;
			/* Room above the drawing, 80px at 1440, so the section stands
			   taller than the drawing it hugs; the text below ends it. */
			padding-top: var(--space-80);
		}
		.views.full {
			height: 100svh;
			grid-template-rows: 100%;
		}
		.views > :global(.cell) {
			grid-row: 1;
		}
		/* Section only: the paragraph under the drawing, at the bottom left. */
		.views:not(.full) > :global(.cell:first-child) {
			grid-row: 2;
		}
		.views:not(.full) .side {
			padding-bottom: 0;
		}
		/* With the text out from beside it, the drawing has the whole width,
		   and sits a little right of centre in it (64px at 1440) rather than
		   against the right edge. */
		.views:not(.full) > :global(.cell:nth-child(2)) {
			grid-column: 1 / -1;
		}
		.views:not(.full) .turn :global(figure.diagram) {
			/* 2% up on the frame's fit. */
			--width: calc(min(100%, 92svh * 1930 / 1284) * 1.02);
			margin-left: calc((100% - var(--width)) / 2 + var(--space-64));
		}
		.turn {
			display: grid;
			/* One track the cell's width, so the frame's width below measures
			   from the cell and not from itself. */
			grid-template-columns: minmax(0, 1fr);
			align-content: center;
		}
		.full .turn {
			height: 100%;
		}
		.turn :global(figure.diagram) {
			/* The frame the cell's width (columns 2–12), held to the screen's
			   height on wide, short ones. */
			--width: min(100%, 92svh * 1930 / 1284);
			/* The isometric runs past the section's frame, into the panel. */
			overflow: visible;
			width: var(--width);
			margin: calc(var(--width) * -235 / 1930) 0 calc(var(--width) * -234 / 1930)
				calc(100% - var(--width) * (1930 - 199) / 1930);
		}
		.full .turn :global(figure.diagram) {
			margin: 0 0 0 calc((100% - var(--width)) / 2);
		}
		.iso {
			top: calc(50% - 50svh);
			bottom: auto;
			height: 100svh;
		}
	}

	/* Stacked over the drawing: the line, then the switch. */
	@media screen and (max-width: 991px) {
		.side {
			padding-bottom: 0;
		}
		.intro {
			margin: 0;
		}
	}
</style>
