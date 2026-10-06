<!--
	@component
	R1 two ways, switched at the bottom left: the section (the energy
	diagram) and an isometric line drawing of the assembled CAD
	(IsoDrawing). A short title and line sit at the left, the drawing to
	their right.

	Switching turns one into the other: the 3D camera swings from the front
	elevation the section is drawn in round to the isometric while the two
	drawings crossfade. The diagram's markers fade out and back in on their
	parts in 3D (IsoDrawing.ANCHORS, some approximate), each as the model's
	build-up reaches it; one whose part is turned out of sight hides until
	it's back in view.

	Back to the section, the isometric fades as the section draws itself on
	again (EnergyDiagram's reveal), and the markers fade back in on it.

	In the isometric, dragging turns the model (and up and down, tilts it);
	it eases after the pointer, and unwinds on the way back to the section.
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
		title,
		text
	}: {
		/** Accessible description of the section diagram. */
		label: string;
		title: string;
		text: string;
	} = $props();

	type View = 'section' | 'isometric';
	const VIEWS: { id: View; name: string }[] = [
		{ id: 'section', name: 'Section' },
		{ id: 'isometric', name: 'Isometric' }
	];
	let view: View = $state('section');

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
	 * across X sweeping from nothing (0) to the whole model (1), its cut
	 * faces hatched as it goes and each label appearing as the cut reaches
	 * its part. Starts with the camera's swing (1.6s) and carries on a while
	 * after it settles.
	 */
	const SWEEP = {
		axis: 'x' as const,
		duration: 3.8,
		delay: 0.2,
		ease: 'power2.inOut'
	};
	const sweep = { cut: 1 };
	let sweeping: gsap.core.Tween | null = null;
	function buildUp() {
		sweeping?.kill();
		sweep.cut = 0;
		iso?.setSection(SWEEP.axis, 0);
		sweeping = gsap.to(sweep, {
			cut: 1,
			duration: prefersReducedMotion() ? 0 : SWEEP.duration,
			delay: prefersReducedMotion() ? 0 : SWEEP.delay,
			ease: SWEEP.ease,
			onUpdate: () => iso?.setSection(SWEEP.axis, sweep.cut)
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
			const el = els[i] as HTMLElement;
			const at = anchors[i];
			const p = onModel && at && iso ? iso.project(at) : null;
			let shown = fade;
			if (p) {
				const x = ((MARKERS[i].x - FRAME.x) / FRAME.width) * markersEl!.clientWidth;
				const y = ((MARKERS[i].y - FRAME.y) / FRAME.height) * markersEl!.clientHeight;
				el.style.translate = `${p.x - x}px ${p.y - y}px`;
				if (!iso!.anchorVisible(anchorIndex[i])) shown = 0;
			} else {
				el.style.translate = '';
				if (onModel) shown = 0;
			}
			el.style.filter = shown < 1 ? `opacity(${shown})` : '';
			el.style.pointerEvents = shown < 0.5 ? 'none' : '';
		}
	}

	function apply() {
		const t = progress.t;
		drawing = returning ? 1 : 1 - ramp(0, 0.45, t);
		isoShown = ramp(0.15, 0.6, t);
		iso?.pose(t);
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
		redraw?.kill();
		// Back to the section: the turn unwinds with the switch, and the
		// section draws itself on again.
		if (next === 'section') {
			aim.turn = aim.tilt = 0;
			turnTo(0, 0);
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
		if (next === 'isometric') buildUp();
		gsap.to(progress, {
			t: next === 'isometric' ? 1 : 0,
			duration: prefersReducedMotion() ? 0 : 1.6,
			ease: 'power3.inOut',
			overwrite: true,
			onUpdate: apply
		});
	}

	onMount(() => {
		// Load ahead, while the section is still a screen away.
		const io = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				io.disconnect();
				load();
			},
			{ rootMargin: '100% 0px' }
		);
		io.observe(root);
		return () => {
			io.disconnect();
			gsap.killTweensOf(progress);
			redraw?.kill();
			sweeping?.kill();
			iso?.destroy();
		};
	});
</script>

<div class="views" bind:this={root}>
	<Cell span={3} tablet={{ span: 12 }}>
		<div class="side">
			<p class="intro type-body-large">
				<span>{title}</span>
				<span class="text">{text}</span>
			</p>
			<div class="switch type-body" role="group" aria-label="Drawing">
				{#each VIEWS as v, i (v.id)}
					{#if i > 0}<span class="slash" aria-hidden="true">/</span>{/if}
					<button type="button" class:active={view === v.id} aria-pressed={view === v.id} onclick={() => show(v.id)}>
						{v.name}
					</button>
				{/each}
			</div>
		</div>
	</Cell>
	<Cell start={4} span={9} tablet={{ start: 1, span: 12 }}>
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
		/* For the side's lift, in the row's width. */
		container-type: inline-size;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--space-40);
	}

	/* The title and line level with the drawing's middle, the switch at its
	   foot: the frame has empty stage under the drawing, about 7.5% of the
	   row's width (as R1Microreactor pulls it up by above), so the switch
	   lifts by as much. */
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-24);
		height: 100%;
		box-sizing: border-box;
		padding-bottom: 7.5cqw;
	}
	.intro {
		display: grid;
		margin: auto 0;
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
