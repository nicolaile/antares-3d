<!--
	@component
	A label beside up to three points, each a title over a short paragraph.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import type { Column } from '$lib/layout/types';

	const START: Column[] = [4, 7, 10];

	let {
		label,
		points
	}: {
		label: string;
		points: { title: string; text: string }[];
	} = $props();
</script>

<Row as="section" gap={48} align="start">
	<Cell span={3} tablet={{ span: 12 }}>
		<h2 class="label type-h5">{label}</h2>
	</Cell>
	{#each points.slice(0, 3) as point, i (i)}
		<Cell start={START[i]} span={3} tablet={{ start: i % 2 ? 7 : 1, span: 6 }}>
			<div class="point type-body-default">
				<h3 class="title">{point.title}</h3>
				<p class="text">{point.text}</p>
			</div>
		</Cell>
	{/each}
</Row>

<style>
	.label,
	.title,
	.text {
		margin: 0;
	}
	/* So adjacent paragraphs read as separate columns, not one run of text. */
	.point {
		padding-right: var(--space-40);
	}
	.text {
		color: var(--grey-700);
	}
</style>
