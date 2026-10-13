<!--
	@component
	A full-width image card with type on its corners: a big title top-left,
	a big name bottom-right, and a line with a call to action bottom-left.
	The image's own shape sets the card's; on phones it turns portrait.
	Home's "From MARK-01 → R1".
-->
<script lang="ts">
	import Picture from '$lib/components/Picture.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { Picture as Source } from 'vite-imagetools';
	import type { Link } from '$lib/content/site';

	let {
		title,
		name,
		image,
		text,
		link
	}: {
		title: string;
		name: string;
		image: { src: Source; alt: string };
		text: string;
		link: Link;
	} = $props();

	const id = $props.id();
</script>

<section class="poster" aria-labelledby="{id}-title">
	<div class="card">
		<div class="backdrop">
			<Picture
				{...image}
				ratio="{image.src.img.w} / {image.src.img.h}"
				sizes="(max-width: 767px) 100vw, 97vw"
			/>
		</div>
		<h2 id="{id}-title" class="title type-h1">{title}</h2>
		<p class="name type-h1" aria-hidden="true">{name}</p>
	</div>
	<div class="copy">
		<p class="text type-caption">{text}</p>
		<Button {...link} />
	</div>
</section>

<style>
	.poster {
		position: relative;
		color: var(--black);
	}
	/* Its own stacking context, so the type blends with the image only. */
	.card {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--button);
	}

	/* Inverts against the image. Trimmed to the caps so they sit on the
	   card's padding exactly. */
	.title,
	.name {
		position: absolute;
		margin: 0;
		color: var(--white);
		mix-blend-mode: exclusion;
		text-box: trim-both cap alphabetic; /* check-system: allow — set on cap height, as Display is */
		pointer-events: none;
	}
	.title {
		top: var(--space-24);
		left: var(--space-20);
		right: var(--space-20);
	}
	.name {
		right: var(--space-20);
		bottom: var(--space-24);
	}

	/* Three columns of the twelve, from the card's bottom-left corner. */
	.copy {
		position: absolute;
		bottom: var(--space-24);
		left: var(--space-20);
		display: grid;
		justify-items: start;
		gap: var(--space-24);
		width: calc((100% - 11 * var(--grid-gutter)) / 12 * 3 + 2 * var(--grid-gutter));
	}
	.text {
		margin: 0;
		color: var(--grey-700);
	}

	@media screen and (max-width: 767px) {
		.card {
			aspect-ratio: 3 / 4;
		}
		.backdrop {
			position: absolute;
			inset: 0;
		}
		.backdrop :global(.picture) {
			width: 100%;
			height: 100%;
		}
		.copy {
			position: static;
			width: auto;
			margin-top: var(--space-24);
		}
	}
</style>
