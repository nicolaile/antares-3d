<!--
	@component
	A loose cluster of photos, overlapping on the 12-column grid: each placed
	by column, dropped down and nudged across as a share of its own width,
	so the composition holds at every size. On phones the cluster keeps only
	the columns it uses and spreads them across the full width, so the
	photos aren't left small.

	The photos come in on the scroll (`parallax`): each rises into its
	place at its own `depth`, landing in the composition as it reaches
	the middle of the screen. The photo itself sits still in its frame.
	The scroll travel is off on phones; with reduced motion it's the still
	composition.
-->
<script lang="ts">
	import Picture from '$lib/components/Picture.svelte';
	import { parallax } from '$lib/motion/parallax';
	import type { ClusterItem } from '$lib/content/progress';

	let { items }: { items: ClusterItem[] } = $props();

	/**
	 * How far below its place a photo of depth 1 starts, in % of its own
	 * height. Every photo rises into place as it comes up the screen and
	 * lands exactly in the composition as its middle reaches the screen's,
	 * then holds; deeper ones start lower, so they arrive at their
	 * own pace. A negative depth travels as far as a positive one.
	 */
	const TRAVEL = 25;
	/** Seconds the rise takes to catch up with the scroll: a little give, so it glides. */
	const CATCH_UP = 0.8;

	/** The first column any photo uses, and how many columns they cover between them. */
	const first = $derived(Math.min(...items.map((item) => item.start)));
	const columns = $derived(Math.max(...items.map((item) => item.start + item.span)) - first);
</script>

<div class="cluster" style:--columns-m={columns}>
	{#each items as item, i (i)}
		<div
			class="item"
			style:--start={item.start}
			style:--start-m={item.start - first + 1}
			style:--span={item.span}
			style:--y={item.y ?? 0}
			style:--x={item.x ?? 0}
			style:--z={item.z ?? 0}
			{@attach parallax({
				start: TRAVEL * Math.abs(item.depth ?? 0.5),
				end: 0,
				scrollEnd: 'center center',
				scrub: CATCH_UP,
				disable: 'mobileLandscape'
			})}
		>
			<div class="float">
				<div class="media" style:aspect-ratio={item.ratio}>
					<Picture
						{...item.image}
						ratio="auto"
						sizes="(max-width: 767px) {Math.round((item.span / columns) * 100)}vw, {Math.round((item.span / 12) * 100)}vw"
					/>
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	/* The page's own columns; every photo in the one row, so they overlap. */
	.cluster {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
	}
	/* A grid item's percentage margins measure its own area's width: the drop
	   is a share of the photo's width, whatever the screen. */
	.item {
		grid-row: 1;
		grid-column: var(--start) / span var(--span);
		align-self: start;
		z-index: var(--z);
		margin-top: calc(var(--y) * 1%);
		will-change: transform;
	}
	.media {
		position: relative;
		overflow: hidden;
		translate: calc(var(--x) * 1%) 0;
	}
	.media :global(.picture) {
		position: absolute;
		inset: 0;
		height: 100%;
	}

	@media screen and (max-width: 767px) {
		.cluster {
			grid-template-columns: repeat(var(--columns-m), minmax(0, 1fr));
		}
		.item {
			grid-column: var(--start-m) / span var(--span);
		}
	}
</style>
