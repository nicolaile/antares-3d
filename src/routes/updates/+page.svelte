<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { tick } from 'svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import UpdateCard from '$lib/components/cards/UpdateCard.svelte';
	import DownloadCard from '$lib/components/cards/DownloadCard.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
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

<Seo title="Updates" description={intro} />

<main id="content" tabindex="-1" class="updates" data-tone="dark">
	<PageIntro {title} tone="dark" />

	<section aria-label="All updates" bind:this={list}>
		<ul class="list">
			{#each items.slice(0, shown) as item, i (i)}
				<li><UpdateCard {...item} /></li>
			{/each}
		</ul>
	</section>

	{#if shown < items.length}
		<button class="more type-body-default" type="button" onclick={loadMore}>
			Load more
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<path d="M6 0v12M0 6h12" />
			</svg>
		</button>
	{/if}

	<div class="press"><DownloadCard {...pressKit} tone="dark" /></div>
</main>

<Footer {...footer} tone="black" />

<style>
	/* The whole page is dark, html included, so overscroll doesn't flash white. */
	:global(html:has(main.updates)) {
		background: var(--black);
	}

	.updates {
		display: grid;
		padding: var(--space-120) var(--grid-margin) var(--space-160);
		background: var(--black);
		color: var(--white);
	}

	section {
		margin-top: var(--space-120);
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
		margin-top: var(--space-160);
	}
</style>
