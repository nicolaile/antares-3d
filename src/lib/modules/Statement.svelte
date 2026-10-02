<!--
	@component
	A large statement, optionally with a short label: when there is one, the
	statement's first line is indented to clear it by whole columns. Place in
	a full-width (12-column) cell: the indent is measured against the full row.
-->
<script lang="ts">
	import type { Column } from '$lib/layout/types';

	let {
		label,
		text,
		indent = 2
	}: {
		label?: string;
		text: string;
		/** Columns the first line clears for the label. */
		indent?: Column;
	} = $props();
</script>

<div class="statement" style:--indent={label ? indent : 0}>
	{#if label}<p class="label type-body">{label}</p>{/if}
	<p class="text type-h3">{text}</p>
</div>

<style>
	.statement {
		display: grid;
	}
	/* Both in the same cell: the label sits in the space the indent leaves. */
	.label,
	.text {
		grid-area: 1 / 1;
		margin: 0;
	}
	/* `indent` columns plus the gutters after them, as a share of the row. */
	.text {
		text-indent: calc(
			(100% - (var(--grid-columns) - 1) * var(--grid-gutter)) / var(--grid-columns) * var(--indent) +
				var(--indent) * var(--grid-gutter)
		);
	}

	/* Two columns are too narrow for the label on phones: stack instead. */
	@media screen and (max-width: 767px) {
		.statement {
			gap: var(--space-24);
		}
		.label,
		.text {
			grid-area: auto;
		}
		.text {
			text-indent: 0;
		}
	}
</style>
