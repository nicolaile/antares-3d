<!--
	@component
	A labelled set of points: the label on its own line, then up to three
	points under it, three columns each (4–6, 7–9, 10–12), each a title over
	a short paragraph. Stacks to two columns on tablet and one on phones.
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
	<Cell span={12}>
		<h2 class="label type-h4">{label}</h2>
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
	/* Kept off the next column's edge, so the paragraphs wrap shorter and
	   read as separate columns rather than one run of text. */
	.point {
		padding-right: var(--space-40);
	}
	.text {
		color: var(--grey-700);
	}
</style>
