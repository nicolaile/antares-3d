<!--
	@component
	The title block that opens a light page: the page's name in H5, then a
	line about it in muted grey, on the first four columns (six on tablet).
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';

	let { title, intro }: { title: string; intro: string } = $props();
</script>

<Row>
	<Cell span={4} tablet={{ span: 6 }}>
		<h1 class="intro type-h5">
			{title}
			<span>{intro}</span>
		</h1>
	</Cell>
</Row>

<style>
	.intro {
		margin: 0;
	}
	.intro span {
		display: block;
		color: var(--grey-500);
	}
</style>
