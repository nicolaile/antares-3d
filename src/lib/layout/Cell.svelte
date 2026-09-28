<!--
	@component
	A block placed on the grid by column: `start` and `span` for desktop, with
	optional `tablet` and `mobile` overrides. On mobile a cell spans all 12
	columns unless told otherwise.

	`subgrid` makes the cell a grid of its own that reuses the page's column
	lines, so its children are placed with the same column numbers.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { space, type Align, type Column, type Placement, type Space } from './types';

	let {
		as = 'div',
		start,
		span = 12,
		tablet,
		mobile,
		subgrid = false,
		gap,
		align,
		self,
		children
	}: {
		as?: string;
		start?: Column;
		span?: Column;
		tablet?: Placement;
		mobile?: Placement;
		subgrid?: boolean;
		/** Row gap, when `subgrid`. */
		gap?: Space;
		/** align-items, when `subgrid`. */
		align?: Align;
		/** This cell's own alignment within its row. */
		self?: Align;
		children: Snippet;
	} = $props();
</script>

<svelte:element
	this={as}
	class="cell"
	class:subgrid
	style:--start={start}
	style:--span={span}
	style:--start-t={tablet?.start}
	style:--span-t={tablet?.span}
	style:--start-m={mobile?.start}
	style:--span-m={mobile?.span}
	style:row-gap={space(gap)}
	style:align-items={align}
	style:align-self={self}
>
	{@render children()}
</svelte:element>

<style>
	.cell {
		grid-column: var(--start, auto) / span var(--span);
		min-width: 0;
	}
	.subgrid {
		display: grid;
		grid-template-columns: subgrid;
	}
	@media screen and (max-width: 991px) {
		.cell {
			grid-column: var(--start-t, var(--start, auto)) / span var(--span-t, var(--span));
		}
	}
	@media screen and (max-width: 767px) {
		.cell {
			grid-column: var(--start-m, auto) / span var(--span-m, 12);
		}
	}
</style>
