<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Scene from '$lib/components/Scene.svelte';
	import Grid from '$lib/components/Grid.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import type { ModelViewer } from '$lib/three/ModelViewer';
	import { getLenis } from '$lib/scroll';

	let page: HTMLElement | null = $state(null);
	let viewer: ModelViewer | null = $state(null);
	/** Derived from scroll position — trails behind while the camera travels. */
	let active = $state(0);
	/**
	 * What the user just asked for. A press has to light its button now, not
	 * when the camera finishes arriving, so this wins until the scroll agrees.
	 */
	let intent = $state<number | null>(null);
	const shown = $derived(intent ?? active);

	const specs = [
		['Battery', '100kWe'],
		['Model', 'R1'],
		['Capacity', '7000 litres']
	];

	const modes = [
		{
			label: 'Integrated Shielding',
			blurb:
				'Layered steel and borated composite built into the vessel wall, so the unit ships without site-assembled containment.'
		},
		{
			label: 'Reactivity Controls',
			blurb:
				'Graphite and boron carbide control drums with independent actuator motors, inspired by historical space reactor designs.'
		},
		{
			label: 'Core',
			blurb:
				'A hexagonal graphite monolith carrying TRISO fuel compacts, with instrumentation channels running the full height of the core.'
		},
		{
			label: 'Sodium Heat Pipes',
			blurb:
				'Sodium-filled pipes move heat to the power conversion system by capillary action, with no pumps and no primary coolant loop.'
		}
	];

	function trackMax() {
		return document.documentElement.scrollHeight - window.innerHeight;
	}

	/** Each mode owns an equal slice of the scroll track. */
	function go(i: number) {
		intent = i;
		getLenis()?.scrollTo((i / modes.length) * trackMax() + 1, { duration: 1.2 });
	}

	onMount(() => {
		const sync = () => {
			const max = trackMax();
			const p = max > 0 ? window.scrollY / max : 0;
			active = Math.min(modes.length - 1, Math.floor(p * modes.length));
			// Scroll has caught up with the press — hand control back to it.
			if (intent !== null && active === intent) intent = null;
		};
		// Scrolling by hand abandons a pending press, so the bar follows the
		// wheel rather than staying stuck on a destination you left.
		const release = () => (intent = null);

		// Passive: these only read scroll position, they never block it.
		window.addEventListener('scroll', sync, { passive: true });
		window.addEventListener('wheel', release, { passive: true });
		window.addEventListener('touchstart', release, { passive: true });
		sync();
		return () => {
			window.removeEventListener('scroll', sync);
			window.removeEventListener('wheel', release);
			window.removeEventListener('touchstart', release);
		};
	});
</script>

<svelte:head>
	<title>Antares — R1 Microreactor</title>
	<meta
		name="description"
		content="R1 Microreactor — a 100kWe transportable reactor with integrated shielding, drum reactivity control and passive sodium heat-pipe cooling."
	/>
</svelte:head>

<Scene trigger={page} onready={(v) => (viewer = v)} />
<Grid visible={false} />
<Controls {viewer} />

