<!--
	@component
	The live 3D model on a panel, with a numbered feature list beside it.
	Selecting a feature moves the camera to that feature's shot; the list
	also steps through on its own until paused. Place in a full-width
	`subgrid` cell.
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
	import { prefersReducedMotion } from '$lib/scroll';

	let {
		features,
		/** Seconds each feature stays open while playing. */
		interval = 6
	}: { features: Feature[]; interval?: number } = $props();

	let active = $state(0);
	let paused = $state(false);
	let inView = $state(false);
	let panel: HTMLElement;
	let viewer: ModelViewer | null = $state(null);
	// The render tuning panel: on in dev, or with ?controls on any build.
	let showControls = $state(false);

	onMount(() => {
		paused = prefersReducedMotion();
		showControls = import.meta.env.DEV || new URLSearchParams(location.search).has('controls');
		const io = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting), {
			threshold: 0.3
		});
		io.observe(panel);
		return () => io.disconnect();
	});

	// Step to the next feature. Re-arms on every change, so picking one by
	// hand gives it the full interval before playback moves on.
	$effect(() => {
		const current = active;
		if (paused || !inView || features.length < 2) return;
		const id = setTimeout(() => (active = (current + 1) % features.length), interval * 1000);
		return () => clearTimeout(id);
	});
</script>

<div class="explorer" bind:this={panel}>
	<Cell span={3} tablet={{ span: 5 }}>
		<ol class="list">
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
		<div class="viewport">
			<Scene shot={features[active].shot} {paused} onready={(v) => (viewer = v)} />
		</div>
	</Cell>

	<div class="pause">
		<IconButton label={paused ? 'Play' : 'Pause'} pressed={paused} onclick={() => (paused = !paused)}>
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
	/* 832px tall at 1440. */
	.explorer {
		position: relative;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: center;
		height: calc(var(--size-font) * 52);
		background: var(--grey-100);
	}

	/* Inset from the panel edge; the right edge stays on the column line. */
	.list {
		display: grid;
		gap: var(--space-8);
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
