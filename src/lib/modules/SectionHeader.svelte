<!--
	@component
	Opens a section with a title and optional aside. Takes the section's text
	colour; the aside uses `--secondary` if set. Place in a full-width
	`subgrid` cell.
-->
<script lang="ts">
	import Cell from '$lib/layout/Cell.svelte';

	let {
		title,
		aside,
		align = 'split'
	}: {
		title: string;
		aside?: string;
		/** `split`: aside to the right, level with the title. `center`: one centred block. */
		align?: 'split' | 'center';
	} = $props();
</script>

<header class="header" class:center={align === 'center'}>
	{#if align === 'center'}
		<Cell start={5} span={4} tablet={{ start: 3, span: 8 }}>
			<h2 class="title type-h4">{title}</h2>
			{#if aside}<p class="aside type-h4">{aside}</p>{/if}
		</Cell>
	{:else}
		<Cell span={8} tablet={{ span: 12 }}>
			<h2 class="title type-h1">{title}</h2>
		</Cell>
		{#if aside}
			<Cell start={9} span={3} tablet={{ start: 7, span: 6 }}>
				<p class="aside type-body-default">{aside}</p>
			</Cell>
		{/if}
	{/if}
</header>

<style>
	.header {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: start;
		row-gap: var(--space-24);
	}
	.title,
	.aside {
		margin: 0;
	}
	.aside {
		/* Drops a touch so its first line reads level with the title's. */
		padding-top: var(--space-16);
		color: var(--secondary, var(--grey-700));
	}

	.center {
		text-align: center;
		text-wrap: balance;
	}
	.center .aside {
		padding-top: 0;
	}
</style>
