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
	import ReactorExplorer, { type Feature, type CadModel, type CadModelSetup } from '$lib/modules/ReactorExplorer.svelte';
	import SystemViews from '$lib/modules/SystemViews.svelte';

	let {
		title,
		aside,
		features,
		models,
		diagram,
		views
	}: {
		title: string;
		aside?: string;
		features: Feature[];
		/** The CAD models' files and setup (ReactorExplorer). */
		models: Partial<Record<CadModel, CadModelSetup>>;
		/** Accessible description of the energy diagram. */
		diagram: { alt: string };
		/** Beside the drawing, at the left: a title over a line. */
		views: { title: string; text: string };
	} = $props();
</script>

<section class="band" data-tone="dark">
	<Row gap={120}>
		<Cell subgrid gap={160}>
			<Cell subgrid>
				<SectionHeader {title} {aside} />
			</Cell>
			<Cell subgrid>
				<ReactorExplorer {features} {models} />
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

	/* The section's drawing (SystemViews): on desktop a panel one screen tall. */
	.diagram {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
	}

</style>
