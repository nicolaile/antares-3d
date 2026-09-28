<!--
	@component
	Product section: header, the interactive model with its features, then
	a row of hardware media beside the energy diagram.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Caption from '$lib/components/Caption.svelte';
	import Figure from '$lib/components/Figure.svelte';
	import SectionHeader from '$lib/modules/SectionHeader.svelte';
	import ReactorExplorer, { type Feature } from '$lib/modules/ReactorExplorer.svelte';
	import EnergyDiagram from '$lib/modules/EnergyDiagram.svelte';

	import type { Column } from '$lib/layout/types';

	type Note = { label?: string; text: string };
	/** Tile columns: desktop side by side in 1–4, beside the diagram; halves below that. */
	const TILE_START: Column[] = [1, 3];
	const TILE_SPAN = 2;
	const TILE_START_NARROW: Column[] = [1, 7];

	let {
		title,
		aside,
		features,
		architecture,
		tiles,
		diagram
	}: {
		title: string;
		aside?: Note;
		features: Feature[];
		architecture: Note;
		/** Up to two tiles beside the diagram, optionally captioned. An entry without `src` holds its place. */
		tiles: { src?: PictureSource; alt: string; caption?: string }[];
		/** Accessible description of the energy diagram. */
		diagram: { alt: string };
	} = $props();
</script>

<!-- More air above the caption than under it, so it reads with the tiles it introduces. -->
<Row as="section" gap={60}>
	<Cell subgrid gap={40}>
		<Cell subgrid>
			<SectionHeader {title} {aside} />
		</Cell>

		<Cell subgrid>
			<ReactorExplorer {features} />
		</Cell>
	</Cell>

	<Cell subgrid gap={20} align="start">
		<Cell span={4} tablet={{ span: 6 }}>
			<Caption label={architecture.label} text={architecture.text} />
		</Cell>
		<Cell subgrid align="start" gap={40}>
			{#each tiles as tile, i (i)}
				<Cell
					start={TILE_START[i]}
					span={TILE_SPAN}
					tablet={{ start: TILE_START_NARROW[i], span: 6 }}
					mobile={{ start: TILE_START_NARROW[i], span: 6 }}
				>
					<Figure {...tile} ratio="1 / 1" sizes="(max-width: 991px) 50vw, 16vw" />
				</Cell>
			{/each}
			<Cell start={5} span={8} tablet={{ start: 1, span: 12 }}>
				<EnergyDiagram label={diagram.alt} />
			</Cell>
		</Cell>
	</Cell>
</Row>
