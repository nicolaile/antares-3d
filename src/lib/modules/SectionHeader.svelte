<!--
	@component
	Opens a section. `split` (the default): the title on the left and an
	optional aside on the right (columns 9–11), level with it. `center`: the
	title and the aside as one short block in the middle four columns, the
	same size, the aside straight under the title. Takes the section's text
	colour, so it works on light and dark; the aside is the secondary tone of
	either. Place in a full-width `subgrid` cell.
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
		align?: 'split' | 'center';
	} = $props();
</script>

<header class="header" class:center={align === 'center'}>
	{#if align === 'center'}
		<Cell start={5} span={4} tablet={{ start: 3, span: 8 }}>
			<h2 class="title type-h2-small">{title}</h2>
			{#if aside}<p class="aside type-h2-small">{aside}</p>{/if}
		</Cell>
	{:else}
		<Cell span={8} tablet={{ span: 12 }}>
			<h2 class="title type-h1">{title}</h2>
		</Cell>
		{#if aside}
			<Cell start={9} span={3} tablet={{ start: 7, span: 6 }}>
				<p class="aside type-body-large">{aside}</p>
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

	/* Centred: one block, the aside reading on from the title. */
	.center {
		text-align: center;
		/* Centred lines of even length, not a long one over a stray word or two. */
		text-wrap: balance;
	}
	.center .aside {
		padding-top: 0;
	}
</style>
