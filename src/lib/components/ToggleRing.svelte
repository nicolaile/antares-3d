<!--
	@component
	The plus/minus ring for anything that opens and closes, like an
	accordion row: 36px square at 1440 with 4px corners, a Grey 200 hairline with a + in it.
	Open, the + turns to a − (its upright lies flat) and a dark ring fades
	in over the light one; the dark ring also shows while `active` (the
	row is hovered). The same ring as ArrowButton's.

	A decoration, not a button: it sits inside the control that does the
	opening, which carries the label and aria-expanded.
-->
<script lang="ts">
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

	let {
		open = false,
		active = false
	}: {
		open?: boolean;
		/** Show the dark ring without opening: while the row is hovered. */
		active?: boolean;
	} = $props();

	let ring: HTMLElement;
	let upright: SVGPathElement;
	const MOTION = { duration: 0.6, ease: 'power3.inOut' };

	// Starts where it is, without animating in.
	let first = true;
	$effect(() => {
		const on = open;
		const turn = { rotate: on ? 90 : 0, svgOrigin: '8 8' };
		if (first || prefersReducedMotion()) gsap.set(upright, turn);
		else gsap.to(upright, { ...turn, ...MOTION, overwrite: true });
	});
	$effect(() => {
		const to = { '--ring': open || active ? 1 : 0 };
		if (first || prefersReducedMotion()) gsap.set(ring, to);
		else gsap.to(ring, { ...to, duration: 0.4, ease: 'power2.out', overwrite: true });
		first = false;
	});
</script>

<span class="toggle" aria-hidden="true" bind:this={ring}>
	<!-- add.svg / minus.svg's strokes, drawn here so the upright can turn. -->
	<svg viewBox="0 0 16 16" fill="none">
		<path d="M15 8H1" stroke="currentColor" />
		<path d="M8 15V1" stroke="currentColor" bind:this={upright} />
	</svg>
</span>

<style>
	/* 36px, 4px corners, the hairline closed; the dark one fades in over it on
	   hover and while open (--ring, 0 to 1, tweened by GSAP). */
	.toggle {
		position: relative;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: calc(var(--size-font) * 2.25);
		height: calc(var(--size-font) * 2.25);
		border: 1px solid var(--grey-200);
		border-radius: 4px;
		color: var(--black);
	}
	.toggle::after {
		position: absolute;
		inset: -1px;
		border: 1px solid var(--black);
		border-radius: 4px;
		opacity: var(--ring, 0);
		content: '';
	}
	svg {
		display: block;
		width: calc(var(--size-font) * 0.875);
		height: calc(var(--size-font) * 0.875);
	}
</style>
