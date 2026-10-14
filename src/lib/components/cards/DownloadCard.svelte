<!--
	@component
	A full-width card linking to a file: image, title, size and a download
	prompt.
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
		/** As shown: "38 MB". */
		size: string;
		image: { src: Source; alt: string };
		href: string;
		/** `dark`: an underlined "Download" (Updates' press kit); `light`: a round icon (Missions' specs). */
		tone?: 'light' | 'dark';
	} = $props();
</script>

<a class="card {tone}" {href}>
	<div class="image">
		<Picture {...image} ratio="340 / 228" sizes="(max-width: 767px) 100vw, 24vw" />
	</div>
	<div class="body">
		<div>
			<p class="title type-sub-headline">{title}</p>
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
		background: var(--grey-100);
		color: var(--black);
		text-decoration: none;
		--ink: var(--black);
		--muted: var(--grey-700);
	}
	.dark {
		background: var(--grey-900);
		color: var(--white);
		--ink: var(--white);
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
		/* The gutter already sets the copy off the image. */
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
		border-color: var(--black);
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
