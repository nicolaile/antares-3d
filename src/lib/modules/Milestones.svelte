<!--
	@component
	A list of figures: value in the first column, what it measures in the
	rest. With a `title` it sits under a rule, headed; without one it's the
	bare list. `quiet` sets it all in the secondary grey, in Small. Place in
	a `subgrid` cell; it uses that cell's columns.
-->
<script lang="ts">
	let {
		title,
		items,
		quiet = false
	}: {
		title?: string;
		items: { value: string; label: string }[];
		quiet?: boolean;
	} = $props();
</script>

<div class="milestones" class:titled={title} class:quiet class:type-body-large={!quiet} class:type-body-default={quiet}>
	{#if title}<p class="title">{title}</p>{/if}
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
		gap: var(--space-24) 0;
	}
	.titled {
		padding-top: var(--space-16);
		border-top: 1px solid var(--grey-200);
	}
	.quiet {
		color: var(--grey-700);
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

	/* One phone column is too narrow for a figure. */
	@media screen and (max-width: 767px) {
		dt {
			grid-column: 1 / span 4;
		}
		dd {
			grid-column: 5 / -1;
		}
	}
</style>
