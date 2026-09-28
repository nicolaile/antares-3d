<!--
	@component
	The live 3D model on a panel, with a numbered feature list beside it.
	Selecting a feature moves the camera to that feature's shot. Nothing
	changes on its own: the reader picks. The button pauses the model's slow
	turn. Place in a full-width `subgrid` cell.
-->
<script lang="ts" module>
	import type { Picture as PictureSource } from 'vite-imagetools';
	import type { Shot } from '$lib/three/shot';

	export type Feature = {
		title: string;
		text: string;
		thumb?: PictureSource;
		/** Where the camera goes while this feature is open. */
		shot: Shot;
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import FeatureCard from '$lib/components/FeatureCard.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Scene from '$lib/components/Scene.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import type { ModelViewer } from '$lib/three/ModelViewer';
	import { gsap, ScrollTrigger, prefersReducedMotion } from '$lib/scroll';

	let { features }: { features: Feature[] } = $props();

	let active = $state(0);
	let paused = $state(false);
	let panel: HTMLElement;
	let viewport: HTMLElement;
	let list: HTMLElement;
	let viewer: ModelViewer | null = $state(null);
	// The render tuning panel: on in dev, or with ?controls on any build.
	let showControls = $state(false);

	onMount(() => {
		paused = prefersReducedMotion();
		showControls = import.meta.env.DEV || new URLSearchParams(location.search).has('controls');
		// Scroll reveal, scrubbed to scroll so it plays backwards too:
		// - the model scales up and settles into place (no fade — it's always
		//   fully there);
		// - the card list drifts slower than the page, a light parallax.
		// Only transforms move — the canvas never resizes, so the
		// model doesn't re-render at a new size each frame.
		const ctx = gsap.context(() => {
			if (prefersReducedMotion()) return;
			const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
			// Long range, small moves and a heavy scrub lag: the model drifts
			// into place rather than snapping to the scroll.
			gsap.fromTo(
				viewport,
				{ scale: 0.96, y: () => unit() * 3 },
				{
					scale: 1,
					y: 0,
					ease: 'sine.out',
					scrollTrigger: {
						trigger: panel,
						start: 'top bottom',
						end: 'top 20%',
						scrub: 1.2,
						invalidateOnRefresh: true
					}
				}
			);

			// Up to 80px below its place on the way in, 80px above on the way
			// out — less when the panel is capped short, so the cards never
			// drift past its edges.
			const drift = () => Math.min(unit() * 5, Math.max(0, (panel.offsetHeight - list.offsetHeight) / 2 - unit()));
			gsap.fromTo(
				list,
				{ y: () => drift() },
				{
					y: () => -drift(),
					ease: 'none',
					scrollTrigger: { trigger: panel, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true }
				}
			);
		}, panel);
		// Webfonts shift everything above the panel once they land.
		document.fonts.ready.then(() => ScrollTrigger.refresh());

		return () => {
			ctx.revert();
		};
	});

</script>

<div class="explorer" bind:this={panel}>
	<Cell span={3} tablet={{ span: 5 }}>
		<ol class="list" bind:this={list}>
			{#each features as feature, i (feature.title)}
				<FeatureCard
					index={i}
					title={feature.title}
					text={feature.text}
					thumb={feature.thumb}
					open={i === active}
					onselect={() => (active = i)}
				/>
			{/each}
		</ol>
	</Cell>

	<Cell start={4} span={9} tablet={{ start: 6, span: 7 }} self="stretch">
		<div class="viewport" bind:this={viewport}>
			<Scene shot={features[active].shot} {paused} onready={(v) => (viewer = v)} />
		</div>
	</Cell>

	<div class="pause">
		<IconButton label={paused ? 'Resume rotation' : 'Pause rotation'} pressed={paused} onclick={() => (paused = !paused)}>
			<svg viewBox="0 0 12 12" aria-hidden="true">
				{#if paused}
					<path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
				{:else}
					<rect x="3" y="2" width="2" height="8" fill="currentColor" />
					<rect x="7" y="2" width="2" height="8" fill="currentColor" />
				{/if}
			</svg>
		</IconButton>
	</div>
</div>

{#if showControls}
	<Controls {viewer} />
{/if}

<style>
	/* 832px tall at 1440, capped to the screen. */
	.explorer {
		position: relative;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: center;
		/* Never taller than the screen (less the page margin top and bottom):
		   the height scales with width, so on wide monitors 52 units would
		   outgrow the window and the model, framed to the panel, with it. */
		height: min(calc(var(--size-font) * 52), calc(100svh - var(--grid-margin) * 2));
		background: var(--grey-100);
	}

	/* Inset from the panel edge; 301px wide at 1440. */
	.list {
		display: grid;
		width: calc(var(--size-font) * 18.8125);
		gap: var(--space-4);
		margin: 0 0 0 var(--space-20);
		padding: 0;
		list-style: none;
	}

	.viewport {
		position: relative;
		height: 100%;
	}

	.pause {
		position: absolute;
		right: var(--space-20);
		bottom: var(--space-20);
	}

	/* Phones: the model on top, the list under it. */
	@media screen and (max-width: 767px) {
		.explorer {
			height: auto;
			row-gap: var(--space-20);
			padding-bottom: var(--space-20);
		}
		.explorer > :global(:first-child) {
			grid-row: 2;
		}
		.list {
			width: auto;
			margin: 0 var(--space-20);
		}
		.viewport {
			aspect-ratio: 1;
		}
		.pause {
			top: var(--space-20);
			bottom: auto;
		}
	}
</style>
