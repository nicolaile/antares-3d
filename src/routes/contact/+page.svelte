<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import DownloadCard from '$lib/components/cards/DownloadCard.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import { contact } from '$lib/content/contact';
	import { footer } from '$lib/content/site';

	const { title, intro, inquiries, pressKit } = contact;
</script>

<Seo title="Contact" description={intro} />

<main id="content" tabindex="-1" class="contact" data-tone="dark">
	<PageIntro {title} tone="dark" />

	<section aria-label="Inquiries">
		<ul class="inquiries type-body-default">
			{#each inquiries as { label, email } (label)}
				<li>
					{label}
					<a href="mailto:{email}">{email}</a>
				</li>
			{/each}
		</ul>
	</section>

	<div class="press"><DownloadCard {...pressKit} tone="dark" prompt="icon" /></div>
</main>

<Footer {...footer} tone="black" />

<style>
	/* The whole page is dark, html included, so overscroll doesn't flash white. */
	:global(html:has(main.contact)) {
		background: var(--black);
	}

	.contact {
		display: grid;
		padding: var(--space-120) var(--grid-margin) var(--space-160);
		background: var(--black);
		color: var(--white);
	}

	section {
		margin-top: var(--space-120);
	}
	.inquiries {
		display: grid;
		gap: var(--space-20);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a {
		display: block;
		width: fit-content;
		color: var(--grey-400);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.15em;
	}
	a:hover {
		color: var(--white);
	}
	a:focus-visible {
		outline: 1px solid var(--white);
		outline-offset: 2px;
	}

	.press {
		margin-top: var(--space-120);
	}
</style>
