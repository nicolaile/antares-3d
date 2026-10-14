<!--
	@component
	A line drawing that sketches itself in, once, as it comes into view: faint
	pencil strokes, then inked to full weight. Takes SVG markup of stroked
	paths tagged `data-pass`, drawn in hairlines at any size, sized by its
	container. Drawings come from a private tracing script (scripts/lab/).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

	gsap.registerPlugin(DrawSVGPlugin);

	let { svg, label }: { svg: string; label: string } = $props();

	let sheet: HTMLElement;

	onMount(() => {
		if (prefersReducedMotion()) return;
		const ctx = gsap.context(() => {
			const svgEl = sheet.querySelector('svg')!;
			const passes = [0, 1, 2].map((i) => gsap.utils.toArray<SVGPathElement>(`path[data-pass="${i}"]`, svgEl));

			gsap.set(passes.flat(), { drawSVG: 0 });
			gsap.set(svgEl, { opacity: 0.35 });

			const tl = gsap.timeline({ scrollTrigger: { trigger: sheet, start: 'top 75%', once: true } });
			// Pencil: every stroke at once.
			tl.to(passes.flat(), { drawSVG: '100%', duration: 0.9, ease: 'power2.inOut' })
				// Ink.
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
	/* Hairlines at any size; depth comes from each path's own stroke-opacity. */
	.sheet :global(path) {
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}
</style>
