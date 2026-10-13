<!--
	@component
	A cut-out render of a machine in an exploded view, split into its
	modules, with a ruler beside it. It holds still.

	The render is one image; each module is a copy of it clipped to a band
	(`cuts`, shares of its height, in the gaps between the modules), so they
	can be placed without the image being cut up.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import type { Picture as Source } from 'vite-imagetools';

	let {
		image,
		ratio,
		cuts,
		extent = [0, 1],
		ruler,
		sizes = '(max-width: 767px) 50vw, 25vw'
	}: {
		image: { src: Source; alt: string };
		ratio: string;
		/** Where the render splits into modules, as shares of its height, top to bottom. */
		cuts: number[];
		/** Where the machine starts and ends inside the image, as shares of its height: what the ruler spans. */
		extent?: number[];
		/** The ruler's reading. */
		ruler: string;
		sizes?: string;
	} = $props();

	/** The ruler's ticks. */
	const TICKS = 6;

	let scale: HTMLElement;
	let reading: HTMLElement;

	/**
	 * The ruler draws in as it comes into view: the line down from the top,
	 * each tick growing out from it as the line passes, then the reading.
	 */
	const DRAW = 1.4;
	onMount(() => {
		if (prefersReducedMotion()) return;
		const ctx = gsap.context(() => {
			const line = scale.querySelector('.line');
			const ticks = gsap.utils.toArray<HTMLElement>('.tick', scale);
			gsap.set(line, { scaleY: 0 });
			gsap.set(ticks, { scaleX: 0 });
			gsap.set(reading, { autoAlpha: 0 });
			const tl = gsap.timeline({ scrollTrigger: { trigger: scale, start: 'top 85%', once: true } });
			tl.to(line, { scaleY: 1, duration: DRAW, ease: 'power2.inOut' }, 0);
			// Each tick as the line reaches it, on the same curve.
			const reach = gsap.parseEase('power2.inOut');
			ticks.forEach((tick, i) => {
				const at = i / (ticks.length - 1);
				// Invert the curve: when the line's drawn share hits this tick.
				let t = at;
				for (let k = 0; k < 20; k++) t += (at - reach(t)) * 0.5;
				tl.to(tick, { scaleX: 1, duration: 0.4, ease: 'power2.out' }, Math.max(0, t) * DRAW);
			});
			tl.to(reading, { autoAlpha: 1, duration: 0.5, ease: 'power1.out' }, 0.3);
		}, scale);
		return () => ctx.revert();
	});

	/** Each band's top and bottom, as shares of the height. */
	const bands = $derived([0, ...cuts, 1].slice(0, -1).map((top, i) => [top, [...cuts, 1][i]]));

</script>

<figure class="view" style:aspect-ratio={ratio}>
	{#each bands as [top, bottom], i (i)}
		<div
			class="slice"
			style:clip-path="inset({top * 100}% 0 {(1 - bottom) * 100}% 0)"
			aria-hidden={i > 0}
		>
			<div class="drop">
				<Picture {...image} alt={i === 0 ? image.alt : ''} {ratio} {sizes} fit="contain" loading="eager" />
			</div>
		</div>
	{/each}

	<div class="ruler" bind:this={scale} aria-hidden="true" style:top="{extent[0] * 100}%" style:bottom="{(1 - extent[1]) * 100}%">
		<div class="rail"><div class="line"></div></div>
		{#each { length: TICKS } as _, i (i)}
			<span class="tick" style:top="{(i / (TICKS - 1)) * 100}%"></span>
		{/each}
	</div>
	<figcaption bind:this={reading} class="reading type-caption-small type-tabular" style:top="{extent[0] * 100}%">
		{ruler}
	</figcaption>
</figure>

<style>
	.view {
		position: relative;
		margin: 0;
	}
	/* The copies stacked exactly, each showing its band. */
	.slice {
		position: absolute;
		inset: 0;
	}
	.drop,
	.slice :global(.picture) {
		height: 100%;
	}

	/* A column past the render's right edge: a hairline down its height,
	   short ticks off its left side, and at the top a longer one that runs
	   on to the right, out to the reading. Its place across can be set from
	   outside (`--ruler-x`, from the view's left), to line up with a title. */
	.view {
		--ruler-left: var(--ruler-x, calc(100% + var(--grid-gutter) + var(--space-40)));
		--ruler-ink: var(--grey-200);
	}
	.ruler {
		position: absolute;
		left: var(--ruler-left);
	}
	/* The rail stretches about its middle with the spread; the line in it
	   draws down from the top. */
	.rail {
		position: absolute;
		inset: 0 auto 0 0;
		width: 1px;
	}
	.line {
		height: 100%;
		background: var(--ruler-ink);
		transform-origin: 50% 0;
	}
	.tick {
		position: absolute;
		right: 0;
		width: var(--space-12);
		height: 1px;
		background: var(--ruler-ink);
		transform-origin: 100% 50%;
	}
	/* The top one crosses the rail and runs on to the reading. */
	.tick:first-of-type {
		right: auto;
		left: calc(var(--space-12) * -1);
		width: calc(var(--space-12) + var(--space-40));
		/* Grows out both ways from the rail. */
		transform-origin: var(--space-12) 50%;
	}
	.reading {
		position: absolute;
		left: calc(var(--ruler-left) + var(--space-40) + var(--space-16));
		margin: 0;
		color: var(--ruler-ink);
		white-space: nowrap;
		translate: 0 -50%;
	}
</style>
