<!--
	@component
	A marker on a diagram: a small grey square that, on hover or focus,
	opens into an orange pill carrying the part's name — the square turns
	white and sits inside it, and the pill grows out from it towards the
	middle of the diagram. The dot keeps one size on
	screen whatever size the diagram is; its position is a fraction of the
	diagram so it tracks the drawing exactly.
-->
<script lang="ts">
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		label,
		x,
		y,
		order = 0,
		lit = false,
		onactive
	}: {
		label: string;
		/** Position as fractions of the diagram, 0..1. */
		x: number;
		y: number;
		/** Place in the reveal sequence. */
		order?: number;
		/** This marker's part is the one highlighted. */
		lit?: boolean;
		/** Hover, focus or tap starts (true) or ends (false). */
		onactive?: (on: boolean) => void;
	} = $props();

	// Labels near an edge open inwards so they never clip.
	const align = $derived(x < 0.3 ? 'start' : x > 0.7 ? 'end' : 'center');

	let dotEl: HTMLSpanElement;
	let tagEl: HTMLSpanElement;
	let pillEl: HTMLSpanElement;
	let hovered = $state(false);
	/** Keyboard focus — or any focus on touch, where a tap is the hover. */
	let focused = $state(false);
	const open = $derived(hovered || focused);

	function onfocus(e: FocusEvent) {
		const el = e.currentTarget as HTMLElement;
		focused = matchMedia('(hover: none)').matches || el.matches(':focus-visible');
		onactive?.(true);
	}
	function onblur() {
		focused = false;
		onactive?.(false);
	}

	/**
	 * Open: the tag fades in, the pill opens out of the sliver around the dot
	 * along its length, and the dot whitens. Close plays it back, quicker.
	 * The clip is set in px here: GSAP can't tween the calc() the stylesheet
	 * starts from, so the pill's own size gives the closed sliver.
	 */
	let tl: gsap.core.Timeline | null = null;
	$effect(() => {
		const on = open;
		if (!pillEl) return;
		const w = pillEl.offsetWidth;
		const h = pillEl.offsetHeight;
		const sliver =
			align === 'end' ? `inset(0px 0px 0px ${w - h}px round 4px)` : `inset(0px ${w - h}px 0px 0px round 4px)`;
		const root = getComputedStyle(document.documentElement);
		const ink = root.getPropertyValue(on ? '--grey-0' : '--grey-400').trim();
		const quick = prefersReducedMotion() ? 0 : 1;
		tl?.kill();
		tl = gsap
			.timeline()
			.to(tagEl, { autoAlpha: on ? 1 : 0, duration: (on ? 0.15 : 0.12) * quick, ease: 'power1.out' }, 0)
			.fromTo(
				pillEl,
				{ clipPath: on ? sliver : 'inset(0px 0px 0px 0px round 4px)' },
				{
					clipPath: on ? 'inset(0px 0px 0px 0px round 4px)' : sliver,
					duration: (on ? 0.35 : 0.2) * quick,
					ease: on ? 'power3.out' : 'power2.in'
				},
				0
			)
			.to(dotEl, { backgroundColor: ink, duration: 0.25 * quick, ease: 'power1.out' }, 0);
		return () => tl?.kill();
	});
</script>

<button
	class="marker {align}"
	class:lit
	class:open
	type="button"
	onpointerenter={() => {
		hovered = true;
		onactive?.(true);
	}}
	onpointerleave={() => {
		hovered = false;
		onactive?.(false);
	}}
	{onfocus}
	{onblur}
	style:left="{x * 100}%"
	style:top="{y * 100}%"
	style:--order={order}
>
	<span class="dot" aria-hidden="true" bind:this={dotEl}></span>
	<span class="tag type-caption" bind:this={tagEl}><span class="pill" bind:this={pillEl}>{label}</span></span>
</button>

<style>
	.marker {
		/* 10px at 1440. */
		--dot: calc(var(--size-font) * 0.625);
		/* The pill: 26px tall, the square inset evenly from its end. */
		--pill: calc(var(--size-font) * 1.625);
		--inset: calc((var(--pill) - var(--dot)) / 2);
		/* Hit area well past the dot, centred on the point, so small dots stay easy to hover and tap. */
		--hit: calc(var(--size-font) * 1.8);
		position: absolute;
		width: var(--hit);
		height: var(--hit);
		margin: calc(var(--hit) * -0.5) 0 0 calc(var(--hit) * -0.5);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	/* The type unit grows on phones; the diagram doesn't, so hold the dots back. */
	@media screen and (max-width: 767px) {
		.marker {
			--dot: calc(var(--size-font) * 0.54);
		}
	}

	.dot {
		position: absolute;
		inset: 0;
		z-index: 2;
		margin: auto;
		width: var(--dot);
		height: var(--dot);
		border-radius: var(--stage-radius);
		background: var(--grey-400);
	}
	/* Lights up as energy passes through: a white wash over the grey, at the
	   strength the diagram hands down as --lit (0 at rest, 1 as a pulse's
	   head crosses the dot). */
	.dot::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--grey-0);
		opacity: calc(var(--lit, 0) * 0.9);
	}
	.marker:focus-visible {
		outline: none;
	}

	/* Centred on the dot vertically; one end sits the square's inset past
	   the dot, so the dot lands inside it like the square in a tag.
	   Two layers: the tag is the full-size, unclipped hit area, so the
	   pointer can move onto the pill while it's still opening without
	   falling through; the pill inside carries the colour and does the
	   reveal, hidden as a sliver around the dot and opening along its
	   length. */
	.tag {
		position: absolute;
		top: 50%;
		z-index: 1;
		display: flex;
		height: var(--pill);
		translate: 0 -50%;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}
	.pill {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		border-radius: 4px;
		background: var(--accent-500);
		color: var(--grey-950);
		white-space: nowrap;
	}
	/* Opens to the right, square at the left end. */
	.start .tag,
	.center .tag {
		left: calc(50% - var(--dot) / 2 - var(--inset));
	}
	.start .pill,
	.center .pill {
		padding: 0 var(--space-16) 0 calc(var(--inset) + var(--dot) + var(--space-8));
		clip-path: inset(0 calc(100% - var(--pill)) 0 0 round 4px);
	}
	/* Near the right edge it opens to the left instead, square at the right. */
	.end .tag {
		right: calc(50% - var(--dot) / 2 - var(--inset));
	}
	.end .pill {
		padding: 0 calc(var(--inset) + var(--dot) + var(--space-8)) 0 var(--space-16);
		clip-path: inset(0 0 0 calc(100% - var(--pill)) round 4px);
	}

	/* Open (hover, keyboard focus, or a tap on touch): on top of its
	   neighbours, and the pill takes the pointer too — it's inside the
	   marker, so moving from the dot onto it keeps the marker open. The
	   motion itself is GSAP, in the script. */
	.open {
		z-index: 3;
	}
	.open .tag {
		pointer-events: auto;
	}
</style>
