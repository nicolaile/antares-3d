<!--
	@component
	Product section, on a full-bleed dark band: the header, the interactive
	model with its features, then the energy diagram with a caption under
	it at the left.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import SectionHeader from '$lib/modules/SectionHeader.svelte';
	import ReactorExplorer, { type Feature } from '$lib/modules/ReactorExplorer.svelte';
	import EnergyDiagram from '$lib/modules/EnergyDiagram.svelte';

	let {
		title,
		aside,
		features,
		measure,
		diagram,
		note
	}: {
		title: string;
		aside?: string;
		features: Feature[];
		/** The height ruler beside the model. */
		measure?: { label: string; value: string };
		/** Accessible description of the energy diagram. */
		diagram: { alt: string };
		/** Under the diagram, at the left: a short label over a line or two. */
		note?: { label: string; text: string };
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
			<Cell start={2} span={10} tablet={{ start: 1, span: 12 }}>
				<div class="diagram">
					<EnergyDiagram label={diagram.alt} dark />
				</div>
			</Cell>
			{#if note}
				<Cell span={3} tablet={{ span: 6 }}>
					<p class="note">
						<span class="type-caption note-label">{note.label}</span>
						<span class="type-caption note-text">{note.text}</span>
					</p>
				</Cell>
			{/if}
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
	   and below (about 18%). Pull the frame into the gaps either side, so
	   the model above and the caption below sit by the drawing rather than
	   the frame. A percentage margin is of the width, and the frame is 2/3
	   as tall as it is wide, so 10% of the width is roughly 15% of its
	   height — about 116px at 1440, just inside the 120px gap above, so the
	   frame never reaches the explorer. Capped at --space-120 less
	   --space-4 (116px at 1440): past 1600 the gap stops growing but the columns don't, and an
	   uncapped pull would run the frame up over the explorer. */
	.diagram {
		margin-block: max(-10%, calc(var(--space-4) - var(--space-120)));
	}

	/* Above the diagram's frame, which it now overlaps and which paints its
	   own background. */
	.note {
		position: relative;
		z-index: 1;
		display: grid;
		/* A touch more air between the drawing and the caption. */
		margin-top: var(--space-16);
		gap: var(--space-4);
		margin: 0;
	}
	.note-text {
		color: var(--grey-400);
	}
</style>
