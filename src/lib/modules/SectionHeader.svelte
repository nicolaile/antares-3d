<!--
	@component
	Opens a section: a hairline, the title, and an optional aside that drops
	in under the title's line at the right. Place in a full-width `subgrid`
	cell.
-->
<script lang="ts">
	import Cell from '$lib/layout/Cell.svelte';
	import Caption from '$lib/components/Caption.svelte';

	let {
		title,
		aside
	}: {
		title: string;
		aside?: { label?: string; text: string };
	} = $props();
</script>

<header class="header">
	<Cell span={8} tablet={{ span: 12 }}>
		<h2 class="title type-heading-1">{title}</h2>
	</Cell>
	{#if aside}
		<Cell start={9} span={4} tablet={{ start: 7, span: 6 }}>
			<Caption label={aside.label} text={aside.text} />
		</Cell>
	{/if}
</header>

<style>
	.header {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--space-8);
		padding-top: var(--space-20);
		border-top: 1px solid var(--grey-200);
	}
	.title {
		margin: 0;
	}
	/* The aside starts on the line below the title, not beside it. */
	.header > :global(:nth-child(2)) {
		grid-row: 2;
	}
</style>
