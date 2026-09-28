<script lang="ts">
	import '../app.css';
	import '$lib/styles/colors.css';
	import '$lib/styles/spacing.css';
	import '$lib/styles/typography.css';
	import favicon from '$lib/assets/favicon.svg';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
