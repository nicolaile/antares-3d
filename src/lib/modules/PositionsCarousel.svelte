<!--
	@component
	The latest openings as a carousel: a label, then a row of position
	cards four up (two on tablet, one on phones), stepped one card at a
	time by the round arrows under the row's left end. A link to every
	opening, with the total, sits under its right end.

	The row slides with GSAP; the arrows fade out at either end of it.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import PositionCard from '$lib/components/PositionCard.svelte';
	import ArrowButton from '$lib/components/ArrowButton.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { Position } from '$lib/content/careers';
	import type { Link } from '$lib/content/site';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		label,
		items,
		total,
		all
	}: {
		label: string;
		/** The cards in the row. */
		items: Position[];
		/** Every opening, for the link's count. */
		total: number;
		/** Where every opening is listed. */
		all: Link;
	} = $props();

	const id = $props.id();
	let track: HTMLUListElement;
	/** The first card in view. */
	let index = $state(0);
	/** How many cards fit in view, read from the layout. */
	let perView = $state(4);
	const last = $derived(Math.max(0, items.length - perView));

	/** One card plus the gap after it, px. */
	function step() {
		const [a, b] = track.children as HTMLCollectionOf<HTMLElement>;
		return b ? b.offsetLeft - a.offsetLeft : 0;
	}

	function show(to: number, instant = false) {
		index = Math.min(Math.max(to, 0), last);
		gsap.to(track, {
			x: -index * step(),
			duration: instant || prefersReducedMotion() ? 0 : 0.8,
			ease: 'power3.out',
			overwrite: true
		});
	}

	onMount(() => {
		const measure = () => {
			// The window holds perView cards and one gap fewer: its width over
			// one step rounds to the count.
			const s = step();
			perView = s ? Math.max(1, Math.round(track.parentElement!.clientWidth / s)) : 1;
			show(index, true);
		};
		measure();
		const sized = new ResizeObserver(measure);
		sized.observe(track.parentElement!);
		return () => {
			sized.disconnect();
			gsap.killTweensOf(track);
		};
	});
</script>

<section class="positions" aria-labelledby="{id}-label">
	<h2 id="{id}-label" class="label type-h3">{label}</h2>
	<div class="window">
		<ul class="track" bind:this={track}>
			{#each items as position, i (i)}
				<li inert={i < index || i >= index + perView}><PositionCard {...position} /></li>
			{/each}
		</ul>
	</div>
	<div class="foot">
		<div class="arrows">
			<ArrowButton direction="previous" label="Previous openings" disabled={index === 0} onclick={() => show(index - 1)} />
			<ArrowButton direction="next" label="Next openings" disabled={index >= last} onclick={() => show(index + 1)} />
		</div>
		<Button label="{all.label} ({total})" href={all.href} />
	</div>
</section>

<style>
	/* Never wider than where it's put, however long the row. */
	.positions {
		min-width: 0;
	}
	.label {
		margin: 0;
	}
	/* Clipped to the grid, so the cards beyond it wait out of sight. */
	.window {
		margin-top: var(--space-48);
		overflow: hidden;
	}
	/* Four up, three columns each (338px at 1440), on the page's gutter.
	   Two up on tablet, one on phones. */
	.track {
		--per-view: 4;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: calc((100% - (var(--per-view) - 1) * var(--grid-gutter)) / var(--per-view));
		gap: var(--grid-gutter);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@media screen and (max-width: 991px) {
		.track {
			--per-view: 2;
		}
	}
	@media screen and (max-width: 767px) {
		.track {
			--per-view: 1;
		}
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-24);
		margin-top: var(--space-24);
	}
	.arrows {
		display: flex;
		gap: var(--space-8);
	}
</style>
