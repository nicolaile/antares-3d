<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import DownloadCard from '$lib/components/cards/DownloadCard.svelte';
	import Capabilities from '$lib/modules/Capabilities.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import ProductCard from '$lib/components/cards/ProductCard.svelte';
	import Summary from '$lib/modules/Summary.svelte';
	import WordCycle from '$lib/modules/WordCycle.svelte';
	import { missions } from '$lib/content/missions';
	import { footer } from '$lib/content/site';

	const { title, intro, cycle, summary, applications, product, specs } = missions;
</script>

<Seo title="Missions" description={intro} />

<main id="content" tabindex="-1" class="missions">
	<div class="intro"><PageIntro {title} /></div>

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
		padding-bottom: calc(var(--space-120) + var(--space-20));
	}
	.intro,
	.body {
		padding-inline: var(--grid-margin);
	}
	.intro {
		padding-top: var(--space-120);
		padding-bottom: var(--space-120);
	}
	.body {
		display: grid;
		gap: var(--space-120);
		padding-top: var(--space-80);
	}
</style>
