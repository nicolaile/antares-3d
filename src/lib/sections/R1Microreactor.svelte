<!--
	@component
	Product section, on a full-bleed dark band: the header, the interactive
	model with its features, then the system's drawing (section or
	isometric, SystemViews).
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import SectionHeader from '$lib/modules/SectionHeader.svelte';
	import ReactorExplorer, { type Feature } from '$lib/modules/ReactorExplorer.svelte';
	import SystemViews from '$lib/modules/SystemViews.svelte';

	let {
		title,
		aside,
		features,
		measure,
		diagram,
		views
	}: {
		title: string;
		aside?: string;
		features: Feature[];
		/** The height ruler beside the model. */
		measure?: { label: string; value: string };
		/** Accessible description of the energy diagram. */
		diagram: { alt: string };
		/** Beside the drawing, at the left: a title over a line. */
		views: { title: string; text: string };
	} = $props();
</script>

<section class="band">
	<Row gap={120}>
		<Cell subgrid gap={120}>
			<Cell subgrid>
				<SectionHeader {title} {aside} />
			</Cell>
			<Cell subgrid>
				<ReactorExplorer {features} {measure} />
			</Cell>
		</Cell>

		<Cell subgrid gap={40}>
			<div class="diagram">
				<SystemViews label={diagram.alt} {...views} />
			</div>
		</Cell>
	</Row>
</section>

<style>
	/* Full bleed: the negative margin takes it to the screen edges, and the
	   matching padding keeps its columns on the page grid. */
	.band {
		--secondary: var(--grey-400);
		margin-inline: calc(var(--grid-margin) * -1);
		padding: var(--space-40) var(--grid-margin) var(--space-64);
		background: var(--grey-850);
		color: var(--grey-0);
	}

	/* The drawing sits inside its frame with empty stage above (about 18%)
	   and below (about 18%). Pull the frame up into the gap above, so the
	   model above sits by the drawing rather than the frame; below, the
	   stage runs on into the band's own padding, the same grey. A percentage margin is of the row's width, and the frame
	   spans 9 of its 12 columns at 2/3 as tall as it is wide, so 7.5% of
	   the row is roughly 15% of the frame's height — just inside the 120px
	   gap above at 1440, so the frame never reaches the explorer. Capped at
	   --space-120 less --space-4 (116px at 1440): past 1600 the gap stops
	   growing but the columns don't, and an uncapped pull would run the
	   frame up over the explorer. Stacked, the title and switch sit over
	   the frame, so it isn't pulled at all. */
	.diagram {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		margin-top: max(-7.5%, calc(var(--space-4) - var(--space-120)));
	}
	@media screen and (max-width: 991px) {
		.diagram {
			margin-top: 0;
		}
	}

</style>
