<!--
	@component
	The full-width bar behind the wordmark and menu button. Slides in when the
	visitor scrolls back up mid-page, away on scroll down or at the top.
	White over light sections, dark over dark ones, switching at once.
	A page on another light colour sets `--header-light` on <html> (Progress).
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
	import { header, SHOW, HIDE } from '$lib/chrome/header.svelte';

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
			// The section under it may have changed while it was away.
			gsap.set(bar, { backgroundColor: untrack(colour) });
			gsap.set(bar, reduce ? { yPercent: 0 } : { autoAlpha: 1 });
			gsap.to(bar, { yPercent: 0, autoAlpha: 1, ...(reduce ? { duration: 0.2 } : SHOW), overwrite: 'auto' });
		} else {
			// Hidden once out of view so no sliver lingers at the edge.
			gsap.to(bar, {
				...(reduce ? { autoAlpha: 0, duration: 0.2 } : { yPercent: -100, ...HIDE }),
				overwrite: 'auto',
				onComplete: () => gsap.set(bar, { autoAlpha: 0 })
			});
		}
	});

	/** A colour token, resolved, so GSAP can tween between two. */
	const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	const colour = () => (header.barDark ? token('--black') : token('--header-light') || token('--white'));

	// Switches at once, shown or hidden: a fade lags the section edge it follows.
	$effect(() => {
		gsap.set(bar, { backgroundColor: colour() });
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
		/* Keep in step with BAR in header.svelte.ts. */
		height: var(--header-height);
		background: var(--white);
		visibility: hidden;
		pointer-events: none;
	}
</style>
