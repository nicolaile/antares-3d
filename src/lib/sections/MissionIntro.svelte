<!--
	@component
	Who we are: a statement across the first seven columns, the figures under it, and
	two images on the right whose bottoms line up — a large one on columns
	8–10 and a smaller one on 11–12.

	An image without a `src` renders as a grey placeholder that already
	holds the layout.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Milestones from '$lib/modules/Milestones.svelte';

	type Image = { src?: PictureSource; alt: string };

	let {
		statement,
		milestones,
		images
	}: {
		statement: string;
		milestones: { value: string; label: string }[];
		images: { primary: Image; secondary: Image };
	} = $props();
</script>

<section class="mission">
	<Row gap={40}>
		<Cell span={7} tablet={{ span: 12 }} mobile={{ span: 12 }}>
			<p class="statement type-statement">{statement}</p>
		</Cell>

		<!-- The figures sit at the top of this row, the images at its foot,
		     starting a little lower. -->
		<Cell subgrid>
			<Cell span={4} tablet={{ span: 6 }} mobile={{ span: 12 }} subgrid self="start">
				<Milestones items={milestones} quiet />
			</Cell>
			<Cell start={8} span={5} tablet={{ start: 1, span: 12 }} subgrid align="end">
				<div class="primary">
					<Picture {...images.primary} surface ratio="11 / 9" sizes="(max-width: 991px) 60vw, 24vw" />
				</div>
				<div class="secondary">
					<Picture {...images.secondary} surface ratio="12 / 7" sizes="(max-width: 991px) 40vw, 16vw" />
				</div>
			</Cell>
		</Cell>
	</Row>
</section>

<style>
	/* Sits closer to the dark band below than sections usually do: 80px
	   rather than the page's 120px. */
	.mission {
		margin-bottom: calc(var(--space-40) * -1);
	}

	.statement {
		margin: 0;
	}

	.primary,
	.secondary {
		border-radius: var(--stage-radius);
		overflow: hidden;
	}
	/* Columns 8–10 and 11–12 of the page. */
	/* Starts well below the figures, the images sitting low in the row. */
	.primary {
		grid-column: span 3;
		margin-top: var(--space-120);
	}
	.secondary {
		grid-column: span 2;
	}

	@media screen and (max-width: 991px) {
		.primary {
			grid-column: span 7;
			margin-top: 0;
		}
		.secondary {
			grid-column: span 5;
		}
	}
</style>
