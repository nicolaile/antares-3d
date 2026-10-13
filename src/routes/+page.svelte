<script lang="ts">
	import Hero from '$lib/sections/home/Hero.svelte';
	import MissionIntro from '$lib/sections/home/MissionIntro.svelte';
	import R1Microreactor from '$lib/sections/home/R1Microreactor.svelte';
	import OperatingModel from '$lib/modules/OperatingModel.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import Capabilities from '$lib/modules/Capabilities.svelte';
	import PosterCard from '$lib/components/cards/PosterCard.svelte';
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


<Hero {...hero} />

<main class="page">
	<MissionIntro {...mission} />
	<R1Microreactor {...r1} />
	<Capabilities {...capabilities} />
	<FeatureCards {...graphite} />
	<div class="operating"><OperatingModel {...operating} /></div>
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
	/* A little more room after the graphite cards than the page's usual
	   gap, so the operating model opens a new part of the page. */
	.operating {
		padding-top: var(--space-48);
	}
</style>
