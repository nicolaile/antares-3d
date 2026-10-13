<!--
	@component
	A cut-out render of a machine in an exploded view, with a ruler beside it.
	Each module is a copy of the one image clipped to a band (`cuts`), so it
	can be placed without cutting up the image. Set `--ruler-x` to move the
	ruler.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
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
		/** Shares of the height, top to bottom, in the gaps between modules. */
		cuts: number[];
		/** The machine's top and bottom in the image, as shares of its height: what the ruler spans. */
		extent?: number[];
		ruler: string;
		sizes?: string;
	} = $props();

	const TICKS = 6;

	let scale: HTMLElement;
	let reading: HTMLElement;

	/** Seconds for the ruler's line to draw down; each tick grows as the line passes it. */
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
			const reach = gsap.parseEase('power2.inOut');
			ticks.forEach((tick, i) => {
				const at = i / (ticks.length - 1);
				// Invert the ease: when the line's drawn share reaches this tick.
				let t = at;
				for (let k = 0; k < 20; k++) t += (at - reach(t)) * 0.5;
				tl.to(tick, { scaleX: 1, duration: 0.4, ease: 'power2.out' }, Math.max(0, t) * DRAW);
			});
			tl.to(reading, { autoAlpha: 1, duration: 0.5, ease: 'power1.out' }, 0.3);
		}, scale);
		return () => ctx.revert();
	});

	const bands = $derived([0, ...cuts, 1].slice(0, -1).map((top, i) => [top, [...cuts, 1][i]]));
</script>

<figure class="view" style:aspect-ratio={ratio}>
	{#each bands as [top, bottom], i (i)}
		<div class="slice" style:clip-path="inset({top * 100}% 0 {(1 - bottom) * 100}% 0)" aria-hidden={i > 0}>
			<div class="drop">
				<Picture {...image} alt={i === 0 ? image.alt : ''} {ratio} {sizes} fit="contain" loading="eager" />
			</div>
		</div>
	{/each}

	<div
		class="ruler"
		bind:this={scale}
		aria-hidden="true"
		style:top="{extent[0] * 100}%"
		style:bottom="{(1 - extent[1]) * 100}%"
	>
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
	.slice {
		position: absolute;
		inset: 0;
	}
	.drop,
	.slice :global(.picture) {
		height: 100%;
	}

	/* `--ruler-x` (from the view's left) lines the ruler up with a title. */
	.view {
		--ruler-left: var(--ruler-x, calc(100% + var(--grid-gutter) + var(--space-40)));
		--ruler-ink: var(--grey-200);
	}
	.ruler {
		position: absolute;
		left: var(--ruler-left);
	}
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
	/* The top tick crosses the rail and runs on to the reading. */
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
