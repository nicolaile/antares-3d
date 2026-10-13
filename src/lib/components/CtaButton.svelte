<!--
	@component
	The filled call to action: a label pill beside an arrow square, as one
	link (with `href`) or button (without).
-->
<script lang="ts">
	import arrowIcon from '$lib/assets/icons/right-arrow.svg?raw';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

	let {
		label,
		href,
		arrow = true,
		tone = 'light',
		onclick
	}: {
		tone?: 'light' | 'dark';
		label: string;
		/** False for the pill alone, a quieter action (the footer's "Join mission"). */
		arrow?: boolean;
		href?: string;
		onclick?: (event: MouseEvent) => void;
	} = $props();

	let icon = $state<HTMLSpanElement>();
	let pill: HTMLSpanElement;

	function nudge(on: boolean) {
		const fill = getComputedStyle(pill)
			.getPropertyValue(tone === 'dark' ? (on ? '--grey-800' : '--grey-900') : on ? '--grey-200' : '--grey-100')
			.trim();
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
		class="cta type-caption"
		class:dark={tone === 'dark'}
		{href}
		{onclick}
		onpointerenter={() => nudge(true)}
		onpointerleave={() => nudge(false)}>{@render content()}</a
	>
{:else}
	<button
		type="button"
		class="cta type-caption"
		class:dark={tone === 'dark'}
		{onclick}
		onpointerenter={() => nudge(true)}
		onpointerleave={() => nudge(false)}>{@render content()}</button
	>
{/if}

<style>
	.cta {
		--cta-size: calc(var(--size-font) * 2.125);
		--cta-radius: 8px;
		--cta-inset: calc(var(--size-font) * 1.125);
		--cta-icon-inset: calc(var(--size-font) * 0.5625);
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
	.label {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		height: var(--cta-size);
		padding: 0 var(--cta-inset);
		border-radius: var(--cta-radius);
		background: var(--grey-100);
	}
	.square {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: var(--cta-size);
		height: var(--cta-size);
		padding: var(--cta-icon-inset);
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
