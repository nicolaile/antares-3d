<!--
	@component
	Mission statement, then a row of milestones and three images whose
	bottoms line up.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Statement from '$lib/modules/Statement.svelte';
	import Milestones from '$lib/modules/Milestones.svelte';

	type Image = { src: PictureSource; alt: string };

	let {
		label,
		statement,
		milestones,
		images
	}: {
		label: string;
		statement: string;
		milestones: { title: string; items: { value: string; label: string }[] };
		images: { portrait: Image; detail: Image; feature: Image };
	} = $props();
</script>

<Row as="section" gap={160}>
	<Cell>
		<Statement {label} text={statement} />
	</Cell>

	<Cell subgrid gap={40} align="end">
		<!-- Milestones and the two portraits share a height: the milestones'
		     rule lines up with the tops of the portraits. -->
		<Cell span={7} tablet={{ span: 12 }} subgrid gap={40}>
			<Cell span={3} tablet={{ span: 12 }} subgrid>
				<Milestones title={milestones.title} items={milestones.items} />
			</Cell>
			<Cell start={4} span={2} tablet={{ start: 1, span: 6 }} mobile={{ span: 6 }}>
				<Picture {...images.portrait} ratio="10 / 13" sizes="(max-width: 991px) 50vw, 16vw" />
			</Cell>
			<Cell start={6} span={2} tablet={{ start: 7, span: 6 }} mobile={{ start: 7, span: 6 }}>
				<Picture {...images.detail} ratio="10 / 13" sizes="(max-width: 991px) 50vw, 16vw" />
			</Cell>
		</Cell>
		<Cell start={8} span={5} tablet={{ start: 1, span: 12 }}>
			<Picture {...images.feature} ratio="10 / 7" sizes="(max-width: 991px) 100vw, 40vw" />
		</Cell>
	</Cell>
</Row>
