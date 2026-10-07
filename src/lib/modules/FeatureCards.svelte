<!--
	@component
	A titled set of three cards: a title and a line about it on the first
	four columns, then the cards, and optionally a banner under them.

	A dark card (for now just its label, if any) and a slate one (a statement over
	numbered points) stack on four columns; a photo card fills the other
	eight, with an optional second photo inset at its centre. The photo's
	shape sets the row's height and the two beside it split it. The photo
	is on the right, or the left with `flip`. On tablet the pair sit side by
	side over the photo; on phones all three stack. The banner, if there is
	one, runs the full width under them: a line and a link.

	Company's Culture & Operations and the landing's Graphite Machining.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { Picture as Source } from 'vite-imagetools';
	import type { Link } from '$lib/content/site';

	type Image = { src: Source; alt: string };

	let {
		title,
		intro,
		dark,
		note,
		photo,
		join,
		flip = false
	}: {
		title: string;
		intro: string;
		/** Its label, if it has one. */
		dark: { label?: string };
		note: {
			label: string;
			/** Each entry is one line. */
			statement: string[];
			points: string[];
		};
		photo: { label: string; background: Image; inset?: Image };
		join?: { text: string; link: Link };
		/** The photo on the left, the pair on the right. */
		flip?: boolean;
	} = $props();

	const id = $props.id();
	/** The photo's own shape, from its source. */
	const ratio = (image: Image) => `${image.src.img.w} / ${image.src.img.h}`;
</script>

<section class="cards-section" class:flip aria-labelledby="{id}-title">
	<Row>
		<Cell span={4} tablet={{ span: 6 }}>
			<h2 id="{id}-title" class="title type-h3">{title}</h2>
			<p class="intro type-body-default">{intro}</p>
		</Cell>
	</Row>

	<div class="cards">
		<article class="card dark">
			{#if dark.label}<h3 class="label type-caption">{dark.label}</h3>{/if}
		</article>

		<article class="card note">
			<h3 class="label type-caption">{note.label}</h3>
			<p class="statement type-h4">
				{#each note.statement as line, i (i)}{#if i > 0}<br />{/if}{line}{/each}
			</p>
			<ol class="points type-body-default">
				{#each note.points as point, i (i)}
					<li><span class="number type-annotation">{i + 1}</span>{point}</li>
				{/each}
			</ol>
		</article>

		<article class="card photo">
			<div class="backdrop">
				<Picture {...photo.background} ratio={ratio(photo.background)} sizes="(max-width: 991px) 100vw, 65vw" />
			</div>
			{#if photo.inset}
				<div class="inset">
					<Picture {...photo.inset} ratio={ratio(photo.inset)} sizes="(max-width: 991px) 43vw, 28vw" />
				</div>
			{/if}
			<h3 class="label type-caption">{photo.label}</h3>
		</article>
	</div>

	{#if join}
		<div class="join">
			<p class="join-text type-h4">{join.text}</p>
			<Button {...join.link} />
		</div>
	{/if}
</section>

<style>
	.title,
	.intro,
	.label,
	.statement {
		margin: 0;
	}
	.intro {
		margin-top: var(--space-16);
		color: var(--grey-500);
	}

	/* Columns 1–4 and 5–12 of the page's grid. Iterative spans both rows,
	   so its photo's height is the row's. */
	.cards {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		grid-template-rows: 1fr 1fr;
		gap: var(--grid-gutter);
		margin-top: var(--space-48);
	}
	.dark {
		grid-area: 1 / 1 / 2 / span 4;
	}
	.note {
		grid-area: 2 / 1 / 3 / span 4;
	}
	.photo {
		grid-area: 1 / 5 / 3 / span 8;
	}
	/* Flipped: the photo on columns 1–8, the pair on 9–12. Tablet and
	   phones stack the same either way. */
	@media screen and (min-width: 992px) {
		.flip .dark {
			grid-area: 1 / 9 / 2 / span 4;
		}
		.flip .note {
			grid-area: 2 / 9 / 3 / span 4;
		}
		.flip .photo {
			grid-area: 1 / 1 / 3 / span 8;
		}
	}

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		padding: var(--space-24);
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	.dark {
		background: var(--grey-850);
		color: var(--grey-0);
	}
	.note {
		background: var(--slate-300);
		color: var(--grey-950);
	}

	.statement {
		margin-top: var(--space-24);
	}
	/* Pinned to the card's foot, whatever the statement's length. */
	.points {
		display: grid;
		gap: var(--space-8);
		margin: auto 0 0;
		padding: var(--space-40) 0 0;
		color: var(--grey-700);
		list-style: none;
	}
	.points li {
		display: flex;
		align-items: center;
		gap: var(--space-8);
	}
	.number {
		display: grid;
		place-items: center;
		width: var(--space-20);
		height: var(--space-20);
		border-radius: var(--stage-radius);
		background: var(--grey-0);
		color: var(--grey-950);
	}

	/* The photo fills the card; the label and the inset sit over it. */
	.photo {
		padding: 0;
		color: var(--grey-0);
	}
	.photo .label {
		position: absolute;
		top: var(--space-24);
		left: var(--space-24);
	}
	/* 400px of the card's 928 at 1440, centred both ways. */
	.inset {
		position: absolute;
		top: 50%;
		left: 50%;
		width: calc(100% * 400 / 928);
		overflow: hidden;
		border-radius: var(--card-radius);
		transform: translate(-50%, -50%);
	}

	.join {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-24);
		margin-top: var(--grid-gutter);
		padding: var(--space-24);
		border-radius: var(--card-radius);
		background: var(--grey-100);
		color: var(--grey-950);
	}
	.join-text {
		margin: 0;
	}

	/* The left pair side by side, Iterative full width under them. */
	@media screen and (max-width: 991px) {
		.cards {
			grid-template-rows: auto auto;
		}
		.dark {
			grid-area: 1 / 1 / 2 / span 6;
		}
		.note {
			grid-area: 1 / 7 / 2 / span 6;
			min-height: calc(var(--size-font) * 20);
		}
		.photo {
			grid-area: 2 / 1 / 3 / span 12;
		}
	}

	/* One above the other. Scalable, having only its label, keeps a shape. */
	@media screen and (max-width: 767px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: none;
		}
		.dark,
		.note,
		.photo {
			grid-area: auto;
		}
		.dark {
			aspect-ratio: 4 / 3;
		}
		.join {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
