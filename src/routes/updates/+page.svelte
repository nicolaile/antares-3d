<script lang="ts">
	import { tick } from 'svelte';
	import Grid from '$lib/components/Grid.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import UpdateCard from '$lib/components/UpdateCard.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import { updates } from '$lib/content/updates';
	import { footer } from '$lib/content/site';

	const { title, intro, items, pageSize, pressKit } = updates;

	let shown = $state(pageSize);
	let list: HTMLElement;

	/** Shows the next page of items, rising in one after another. */
	async function loadMore() {
		const from = shown;
		shown = Math.min(items.length, shown + pageSize);
		await tick();
		if (prefersReducedMotion()) return;
		const added = [...list.querySelectorAll('li')].slice(from);
		gsap.from(added, { opacity: 0, y: 24, duration: 0.8, ease: 'power3.out', stagger: 0.05 });
	}
</script>

<svelte:head>
	<title>Updates — Antares</title>
	<meta name="description" content={intro} />
</svelte:head>

<Grid visible={false} />

<main class="updates">
	<Row>
		<Cell span={4} tablet={{ span: 6 }}>
			<h1 class="intro type-h5">
				{title}
				<span class="secondary">{intro}</span>
			</h1>
		</Cell>
	</Row>

	<section aria-label="All updates" bind:this={list}>
		<ul class="list">
			{#each items.slice(0, shown) as item, i (i)}
				<li><UpdateCard {...item} /></li>
			{/each}
		</ul>
	</section>

	{#if shown < items.length}
		<button class="more type-small" type="button" onclick={loadMore}>
			Load more
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<path d="M6 0v12M0 6h12" />
			</svg>
		</button>
	{/if}

	<a class="press" href={pressKit.href}>
		<div class="press-image" aria-hidden="true"></div>
		<div class="press-body">
			<div>
				<p class="press-title type-paragraph">{pressKit.title}</p>
				<p class="press-size type-caption">{pressKit.size}</p>
			</div>
			<span class="press-download type-caption">
				Download
				<svg viewBox="0 0 12 12" aria-hidden="true">
					<path d="M6 0v11M1 6l5 5 5-5" />
				</svg>
			</span>
		</div>
	</a>
</main>

<Footer {...footer} tone="dark" />

<style>
	/* The whole page is dark, html included, so overscroll doesn't flash white. */
	:global(html:has(main.updates)) {
		background: var(--grey-850);
	}

	.updates {
		display: grid;
		padding: var(--space-120) var(--grid-margin) var(--space-160);
		background: var(--grey-850);
		color: var(--grey-0);
	}

	.intro {
		margin: 0;
	}
	.secondary {
		display: block;
		color: var(--grey-400);
	}

	section {
		margin-top: var(--space-160);
	}
	/* Three up, four columns each (456px at 1440), on the page's gutter.
	   Two up on tablet, one on mobile. */
	.list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-128) var(--grid-gutter);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@media screen and (max-width: 991px) {
		.list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media screen and (max-width: 767px) {
		.list {
			grid-template-columns: minmax(0, 1fr);
			row-gap: var(--space-64);
		}
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--space-64);
		padding: var(--space-24);
		border: 1px solid var(--grey-800);
		border-radius: var(--stage-radius);
		background: none;
		color: inherit;
		cursor: pointer;
	}
	.more:hover {
		border-color: var(--grey-700);
	}

	svg {
		width: calc(var(--size-font) * 0.75);
		height: calc(var(--size-font) * 0.75);
		fill: none;
		stroke: currentColor;
		stroke-width: 1;
	}

	.press {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		margin-top: var(--space-160);
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--grey-800);
		color: inherit;
		text-decoration: none;
	}
	.press:focus-visible,
	.more:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: 2px;
	}
	.press-image {
		grid-column: span 3;
		aspect-ratio: 340 / 228;
		background: var(--grey-700);
	}
	.press-body {
		grid-column: span 9;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: var(--space-24) var(--space-24) var(--space-24) 0;
	}
	.press-title,
	.press-size {
		margin: 0;
	}
	.press-size {
		margin-top: var(--space-24);
		color: var(--grey-400);
	}
	.press-download {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		align-self: end;
		color: var(--grey-400);
	}
	.press-download svg {
		stroke: var(--accent-500);
	}
	.press:hover .press-download {
		color: var(--grey-0);
	}

	@media screen and (max-width: 767px) {
		.press-image,
		.press-body {
			grid-column: 1 / -1;
		}
		.press-image {
			aspect-ratio: 16 / 9;
		}
		.press-body {
			gap: var(--space-40);
			padding: var(--space-24);
		}
	}
</style>
