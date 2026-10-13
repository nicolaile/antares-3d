<!--
	@component
	A loose cluster of overlapping photos on the grid, each offset as a share
	of its own width so the composition holds at every size. Each rises into
	place on the scroll at its own `depth`, landing as it reaches mid-screen.
	On phones the cluster spreads the columns it uses across the full width.
-->
<script lang="ts">
	import Picture from '$lib/components/Picture.svelte';
	import { parallax } from '$lib/motion/parallax';
	import type { ClusterItem } from '$lib/content/progress';

	let { items }: { items: ClusterItem[] } = $props();

	/** How far below its place a depth-1 photo starts, in % of its height. Sign of depth is ignored. */
	const TRAVEL = 25;
	/** Seconds to catch up with the scroll, so it glides. */
	const CATCH_UP = 0.8;

	// The columns the photos span between them, for the phone layout.
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
						sizes="(max-width: 767px) {Math.round((item.span / columns) * 100)}vw, {Math.round(
							(item.span / 12) * 100
						)}vw"
					/>
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Every photo in the one row, so they overlap. */
	.cluster {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
	}
	/* A grid item's % margins resolve against its own area's width, so the
	   drop is a share of the photo's width. */
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
