<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
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

<Seo />

<main id="content" tabindex="-1">
	<Hero {...hero} />

	<div class="page">
		<MissionIntro {...mission} />
		<R1Microreactor {...r1} />
		<Capabilities {...capabilities} />
		<FeatureCards {...graphite} />
		<OperatingModel {...operating} />
		<div class="poster"><PosterCard {...progress} /></div>
	</div>
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
	/* 180px above the poster in all: the page's gap plus 60. */
	.poster {
		padding-top: calc(var(--space-40) + var(--space-20));
	}
</style>
