<!--
	An article: date and headline on columns 4–8, the hero image across
	3–10, then the body on 4–9 again. The body is a lead, paragraphs,
	headings, quotes, lists, key-figure cards, captioned figures and films,
	spaced by what follows what.
-->
<script lang="ts">
	import Grid from '$lib/components/Grid.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import { formatDate } from '$lib/content/articles';
	import { footer } from '$lib/content/site';

	let { data } = $props();
	const article = $derived(data.article);
	const date = $derived(formatDate(article.date));

	/** Upright pictures run narrower, so they don't fill the screen. */
	const portrait = (ratio: string) => {
		const [w, h] = ratio.split('/').map(Number);
		return w < h;
	};
</script>

<svelte:head>
	<title>{article.title} — Antares</title>
	<meta name="description" content={article.title} />
</svelte:head>

<Grid visible={false} />

<main class="article">
	<Row as="header">
		<Cell start={4} span={5} tablet={{ start: 2, span: 10 }}>
			<time class="date type-caption" datetime={date.iso}>{date.text}</time>
			<h1 class="title type-h2">{article.title}</h1>
		</Cell>
	</Row>

	<div class="hero">
		<Row>
			<Cell start={3} span={8} tablet={{ start: 1, span: 12 }}>
				<div class="hero-image">
					<Picture
						{...article.image}
						ratio="16 / 9"
						sizes="(max-width: 991px) 100vw, 65vw"
						loading="eager"
					/>
				</div>
			</Cell>
		</Row>
	</div>

	<div class="content">
		<Row>
			<Cell start={4} span={6} tablet={{ start: 2, span: 10 }}>
				<div class="body">
					{#each article.body as block, i (i)}
						{#if block.type === 'lead'}
							<p class="lead type-h4">{block.text}</p>
						{:else if block.type === 'paragraph'}
							<p class="type-body-large">{@html block.html}</p>
						{:else if block.type === 'heading'}
							<h2 class="type-h4">{block.text}</h2>
						{:else if block.type === 'quote'}
							<blockquote class="type-h3">
								{#each block.html as line, j (j)}
									<p>{@html line}</p>
								{/each}
							</blockquote>
						{:else if block.type === 'list'}
							<svelte:element this={block.ordered ? 'ol' : 'ul'} class="list type-body-large">
								{#each block.items as item, j (j)}
									<li>{@html item}</li>
								{/each}
							</svelte:element>
						{:else if block.type === 'stat'}
							<div class="stat">
								<p class="stat-value type-h1">{block.value}</p>
								<p class="stat-text type-annotation">{block.text}</p>
							</div>
						{:else if block.type === 'figure'}
							<figure class:portrait={portrait(block.ratio)}>
								<div class="media">
									<Picture
										{...block.image}
										ratio={block.ratio}
										sizes="(max-width: 991px) 100vw, 48vw"
									/>
								</div>
								{#if block.caption}
									<figcaption class="type-annotation">
										{#if block.label}<span class="label">{block.label}</span>{/if}
										{block.caption}
									</figcaption>
								{/if}
							</figure>
						{:else if block.type === 'video'}
							<figure>
								<div class="media">
									{#if 'youtube' in block}
										<iframe
											class="film"
											src="https://www.youtube-nocookie.com/embed/{block.youtube}?rel=0&modestbranding=1&playsinline=1"
											title={article.title}
											loading="lazy"
											allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
										></iframe>
									{:else}
										<video src={block.src} autoplay muted loop playsinline></video>
									{/if}
								</div>
							</figure>
						{/if}
					{/each}
				</div>
			</Cell>
		</Row>
	</div>
</main>

<Footer {...footer} />

<style>
	.article {
		display: grid;
		padding: var(--space-160) var(--grid-margin);
	}

	.date {
		display: block;
		color: var(--grey-950);
	}
	.title {
		margin: var(--space-24) 0 0;
	}

	.hero {
		margin-top: var(--space-64);
	}
	.hero-image {
		overflow: hidden;
		border-radius: var(--card-radius);
	}

	.content {
		margin-top: var(--space-64);
	}

	/* Blocks stack with a paragraph's space between them. The lead and
	   headings sit close to their copy, headings well clear of what's above;
	   quotes stand off a little, and cards, figures and films further. */
	.body > * {
		margin: 0;
	}
	.body > * + * {
		margin-top: var(--space-24);
	}
	.body > .lead + * {
		margin-top: var(--space-32);
	}
	.body > * + h2 {
		margin-top: var(--space-64);
	}
	.body > h2 + * {
		margin-top: var(--space-16);
	}
	.body > * + blockquote,
	.body > blockquote + * {
		margin-top: var(--space-48);
	}
	.body > * + .stat,
	.body > .stat + *,
	.body > * + figure,
	.body > figure + * {
		margin-top: var(--space-96);
	}
	.body > figure + figure {
		margin-top: var(--space-24);
	}

	/* Running copy a step softer than the lead, headings and quotes. */
	.body p,
	.list {
		color: var(--grey-800);
	}
	.body .lead,
	.body h2,
	.body blockquote p {
		color: var(--grey-950);
	}
	.body :global(a) {
		color: inherit;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.15em;
	}
	.body :global(a:hover) {
		color: var(--grey-700);
	}

	blockquote {
		padding-left: var(--space-48);
	}
	blockquote p {
		margin: 0;
	}
	blockquote p + p {
		margin-top: var(--space-16);
	}

	.list {
		padding-left: var(--space-24);
	}
	.list li + li {
		margin-top: var(--space-16);
	}
	.list li::marker {
		color: var(--grey-700);
	}

	/* An outlined card: the figure at the top, its note at the foot. */
	.stat {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-48);
		/* 232px at 1440. */
		min-height: calc(var(--size-font) * 14.5);
		box-sizing: border-box;
		padding: var(--space-24);
		border: 1px solid var(--grey-200);
		border-radius: var(--card-radius);
	}
	.body .stat-value {
		margin: 0;
		color: var(--grey-950);
	}
	.body .stat-text {
		max-width: 20em;
		margin: 0;
		color: var(--grey-700);
	}

	.media {
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	.film,
	video {
		display: block;
		width: 100%;
		border: 0;
	}
	.film {
		aspect-ratio: 16 / 9;
	}
	/* Four of the body's six columns, so it wraps shorter than the copy;
	   upright pictures run the same width. */
	figcaption,
	.portrait .media {
		max-width: calc((100% - 5 * var(--grid-gutter)) / 6 * 4 + 3 * var(--grid-gutter));
	}
	figcaption {
		margin-top: var(--space-16);
		color: var(--grey-700);
	}
	.label {
		color: var(--grey-950);
	}

	@media screen and (max-width: 767px) {
		blockquote {
			padding-left: var(--space-24);
		}
		figcaption,
		.portrait .media {
			max-width: none;
		}
	}
</style>
