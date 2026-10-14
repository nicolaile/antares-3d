<!--
	@component
	A legal page (Terms, Privacy), footer included. Content comes from
	`$lib/content/legal`.
-->
<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import { smoothScroll } from '$lib/motion/scroll';
	import { footer } from '$lib/content/site';

	let { title, description, updated, body }: import('$lib/content/legal').LegalPage = $props();

	const iso = $derived(updated.split('.').reverse().join('-'));

	smoothScroll();
</script>

<Seo {title} {description} />

<main id="content" tabindex="-1" class="legal">
	<Row>
		<Cell start={4} span={6} tablet={{ start: 2, span: 10 }}>
			<header>
				<p class="updated type-caption">
					Updated <time datetime={iso}>{updated}</time>
				</p>
				<h1 class="title type-h3">{title}</h1>
			</header>

			<div class="body">
				{#each body as paragraph, i (i)}
					<p class="type-body-large">{paragraph}</p>
				{/each}
			</div>
		</Cell>
	</Row>
</main>

<Footer {...footer} />

<style>
	.legal {
		display: grid;
		padding: var(--space-160) var(--grid-margin);
	}

	.updated {
		margin: 0;
		color: var(--black);
	}
	.title {
		margin: var(--space-24) 0 0;
	}

	.body {
		margin-top: var(--space-64);
	}
	.body p {
		margin: 0;
		color: var(--grey-900);
	}
	.body p + p {
		margin-top: var(--space-24);
	}
</style>
