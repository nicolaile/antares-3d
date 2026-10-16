<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import PositionsCarousel from '$lib/modules/PositionsCarousel.svelte';
	import OperatingModel from '$lib/modules/OperatingModel.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import Slideshow from '$lib/modules/Slideshow.svelte';
	import { careers } from '$lib/content/careers';
	import { footer } from '$lib/content/site';
	import { smoothScroll } from '$lib/motion/scroll';

	const { title, intro, image, heroText, openings, positions, quote, why, life } = careers;

	const shown = positions.items.slice(0, positions.featured);

	smoothScroll();
</script>

<Seo title="Careers" description={intro} />

<main id="content" tabindex="-1">
	<div class="careers">
		<div class="head">
			<PageIntro {title} />
		</div>

		<!-- Edge to edge, a line and a link to the openings over its foot. -->
		<div class="hero" data-tone="dark">
			<Picture {...image} ratio="20 / 9" sizes="100vw" loading="eager" />
			<div class="hero-body">
				<p class="hero-text type-body-default">{heroText}</p>
				<CtaButton {...openings} arrow={false} tone="dark" />
			</div>
		</div>

		<div class="positions">
			<PositionsCarousel label={positions.label} items={shown} all={positions.all} />
		</div>

		<figure class="quote">
			<div class="quote-image">
				<Picture {...quote.image} ratio="2880 / 1494" sizes="100vw" />
			</div>
			<figcaption class="quote-body">
				<blockquote class="quote-text type-h5">{quote.text}</blockquote>
				<p class="quote-name type-caption">
					{quote.name}
					<span>{quote.role}</span>
				</p>
			</figcaption>
		</figure>

		<div class="why">
			<OperatingModel {...why} />
		</div>
	</div>

	<Slideshow {...life} />
</main>

<Footer {...footer} />

<style>
	.careers {
		display: grid;
		padding-bottom: var(--space-160);
	}

	/* Everything but the hero and the founder band sits on the grid's
	   margins; those two run edge to edge. */
	.head,
	.positions,
	.why {
		padding-inline: var(--grid-margin);
	}

	.head {
		padding-top: var(--space-120);
	}
	.hero {
		position: relative;
		margin-top: var(--space-120);
	}
	.hero-body {
		position: absolute;
		bottom: var(--space-48);
		left: var(--grid-margin);
		display: grid;
		justify-items: start;
		gap: var(--space-40);
		width: min(calc(100% - 2 * var(--grid-margin)), calc(var(--size-font) * 23));
	}
	.hero-text {
		margin: 0;
		color: var(--grey-200);
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
