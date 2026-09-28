<script lang="ts">
	import '../app.css';
	import '$lib/styles/colors.css';
	import '$lib/styles/spacing.css';
	import '$lib/styles/typography.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Menu from '$lib/modules/Menu.svelte';
	import { menu } from '$lib/content/site';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Menu {...menu} current={page.url.pathname} />

{@render children?.()}
