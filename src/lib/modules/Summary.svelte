<!--
	@component
	A short titled paragraph set to the right: the title over a paragraph in
	the secondary grey, on columns 7–11 (the right half on tablet, full width
	on phones).
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';

	let { title, text }: { title: string; text: string } = $props();
</script>

<Row as="section">
	<Cell start={7} span={5} tablet={{ start: 5, span: 8 }}>
		<h2 class="title type-body-large">{title}</h2>
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
