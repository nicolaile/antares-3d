<!--
	@component
	"Recent articles": a label, then three update cards in a row (two on a
	tablet, one on a phone), as on the updates page. Under an article, on a
	light page; give it the stories to show (articles.ts `recentArticles`).
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import UpdateCard from '$lib/components/UpdateCard.svelte';
	import type { UpdateItem } from '$lib/content/updates';

	let {
		label = 'Recent articles',
		items,
		tone = 'light'
	}: {
		label?: string;
		items: UpdateItem[];
		/** The page it sits on (UpdateCard's `tone`). */
		tone?: 'dark' | 'light';
	} = $props();
</script>

{#if items.length}
	<section class="recent" aria-labelledby="recent-label">
		<Row>
			<Cell span={12}>
				<h2 id="recent-label" class="label type-caption">{label}</h2>
			</Cell>
		</Row>
		<ul class="list">
			{#each items as item (item.href)}
				<li><UpdateCard {...item} {tone} /></li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	/* The page's 160px to the footer under it. */
	.recent {
		padding: 0 var(--grid-margin) var(--space-160);
	}
	.label {
		margin: 0 0 var(--space-24);
	}
	.list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-64) var(--grid-gutter);
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
		}
	}
</style>
