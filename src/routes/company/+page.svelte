<script lang="ts">
	import Grid from '$lib/components/Grid.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import FeatureCards from '$lib/modules/FeatureCards.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import PersonPanel from '$lib/modules/PersonPanel.svelte';
	import Slideshow from '$lib/modules/Slideshow.svelte';
	import Summary from '$lib/modules/Summary.svelte';
	import { company } from '$lib/content/company';
	import { footer } from '$lib/content/site';

	const { title, intro, leadership, slideshow, summary, culture } = company;

	let panel: PersonPanel;
</script>

<svelte:head>
	<title>Company — Antares</title>
	<meta name="description" content={intro} />
</svelte:head>

<Grid visible={false} />

<PersonPanel bind:this={panel}>
	<main class="company">
		<PageIntro {title} {intro} />

		<section class="leadership" aria-labelledby="leadership-label">
			<h2 id="leadership-label" class="label type-body-default">{leadership.label}</h2>
			<ul class="people">
				{#each leadership.people as person, i (i)}
					<li><PersonCard {...person} onclick={() => panel.show(person)} /></li>
				{/each}
			</ul>
		</section>
	</main>

	<Slideshow {...slideshow} />

	<div class="culture">
		<Summary {...summary} />
		<div class="operations"><FeatureCards {...culture} /></div>
	</div>

	<Footer {...footer} />
</PersonPanel>

<style>
	.company {
		display: grid;
		padding: var(--space-160) var(--grid-margin) var(--space-96);
	}

	.leadership {
		margin-top: var(--space-160);
	}

	.culture {
		padding: var(--space-120) var(--grid-margin) var(--space-128);
	}
	.operations {
		margin-top: var(--space-160);
	}
	.label {
		margin: 0;
	}
	/* Four up, three columns each (338px at 1440), on the page's gutter.
	   Three up on tablet, two on phones. */
	.people {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-64) var(--grid-gutter);
		margin: var(--space-40) 0 0;
		padding: 0;
		list-style: none;
	}
	@media screen and (max-width: 991px) {
		.people {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media screen and (max-width: 767px) {
		.people {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			row-gap: var(--space-40);
		}
	}
</style>
