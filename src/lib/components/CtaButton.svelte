<!--
	@component
	The filled call to action, from the mobile CTA in the design: the label
	on a light grey pill, and beside it a black square holding a white
	arrow, the two the same height. One control, so the pair is a single
	link (with `href`) or button (without). On hover the pill darkens a
	step and the arrow nudges forward. `arrow={false}` is the pill alone,
	for a quieter action (the footer's "Join mission"). `tone="dark"`, on
	dark pages: the pill Grey 900 with white text, lifting to Grey 800, and
	the square turned white with a black arrow.
-->
<script lang="ts">
	import arrowIcon from '$lib/assets/icons/right-arrow.svg?raw';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		label,
		href,
		arrow = true,
		tone = 'light',
		onclick
	}: {
		tone?: 'light' | 'dark';
		label: string;
		/** The black arrow square beside the pill. */
		arrow?: boolean;
		href?: string;
		onclick?: (event: MouseEvent) => void;
	} = $props();

	let icon: HTMLSpanElement | undefined;
	let pill: HTMLSpanElement;

	function nudge(on: boolean) {
		const fill = getComputedStyle(pill).getPropertyValue(
			tone === 'dark' ? (on ? '--grey-800' : '--grey-900') : on ? '--grey-200' : '--grey-100'
		).trim();
		if (prefersReducedMotion()) return gsap.set(pill, { backgroundColor: fill });
		gsap.to(pill, { backgroundColor: fill, duration: 0.3, ease: 'menu', overwrite: true });
		if (icon) gsap.to(icon, { xPercent: on ? 20 : 0, duration: 0.4, ease: 'power3.out', overwrite: true });
	}
</script>

{#snippet content()}
	<span class="label" bind:this={pill}>{label}</span>
	{#if arrow}
		<span class="square" aria-hidden="true"><span class="icon" bind:this={icon}>{@html arrowIcon}</span></span>
	{/if}
{/snippet}

{#if href}
	<a
		class="cta type-caption" class:dark={tone === 'dark'}
		{href}
		{onclick}
		onpointerenter={() => nudge(true)}
		onpointerleave={() => nudge(false)}>{@render content()}</a
	>
{:else}
	<button
		type="button"
		class="cta type-caption" class:dark={tone === 'dark'}
		{onclick}
		onpointerenter={() => nudge(true)}
		onpointerleave={() => nudge(false)}>{@render content()}</button
	>
{/if}

<style>
	.cta {
		/* 34px tall at 1440, the pill and the square alike; 8px corners on both. */
		--cta-size: calc(var(--size-font) * 2.125);
		--cta-radius: 8px;
		display: inline-flex;
		align-items: stretch;
		gap: var(--space-8);
		padding: 0;
		border: 0;
		background: none;
		color: var(--black);
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}
	.cta:focus-visible {
		outline: 1px solid var(--black);
		outline-offset: 2px;
	}
	/* The label centred in the pill, 18px either side. */
	.label {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		height: var(--cta-size);
		padding: 0 calc(var(--size-font) * 1.125);
		border-radius: var(--cta-radius);
		background: var(--grey-100);
	}
	/* 34px square at 1440, the arrow 9px clear all round (16px). */
	.square {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: var(--cta-size);
		height: var(--cta-size);
		padding: calc(var(--size-font) * 0.5625);
		border-radius: var(--cta-radius);
		background: var(--black);
		color: var(--white);
	}
	.dark {
		color: var(--white);
	}
	.dark:focus-visible {
		outline-color: var(--white);
	}
	.dark .label {
		background: var(--grey-900);
	}
	.dark .square {
		background: var(--white);
		color: var(--black);
	}

	.icon {
		display: block;
		width: 100%;
		height: 100%;
	}
	.icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
