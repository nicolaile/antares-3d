<script lang="ts">
	import Grid from '$lib/components/Grid.svelte';
	import MissionIntro from '$lib/sections/MissionIntro.svelte';
	import R1Microreactor from '$lib/sections/R1Microreactor.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import { mission, r1 } from '$lib/content/home';
	import { footer } from '$lib/content/site';
</script>

<svelte:head>
	<title>Antares — R1 Microreactor</title>
	<meta
		name="description"
		content="Antares builds compact nuclear microreactors for reliable, mobile energy in remote military bases, industrial sites, and future space and underwater missions."
	/>
</svelte:head>

<Grid visible={false} />

<main class="page">
	<MissionIntro {...mission} />
	<R1Microreactor {...r1} />
</main>

<Footer {...footer} />

<style>
	.page {
		display: grid;
		gap: var(--space-120);
		padding: var(--space-60) var(--grid-margin) var(--space-160);
	}
</style>
