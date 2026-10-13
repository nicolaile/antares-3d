<!--
	@component
	The title block that opens a light page: its name, then a line about it.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';

	let { title, intro }: { title: string; intro: string } = $props();
</script>

<Row>
	<Cell span={4} tablet={{ span: 6 }}>
		<div class="intro type-h5">
			<h1>{title}</h1>
			<p>{intro}</p>
		</div>
	</Cell>
</Row>

<style>
	/* Only the name is the heading; the line under it is set the same. */
	.intro h1,
	.intro p {
		margin: 0;
	}
	.intro p {
		color: var(--grey-700);
	}
</style>
