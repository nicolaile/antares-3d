<!--
	@component
	A file to download, as a card the full width of the grid: its image on
	the first three columns, then its title and size, and a download prompt
	in the bottom-right corner. The whole card is the link. `tone="dark"`
	sets it on the raised dark grey with an underlined "Download" (Updates'
	press kit); light, the default, on the pale grey with a round download
	icon (Missions' specs). The image runs full width above the copy on
	phones.
-->
<script lang="ts">
	import Picture from '$lib/components/Picture.svelte';
	import download from '$lib/assets/icons/download.svg?raw';
	import type { Picture as Source } from 'vite-imagetools';

	let {
		title,
		size,
		image,
		href,
		tone = 'light'
	}: {
		title: string;
		/** The file's size, as shown: "38 MB". */
		size: string;
		image: { src: Source; alt: string };
		href: string;
		tone?: 'light' | 'dark';
	} = $props();
</script>

<a class="card {tone}" {href}>
	<div class="image">
		<Picture {...image} ratio="340 / 228" sizes="(max-width: 767px) 100vw, 24vw" />
	</div>
	<div class="body">
		<div>
			<p class="title type-h4">{title}</p>
			<p class="size type-caption">{size}</p>
		</div>
		{#if tone === 'dark'}
			<span class="label type-body-default">Download</span>
		{:else}
			<span class="icon" aria-hidden="true">{@html download}</span>
		{/if}
	</div>
</a>

<style>
	.card {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--grey-150);
		color: var(--grey-950);
		text-decoration: none;
		--ink: var(--grey-950);
		--muted: var(--grey-700);
	}
	.dark {
		background: var(--grey-800);
		color: var(--grey-0);
		--ink: var(--grey-0);
		--muted: var(--grey-400);
	}
	.card:focus-visible {
		outline: 1px solid var(--ink);
		outline-offset: 2px;
	}

	.image {
		grid-column: span 3;
	}
	.body {
		grid-column: span 9;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		/* 20px on every side: the gutter already sets the copy off the image. */
		padding: var(--space-20) var(--space-20) var(--space-20) calc(var(--space-20) - var(--grid-gutter));
	}
	.title,
	.size {
		margin: 0;
	}
	.size {
		margin-top: var(--space-16);
		color: var(--muted);
	}

	/* Dark: an underlined word, brightening on hover. */
	.label {
		align-self: end;
		color: var(--muted);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.15em;
	}
	.card:hover .label {
		color: var(--ink);
	}

	/* Light: a 36px ring round the download arrow, darkening on hover. */
	.icon {
		align-self: end;
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 2.25);
		height: calc(var(--size-font) * 2.25);
		box-sizing: border-box;
		border: 1px solid var(--grey-400);
		border-radius: 50%;
	}
	.card:hover .icon {
		border-color: var(--grey-950);
	}
	.icon :global(svg) {
		display: block;
		width: calc(var(--size-font) * 0.875);
		height: calc(var(--size-font) * 0.875);
	}

	@media screen and (max-width: 767px) {
		.image,
		.body {
			grid-column: 1 / -1;
		}
		.body {
			gap: var(--space-40);
			padding: var(--space-20);
		}
	}
</style>
