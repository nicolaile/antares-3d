<script lang="ts">
	import Grid from '$lib/components/Grid.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import PositionsCarousel from '$lib/modules/PositionsCarousel.svelte';
	import OperatingModel from '$lib/sections/OperatingModel.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import Slideshow from '$lib/modules/Slideshow.svelte';
	import { careers } from '$lib/content/careers';
	import { footer } from '$lib/content/site';

	const { title, intro, image, positions, quote, why, life } = careers;

	const shown = positions.items.slice(0, positions.featured);
</script>

<svelte:head>
	<title>Careers — Antares</title>
	<meta name="description" content={intro} />
</svelte:head>

<Grid visible={false} />

<main class="careers">
	<div class="head">
		<PageIntro {title} {intro} />

		<div class="hero">
			<Picture {...image} ratio="20 / 9" sizes="100vw" loading="eager" />
		</div>
	</div>

	<div class="positions">
		<PositionsCarousel label={positions.label} items={shown} total={positions.items.length} all={positions.all} />
	</div>

	<figure class="quote">
		<div class="quote-image">
			<Picture {...quote.image} ratio="2880 / 1494" sizes="100vw" />
		</div>
		<figcaption class="quote-body">
			<blockquote class="quote-text type-h3">{quote.text}</blockquote>
			<p class="quote-name type-caption">
				{quote.name}
				<span>{quote.role}</span>
			</p>
		</figcaption>
	</figure>

	<div class="why">
		<OperatingModel {...why} />
	</div>
</main>

<Slideshow {...life} />

<Footer {...footer} />

<style>
	.careers {
		display: grid;
		padding-bottom: var(--space-160);
	}

	/* Everything but the founder band sits on the grid's margins; the band
	   runs edge to edge. */
	.head,
	.positions,
	.why {
		padding-inline: var(--grid-margin);
	}

	.head {
		padding-top: var(--space-160);
	}
	.hero {
		margin-top: var(--space-48);
		overflow: hidden;
		border-radius: var(--card-radius);
	}

	.positions {
		min-width: 0;
		margin-top: var(--space-80);
	}
	/* The quote sits over the light left side of the portrait, its copy
	   on columns 1–5, inset 80px: a little short of column 2. */
	.quote {
		display: grid;
		margin: var(--space-120) 0 0;
	}
	.quote-image,
	.quote-body {
		grid-area: 1 / 1;
	}
	/* Positioned, so it paints over the (positioned) picture. */
	.quote-body {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		align-content: start;
		padding: var(--space-96) var(--grid-margin) 0;
	}
	.quote-text,
	.quote-name {
		grid-column: 1 / span 5;
		margin: 0;
		padding-left: var(--space-80);
	}
	.quote-name {
		margin-top: var(--space-24);
	}
	.quote-name span {
		display: block;
		color: var(--grey-700);
	}

	.why {
		margin-top: var(--space-120);
	}

	@media screen and (max-width: 991px) {
		.quote-body {
			padding-top: var(--space-64);
		}
		.quote-text,
		.quote-name {
			grid-column: 2 / span 6;
			padding-left: 0;
		}
	}

	/* Too narrow to set the quote over the portrait: it comes first, the
	   portrait under it, cropped taller so he still fills the frame. */
	@media screen and (max-width: 767px) {
		.quote-body {
			grid-area: 1 / 1;
			padding-top: 0;
		}
		.quote-image {
			grid-area: 2 / 1;
			margin-top: var(--space-40);
		}
		.quote-image :global(.picture) {
			aspect-ratio: 4 / 5 !important;
		}
		.quote-image :global(img) {
			object-position: 70% center;
		}
		.quote-text,
		.quote-name {
			grid-column: 1 / -1;
			padding-left: 0;
		}
	}
</style>
