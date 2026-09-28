<!--
	@component
	The 12-column grid. Everything on a page sits in a Row, and everything in
	a Row sits in a Cell, so all horizontal placement is in whole columns.

	A Row nested in a Cell with `subgrid` keeps the page's own column lines,
	so nested content still lands exactly on the grid.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { space, type Align, type Space } from './types';

	let {
		as = 'div',
		gap,
		align,
		children
	}: {
		as?: string;
		/** Vertical space between rows of cells. */
		gap?: Space;
		align?: Align;
		children: Snippet;
	} = $props();
</script>

<svelte:element this={as} class="row" style:row-gap={space(gap)} style:align-items={align}>
	{@render children()}
</svelte:element>

<style>
	.row {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
	}
</style>
