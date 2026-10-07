<script lang="ts">
	import Grid from '$lib/components/Grid.svelte';
	import Hero from '$lib/sections/Hero.svelte';
	import MissionIntro from '$lib/sections/MissionIntro.svelte';
	import R1Microreactor from '$lib/sections/R1Microreactor.svelte';
	import OperatingModel from '$lib/sections/OperatingModel.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import Capabilities from '$lib/modules/Capabilities.svelte';
	import PosterCard from '$lib/modules/PosterCard.svelte';
	import FeatureCards from '$lib/modules/FeatureCards.svelte';
	import { hero, mission, r1, operating, capabilities, graphite, progress } from '$lib/content/home';
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

<Hero {...hero} />

<main class="page">
	<MissionIntro {...mission} />
	<R1Microreactor {...r1} />
	<Capabilities {...capabilities} />
	<FeatureCards {...graphite} />
	<OperatingModel {...operating} />
	<PosterCard {...progress} />
</main>

<Footer {...footer} />

<style>
	.page {
		display: grid;
		gap: var(--space-120);
		/* One page margin under the hero image, so the copy starts as close
		   to it as it sits to the screen's edge. */
		padding: var(--page-margin) var(--grid-margin) var(--space-160);
	}
</style>
