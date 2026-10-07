<script lang="ts">
	import Grid from '$lib/components/Grid.svelte';
	import DownloadCard from '$lib/components/DownloadCard.svelte';
	import Capabilities from '$lib/modules/Capabilities.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import ProductCard from '$lib/modules/ProductCard.svelte';
	import Summary from '$lib/modules/Summary.svelte';
	import WordCycle from '$lib/modules/WordCycle.svelte';
	import { missions } from '$lib/content/missions';
	import { footer } from '$lib/content/site';

	const { title, intro, cycle, summary, applications, product, specs } = missions;
</script>

<svelte:head>
	<title>Missions — Antares</title>
	<meta name="description" content={intro} />
</svelte:head>

<Grid visible={false} />

<main class="missions">
	<div class="intro"><PageIntro {title} {intro} /></div>

	<WordCycle {...cycle} />

	<div class="body">
		<Summary {...summary} />
		<Capabilities {...applications} />
		<ProductCard {...product} />
		<DownloadCard {...specs} />
	</div>
</main>

<Footer {...footer} />

<style>
	/* The intro and everything after the band on the grid's margins; the
	   band runs edge to edge. */
	.missions {
		display: grid;
		padding-bottom: var(--space-120);
	}
	.intro,
	.body {
		padding-inline: var(--grid-margin);
	}
	.intro {
		padding-top: var(--space-160);
		padding-bottom: var(--space-160);
	}
	.body {
		display: grid;
		gap: var(--space-120);
		padding-top: var(--space-80);
	}
</style>
