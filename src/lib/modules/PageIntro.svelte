<!--
	@component
	The title block that opens a page: a hairline across the grid, the page's
	name under it. `tone="dark"` on dark pages (Updates).
-->
<script lang="ts">
	let {
		title,
		tone = 'light'
	}: {
		title: string;
		/** `dark`: the hairline in Grey 800, for dark pages. */
		tone?: 'light' | 'dark';
	} = $props();
</script>

<div class="intro" class:dark={tone === 'dark'}>
	<h1 class="type-h2">{title}</h1>
</div>

<style>
	.intro {
		padding-top: var(--space-16);
		border-top: 1px solid var(--grey-200);
	}
	.dark {
		border-top-color: var(--grey-800);
	}
	h1 {
		margin: 0;
	}
</style>
