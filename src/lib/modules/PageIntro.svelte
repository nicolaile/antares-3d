<!--
	@component
	The title block that opens a page: its name, then a line about it.
	`tone="dark"` on dark pages (Updates).
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';

	let {
		title,
		intro,
		tone = 'light'
	}: {
		title: string;
		intro: string;
		/** `dark`: the line in Grey 400, for dark pages. */
		tone?: 'light' | 'dark';
	} = $props();
</script>

<Row>
	<Cell span={4} tablet={{ span: 6 }}>
		<div class="intro type-h5" class:dark={tone === 'dark'}>
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
	.dark p {
		color: var(--grey-400);
	}
</style>
