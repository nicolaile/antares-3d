<!--
	@component
	The bar behind the header: a plain fill the full width of the screen,
	68px tall at 1440. It slides
	down when the visitor scrolls back up partway down a page, and away again
	when they scroll down or reach the top. White over light sections, dark
	over dark ones, crossfading as it passes from one to the other. Sits under
	the wordmark, whose difference blend turns it black on the white and
	white on the dark, and under the menu button.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import { header, SHOW, HIDE } from '$lib/header.svelte';

	let bar: HTMLElement;
	let first = true;

	$effect(() => {
		const shown = header.backed;
		const reduce = prefersReducedMotion();
		if (first) {
			first = false;
			gsap.set(bar, { yPercent: shown ? 0 : -100, autoAlpha: shown ? 1 : 0 });
			return;
		}
		if (shown) {
			// Slides down solid; with reduced motion it fades in where it stands instead.
			gsap.set(bar, reduce ? { yPercent: 0 } : { autoAlpha: 1 });
			gsap.to(bar, { yPercent: 0, autoAlpha: 1, ...(reduce ? { duration: 0.2 } : SHOW), overwrite: 'auto' });
		} else {
			// Out of view, it's hidden too, so nothing of it lingers at the edge.
			gsap.to(bar, {
				...(reduce ? { autoAlpha: 0, duration: 0.2 } : { yPercent: -100, ...HIDE }),
				overwrite: 'auto',
				onComplete: () => gsap.set(bar, { autoAlpha: 0 })
			});
		}
	});

	/** A colour token, resolved, so GSAP can tween between two. */
	const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

	// Crossfades while it shows; out of view it just takes the colour it
	// will come back in with, so it never arrives in the wrong one.
	$effect(() => {
		const color = token(header.barDark ? '--grey-850' : '--grey-0');
		if (untrack(() => header.backed)) gsap.to(bar, { backgroundColor: color, duration: 0.3, ease: 'power1.out' });
		else gsap.set(bar, { backgroundColor: color });
	});
</script>

<div class="bar" bind:this={bar} aria-hidden="true"></div>

<style>
	/* Under the wordmark (40) and the menu (50). */
	.bar {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 39;
		/* 68px at 1440; keep in step with BAR in header.svelte.ts. */
		height: var(--header-height);
		background: var(--grey-0);
		visibility: hidden;
		pointer-events: none;
	}
</style>
