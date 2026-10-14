<!--
	@component
	A short titled paragraph set to the right of the grid.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';

	let { title, text }: { title: string; text: string } = $props();
</script>

<Row as="section">
	<Cell start={7} span={5} tablet={{ start: 5, span: 8 }}>
		<h2 class="title type-sub-headline">{title}</h2>
		<p class="text type-body-default">{text}</p>
	</Cell>
</Row>

<style>
	.title,
	.text {
		margin: 0;
	}
	.text {
		margin-top: var(--space-16);
		color: var(--grey-700);
	}
</style>
