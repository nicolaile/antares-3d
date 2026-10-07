<!--
	@component
	A call to action led by a right arrow: "→ Join our mission", set in the
	Button style. With an `href` it's a link; without, a button that runs
	`onclick`. Takes the surrounding text colour, so it works on light and
	dark. On hover the arrow nudges forward.
-->
<script lang="ts">
	import arrow from '$lib/assets/icons/right-arrow.svg?raw';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		label,
		href,
		onclick
	}: {
		label: string;
		href?: string;
		onclick?: (event: MouseEvent) => void;
	} = $props();

	let icon: HTMLSpanElement;

	function nudge(on: boolean) {
		if (prefersReducedMotion()) return;
		gsap.to(icon, { xPercent: on ? 25 : 0, duration: 0.4, ease: 'power3.out', overwrite: true });
	}
</script>

{#snippet content()}
	<span class="icon" bind:this={icon} aria-hidden="true">{@html arrow}</span>
	{label}
{/snippet}

{#if href}
	<a
		class="button type-button"
		{href}
		{onclick}
		onpointerenter={() => nudge(true)}
		onpointerleave={() => nudge(false)}>{@render content()}</a
	>
{:else}
	<button
		type="button"
		class="button type-button"
		{onclick}
		onpointerenter={() => nudge(true)}
		onpointerleave={() => nudge(false)}>{@render content()}</button
	>
{/if}

<style>
	.button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-8);
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}
	.button:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 2px;
	}
	/* 16px at 1440: one em of the label's own size. */
	.icon {
		display: block;
		width: 1em;
		height: 1em;
	}
	.icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
