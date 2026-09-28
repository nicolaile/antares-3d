<!--
	@component
	Product section: header, the interactive model with its features, then
	a captioned row of hardware media.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Caption from '$lib/components/Caption.svelte';
	import Figure from '$lib/components/Figure.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import SectionHeader from '$lib/modules/SectionHeader.svelte';
	import ReactorExplorer, { type Feature } from '$lib/modules/ReactorExplorer.svelte';

	import type { Column } from '$lib/layout/types';

	type Note = { label?: string; text: string };
	/** Tile columns: desktop side by side in 1–4, halves below that. */
	const TILE_START: Column[] = [1, 3];
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
		/** Two small captioned tiles; an entry without `src` holds its place. */
		tiles: { src?: PictureSource; alt: string; caption: string }[];
		diagram: { src: PictureSource; alt: string };
	} = $props();
</script>

<Row as="section" gap={40}>
	<Cell subgrid>
		<SectionHeader {title} {aside} />
	</Cell>

	<Cell subgrid>
		<ReactorExplorer {features} />
	</Cell>

	<Cell subgrid gap={60} align="start">
		<Cell span={4} tablet={{ span: 6 }}>
			<Caption label={architecture.label} text={architecture.text} />
		</Cell>
		<Cell subgrid align="start" gap={40}>
			{#each tiles as tile, i (i)}
				<Cell
					start={TILE_START[i]}
					span={2}
					tablet={{ start: TILE_START_NARROW[i], span: 6 }}
					mobile={{ start: TILE_START_NARROW[i], span: 6 }}
				>
					<Figure {...tile} ratio="5 / 4" sizes="(max-width: 991px) 50vw, 16vw" />
				</Cell>
			{/each}
			<Cell start={5} span={8} tablet={{ start: 1, span: 12 }}>
				<Picture {...diagram} ratio="3 / 2" sizes="(max-width: 991px) 100vw, 65vw" surface />
			</Cell>
		</Cell>
	</Cell>
</Row>
