<!--
	@component
	A titled set of three cards: a dark card and a slate note (a statement
	over numbered points) stacked beside a photo card, whose shape sets the
	row's height. The dark card can hold a photo instead, filling it; the
	photo card's label and inset are optional, so it can be one photo, full
	bleed. Optionally a full-width banner with a link underneath.
	Used by Company's Culture & Operations and home's Graphite Machining.
	TODO(launch): the dark card shows only its label; its content isn't final.
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
		/** With an image, the card is that photo, cropped to fill. */
		dark: { label?: string; image?: Image };
		note: {
			label: string;
			/** Each entry is one line. */
			statement: string[];
			points: string[];
		};
		photo: { label?: string; background: Image; inset?: Image };
		join?: { text: string; link: Link };
		/** Photo on the left (desktop only). */
		flip?: boolean;
	} = $props();

	const id = $props.id();
	const ratio = (image: Image) => `${image.src.img.w} / ${image.src.img.h}`;
</script>

<section class="cards-section" class:flip aria-labelledby="{id}-title">
	<Row>
		<Cell span={4} tablet={{ span: 6 }}>
			<h2 id="{id}-title" class="title type-h5">{title}</h2>
			<p class="intro type-body-default">{intro}</p>
		</Cell>
	</Row>

	<div class="cards">
		<article class="card dark" class:filled={dark.image}>
			{#if dark.image}
				<div class="fill">
					<Picture {...dark.image} ratio={ratio(dark.image)} sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw" />
				</div>
			{/if}
			{#if dark.label}<h3 class="label type-caption">{dark.label}</h3>{/if}
		</article>

		<article class="card note">
			<h3 class="label type-caption">{note.label}</h3>
			<p class="statement type-sub-headline">
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
			{#if photo.label}<h3 class="label type-caption">{photo.label}</h3>{/if}
		</article>
	</div>

	{#if join}
		<div class="join">
			<p class="join-text type-sub-headline">{join.text}</p>
			<Button {...join.link} />
		</div>
	{/if}
</section>

<style>
	/* Extra room above, so the heading starts its own part of the page. */
	.cards-section {
		padding-top: var(--space-40);
	}

	.title,
	.intro,
	.label,
	.statement {
		margin: 0;
	}
	.intro {
		margin-top: var(--space-16);
		color: var(--grey-700);
	}

	/* The photo card spans both rows, so its photo's height sets the row's. */
	.cards {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		grid-template-rows: 1fr 1fr;
		gap: var(--grid-gutter);
		margin-top: var(--space-32);
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
		background: var(--grey-950);
		color: var(--white);
	}
	.note {
		background: var(--slate-300);
		color: var(--black);
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
		background: var(--white);
		color: var(--black);
	}

	.photo {
		padding: 0;
		color: var(--white);
	}
	/* The dark card as a photo: the image covers it, whatever the row's height. */
	.filled {
		padding: 0;
	}
	.fill {
		position: absolute;
		inset: 0;
	}
	.fill :global(.picture) {
		height: 100%;
		aspect-ratio: auto !important;
	}
	.photo .label {
		position: absolute;
		top: var(--space-24);
		left: var(--space-24);
	}
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
		background: var(--grey-50);
		color: var(--black);
	}
	.join-text {
		margin: 0;
	}

	/* The pair side by side, the photo full width under them. */
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

	/* Stacked; the dark card, having only its label, keeps a shape. */
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