<div class="ui">
	<div class="meta">
		<p class="wordmark mono">R1 Microreactor</p>
		<dl class="specs mono">
			{#each specs as [term, value] (term)}
				<dt>{term}</dt>
				<dd>{value}</dd>
			{/each}
		</dl>
	</div>

	<div class="feature">
		<!-- Keyed so heading and copy cross-fade together when the mode changes.
		     `in:` only — an `out:` would overlap and shift the paragraph. -->
		{#key shown}
			<div in:fade={{ duration: 400 }}>
				<h1>{modes[shown].label}</h1>
				<p class="lede">{modes[shown].blurb}</p>
			</div>
		{/key}
	</div>
</div>

<nav class="modes" aria-label="Assembly views">
	{#each modes as mode, i (mode.label)}
		<button class="mode" class:active={i === shown} aria-current={i === shown} onclick={() => go(i)}>
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				{#if i === 0}
					<rect width="24" height="24" rx="2.5" fill="currentColor" />
					<circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="2.6" />
				{:else if i === 1}
					<circle cx="8" cy="8" r="2.1" fill="currentColor" />
					<circle cx="8" cy="16" r="2.1" fill="currentColor" />
					<circle cx="16" cy="8" r="2.1" fill="currentColor" />
					<circle cx="16" cy="16" r="2.1" fill="currentColor" />
				{:else}
					<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2" />
					<circle cx="12" cy="12" r="3.4" fill="currentColor" />
				{/if}
			</svg>
			<span class="mono">{mode.label}</span>
		</button>
	{/each}
</nav>

<!-- Empty scroll track: gives ScrollTrigger its range while the copy is out. -->
<main bind:this={page}></main>

<style>
	/* Overlay sits on the stage; only the mode bar takes pointer events, so
	   dragging the model still works everywhere else. */
	.ui {
		position: fixed;
		top: calc(var(--grid-margin) + var(--bar-block) + var(--bar-gap));
		right: var(--grid-margin);
		bottom: var(--grid-margin);
		left: var(--grid-margin);
		z-index: 2;
		pointer-events: none;
	}
	.meta,
	.feature {
		position: absolute;
		left: calc(var(--size-font) * 1.25);
	}
	.meta {
		top: calc(var(--size-font) * 1.25);
	}
	/* Optically centred against the stage, independent of the meta block. */
	.feature {
		top: 50%;
		transform: translateY(-50%);
	}

	.wordmark {
		margin: 0;
		color: var(--ink);
	}
	.specs {
		display: grid;
		grid-template-columns: auto auto;
		gap: calc(var(--size-font) * 0.2) calc(var(--size-font) * 2);
		margin: calc(var(--size-font) * 2.5) 0 0;
		color: var(--ink-spec);
	}
	.specs dt {
		grid-column: 1;
	}
	.specs dd {
		grid-column: 2;
		margin: 0;
	}

	h1 {
		margin: 0;
		/* 18px at the 1440 design width — same size as the paragraph below. */
		font-size: calc(var(--size-font) * 1.125);
		font-weight: 400;
		line-height: 1;
		letter-spacing: -0.025em;
	}
	.lede {
		margin: calc(var(--size-font) * 1.5) 0 0;
		max-width: 20em;
		/* 18px at the 1440 design width. */
		font-size: calc(var(--size-font) * 1.125);
		line-height: 1.18;
		letter-spacing: -0.01em;
		color: var(--ink-mid);
	}

	/* Four cells, each spanning three of the twelve columns. The gap matches
	   the stage-to-bar gap so the bar reads as one block with the stage. */
	.modes {
		position: fixed;
		top: var(--grid-margin);
		right: var(--grid-margin);
		left: var(--grid-margin);
		z-index: 2;
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		gap: var(--bar-gap);
	}
	.mode {
		grid-column: span 3;
		display: flex;
		/* Content sits at the top of a taller button rather than centring in it. */
		align-items: flex-start;
		gap: calc(var(--size-font) * 0.6);
		height: var(--bar-height);
		padding: calc(var(--size-font) * 0.5) calc(var(--size-font) * 0.75);
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.25s ease,
			color 0.25s ease;
	}
	.mode:hover {
		background: var(--surface-hover);
	}
	.mode.active {
		background: var(--ink);
		color: var(--on-ink);
	}
	.mode:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.icon {
		width: calc(var(--size-font) * 1);
		height: calc(var(--size-font) * 1);
		flex: none;
	}
	/* Label box matches the icon box exactly, so flex-start leaves the two
	   optically aligned with each other instead of the text riding high. */
	.mode .mono {
		line-height: calc(var(--size-font) * 1);
	}
	/* The first icon's inner circle is knocked out in white; on the active
	   (dark) cell that would vanish, so it flips to the cell background. */
	.mode.active .icon :global(circle[stroke]) {
		stroke: var(--ink);
	}
	.mode.active .icon :global(rect) {
		fill: var(--on-ink);
	}

	@media screen and (max-width: 767px) {
		.meta,
		.feature {
			left: calc(var(--size-font) * 1);
			right: calc(var(--size-font) * 1);
		}
		/* Two per row rather than four slivers with clipped labels. */
		.mode {
			grid-column: span 6;
			padding: 0 calc(var(--size-font) * 0.6);
		}
	}

	main {
		position: relative;
		z-index: 1;
		height: 400svh;
		pointer-events: none;
	}
</style>
