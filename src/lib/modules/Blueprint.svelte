<!--
	@component
	A line drawing that sketches itself in when it comes into view, once, like an architect's concept: pencil, then ink — long construction lines, then shapes, then details. Takes the drawing as SVG markup of stroked paths
	(scripts/trace-line-drawing.py makes one from a scan), drawn in hairlines
	whatever its size. Sized by its container; let it run past the screen's
	edge and the page clips it there. With reduced motion it's simply there.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	gsap.registerPlugin(DrawSVGPlugin);

	let { svg, label }: { svg: string; label: string } = $props();

	let sheet: HTMLElement;

	onMount(() => {
		if (prefersReducedMotion()) return;
		const ctx = gsap.context(() => {
			// Drawn like an architect's concept sketch: first in pencil,
			// every stroke drawn at once. Then it's inked: the whole sheet darkens to its weight.
			// Plays once, on its own clock, as the drawing comes into view.
			// The tracer writes each stroke's pass on it, already in order
			// across the sheet, and merges the small ones, so there's little
			// to measure and few strokes to move.
			const svgEl = sheet.querySelector('svg')!;
			const passes = [0, 1, 2].map((i) => gsap.utils.toArray<SVGPathElement>(`path[data-pass="${i}"]`, svgEl));

			// Pencil: the sheet starts faint, at a third of its ink.
			gsap.set(passes.flat(), { drawSVG: 0 });
			gsap.set(svgEl, { opacity: 0.35 });

			const tl = gsap.timeline({ scrollTrigger: { trigger: sheet, start: 'top 75%', once: true } });
			// Pencil: every stroke at once, all passes together.
			tl.to(passes.flat(), { drawSVG: '100%', duration: 0.9, ease: 'power2.inOut' })
				// Ink: the lines come up to their weight.
				.to(svgEl, { opacity: 1, duration: 0.6, ease: 'power1.inOut' });
		}, sheet);
		return () => ctx.revert();
	});
</script>

<div class="sheet" role="img" aria-label={label} bind:this={sheet}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own traced drawing -->
	{@html svg}
</div>

<style>
	.sheet {
		color: var(--black);
	}
	.sheet :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	/* Hairlines at any size, each in its own share of the ink (the tracer
	   writes it as stroke-opacity), so the depth of the drawing holds. */
	.sheet :global(path) {
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}
</style>
