<!--
	@component
	Opens a section: the title on the left and an optional aside on the
	right, level with it. Takes the section's text colour, so it works on
	light and dark; the aside is the secondary tone of either. Place in a
	full-width `subgrid` cell.
-->
<script lang="ts">
	import Cell from '$lib/layout/Cell.svelte';

	let {
		title,
		aside
	}: {
		title: string;
		aside?: string;
	} = $props();
</script>

<header class="header">
	<Cell span={8} tablet={{ span: 12 }}>
		<h2 class="title type-title">{title}</h2>
	</Cell>
	{#if aside}
		<Cell start={9} span={4} tablet={{ start: 7, span: 6 }}>
			<p class="aside type-body">{aside}</p>
		</Cell>
	{/if}
</header>

<style>
	.header {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: start;
		row-gap: var(--space-20);
	}
	.title,
	.aside {
		margin: 0;
	}
	.aside {
		/* Drops a touch so its first line reads level with the title's. */
		padding-top: var(--space-12);
		color: var(--secondary, var(--grey-700));
	}
</style>
