<!--
	@component
	Home's "who we are": a statement, the figures under it, and images on
	the right with their bottoms aligned: a large one and a smaller one, or
	a video's still on its own. An image without a `src` renders as a
	placeholder that holds the layout.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Milestones from '$lib/modules/Milestones.svelte';
	import PlayButton from '$lib/components/PlayButton.svelte';

	type Image = { src?: PictureSource; alt: string };
	/** A video's still, with its own `ratio`. */
	type Video = Image & { ratio: string; duration: string };

	let {
		statement,
		milestones,
		images
	}: {
		statement: string;
		milestones: { value: string; label: string }[];
		images?: { primary?: Image; secondary?: Image | Video };
	} = $props();
</script>

<section class="mission">
	<Row gap={40}>
		<Cell span={7} tablet={{ span: 12 }} mobile={{ span: 12 }}>
			<p class="statement type-h4">{statement}</p>
		</Cell>

		<!-- Figures at the top of this row, images at its foot. -->
		<Cell subgrid>
			<Cell span={4} tablet={{ span: 6 }} mobile={{ span: 12 }} subgrid self="start">
				<Milestones items={milestones} quiet />
			</Cell>
			{#if images?.primary || images?.secondary}
			<Cell start={8} span={5} tablet={{ start: 1, span: 12 }} subgrid align="end">
				{#if images.primary}
					<div class="primary">
						<Picture {...images.primary} surface ratio="11 / 9" sizes="(max-width: 991px) 60vw, 24vw" />
					</div>
				{/if}
				{#if images.secondary}
				{@const video = 'duration' in images.secondary ? images.secondary : null}
				<div class="secondary" class:alone={!images.primary} class:video>
					<Picture
						src={images.secondary.src}
						alt={images.secondary.alt}
						surface
						ratio={video?.ratio ?? '12 / 7'}
						sizes={video ? '(max-width: 991px) 60vw, 24vw' : '(max-width: 991px) 40vw, 16vw'}
					/>
					{#if video}
						<div class="play"><PlayButton duration={video.duration} /></div>
					{/if}
				</div>
				{/if}
			</Cell>
			{/if}
		</Cell>
	</Row>
</section>

<style>
	.mission {
		padding-top: var(--space-32);
		padding-bottom: var(--space-120);
	}

	.statement {
		margin: 0;
	}

	.primary,
	.secondary {
		border-radius: var(--stage-radius);
		overflow: hidden;
	}
	/* Starts well below the figures, so the images sit low in the row. */
	.primary {
		grid-column: span 3;
		margin-top: var(--space-120);
	}
	.secondary {
		grid-column: span 2;
	}
	/* Without the large one, keeps its column. */
	.secondary.alone {
		grid-column: 4 / span 2;
	}
	/* A video's still on its own is wider, starting a little below the figures. */
	.secondary.alone.video {
		grid-column: 3 / span 3;
		margin-top: var(--space-32);
	}
	.video {
		position: relative;
	}
	.play {
		position: absolute;
		left: var(--space-8);
		bottom: var(--space-8);
	}

	@media screen and (max-width: 991px) {
		.primary {
			grid-column: span 7;
			margin-top: 0;
		}
		.secondary {
			grid-column: span 5;
		}
		.secondary.alone {
			grid-column: 8 / span 5;
		}
		.secondary.alone.video {
			grid-column: 7 / span 6;
		}
	}

	@media screen and (max-width: 767px) {
		.secondary.alone.video {
			grid-column: 1 / -1;
			margin-top: var(--space-24);
		}
	}
</style>
