<!--
	An article: category and headline on columns 4–9, the hero image across
	3–10, then the date on the left and the body on 4–9 again. The body is
	paragraphs, headings and captioned figures, spaced by what follows what.
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
</script>

<svelte:head>
	<title>{article.title} — Antares</title>
	<meta name="description" content={article.title} />
</svelte:head>

<Grid visible={false} />

<main class="article">
	<Row as="header">
		<Cell start={4} span={6} tablet={{ start: 2, span: 10 }}>
			<p class="category type-caption">{article.category}</p>
			<h1 class="title type-h3">{article.title}</h1>
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
		<Row align="baseline" gap={24}>
			<Cell span={3} tablet={{ span: 12 }}>
				<time class="date type-caption" datetime={date.iso}>{date.long}</time>
			</Cell>
			<Cell start={4} span={6} tablet={{ start: 2, span: 10 }}>
				<div class="body">
					{#each article.body as block, i (i)}
						{#if block.type === 'paragraph'}
							<p class="type-paragraph">{block.text}</p>
						{:else if block.type === 'heading'}
							<h2 class="type-h5">{block.text}</h2>
						{:else}
							<figure>
								<div class="figure-image">
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
		padding: var(--space-120) var(--grid-margin) var(--space-160);
	}

	.category,
	.title {
		margin: 0;
	}
	.title {
		margin-top: var(--space-16);
	}

	.hero {
		margin-top: var(--space-64);
	}
	.hero-image {
		overflow: hidden;
		border-radius: var(--card-radius);
	}

	.content {
		margin-top: var(--space-80);
	}
	.date {
		display: block;
		color: var(--grey-700);
	}

	/* Blocks stack with a paragraph's space between them; headings open a
	   new section well clear of what's above and sit close to their copy;
	   figures stand off on both sides. */
	.body > * {
		margin: 0;
	}
	/* Body copy a step softer than the headings. */
	.body p {
		color: var(--grey-800);
	}
	.body > * + * {
		margin-top: var(--space-24);
	}
	.body > * + h2 {
		margin-top: var(--space-64);
	}
	.body > h2 + * {
		margin-top: var(--space-16);
	}
	.body > * + figure,
	.body > figure + * {
		margin-top: var(--space-96);
	}
	.figure-image {
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	/* Four of the body's six columns, so it wraps shorter than the copy. */
	figcaption {
		max-width: calc(
			(100% - 5 * var(--grid-gutter)) / 6 * 4 + 3 * var(--grid-gutter)
		);
		margin-top: var(--space-16);
		color: var(--grey-700);
	}
	.label {
		color: var(--grey-950);
	}

	@media screen and (max-width: 767px) {
		figcaption {
			max-width: none;
		}
	}
</style>
