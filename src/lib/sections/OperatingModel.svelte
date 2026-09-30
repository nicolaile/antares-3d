<!--
	@component
	A labelled row of points: the label on columns 1–3, then up to three
	points of three columns each (4–6, 7–9, 10–12), each a title over a
	short paragraph. Stacks to two columns on tablet and one on phones.
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

<Row as="section" gap={40} align="start">
	<Cell span={3} tablet={{ span: 12 }}>
		<h2 class="label type-body">{label}</h2>
	</Cell>
	{#each points.slice(0, 3) as point, i (i)}
		<Cell start={START[i]} span={3} tablet={{ start: i % 2 ? 7 : 1, span: 6 }}>
			<div class="point type-body">
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
	/* Kept off the next column's edge, so the paragraphs wrap shorter and
	   read as separate columns rather than one run of text. */
	.point {
		padding-right: var(--space-40);
	}
	.text {
		color: var(--grey-700);
	}
</style>
