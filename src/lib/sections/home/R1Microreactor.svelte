<!--
	@component
	Home's product section on a full-bleed dark band: the header, the
	interactive model with its features, then the system's drawing.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import SectionHeader from '$lib/modules/SectionHeader.svelte';
	import ReactorExplorer, {
		type Feature,
		type CadModel,
		type CadModelSetup
	} from '$lib/explorer/ReactorExplorer.svelte';
	import SystemViews from '$lib/explorer/SystemViews.svelte';
	import { reveal } from '$lib/motion/reveal';

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
		/** See ReactorExplorer. */
		models: Partial<Record<CadModel, CadModelSetup>>;
		/** Accessible description of the energy diagram. */
		diagram: { alt: string };
		/** Centred over the drawing. */
		views: { title: string; text: string };
	} = $props();

	const REVEAL = '.header .title, .header .aside, .explorer > .tabs, .explorer > .viewport';
</script>

<section class="band" data-tone="dark">
	<Row gap={80}>
		<!-- Reveals the title, aside, tabs, then the model (which turns in, too). -->
		<Cell subgrid gap={160} {@attach reveal({ items: REVEAL, stagger: 0.12 })}>
			<Cell subgrid>
				<SectionHeader {title} {aside} />
			</Cell>
			<Cell subgrid>
				<!-- TODO(launch): the models aren't final; drop `wip` once they are. -->
				<ReactorExplorer {features} {models} wip />
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
	/* Full bleed, with matching padding to keep its columns on the page grid. */
	.band {
		--secondary: var(--grey-400);
		margin-inline: calc(var(--grid-margin) * -1);
		padding: var(--space-32) var(--grid-margin) var(--space-96);
		background: var(--black);
		color: var(--white);
	}

	.diagram {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
	}
</style>
