<!--
	@component
	A titled list of figures: value in the first column, what it measures in
	the rest. Place in a `subgrid` cell; it uses that cell's columns.
-->
<script lang="ts">
	let {
		title,
		items
	}: {
		title: string;
		items: { value: string; label: string }[];
	} = $props();
</script>

<div class="milestones type-body">
	<p class="title">{title}</p>
	<dl class="list">
		{#each items as item (item.label)}
			<dt>{item.value}</dt>
			<dd>{item.label}</dd>
		{/each}
	</dl>
</div>

<style>
	.milestones {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-content: start;
		gap: var(--space-20) 0;
		padding-top: var(--space-12);
		border-top: 1px solid var(--grey-200);
	}
	.title {
		grid-column: 1 / -1;
		margin: 0;
	}
	.list {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		margin: 0;
	}
	dt {
		grid-column: 1;
	}
	dd {
		grid-column: 2 / -1;
		margin: 0;
		color: var(--grey-700);
	}
</style>
