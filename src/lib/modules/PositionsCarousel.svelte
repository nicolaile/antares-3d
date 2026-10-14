<!--
	@component
	The latest openings as a carousel of position cards, stepped one card at
	a time by arrows, with a link to every opening beside the title.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import PositionCard from '$lib/components/cards/PositionCard.svelte';
	import ArrowButton from '$lib/components/ArrowButton.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { Position } from '$lib/content/careers';
	import type { Link } from '$lib/content/site';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

	let {
		label,
		items,
		all
	}: {
		label: string;
		items: Position[];
		/** Count of all openings, shown on the link. */
		all: Link;
	} = $props();

	const id = $props.id();
	let track: HTMLUListElement;
	/** The first card in view. */
	let index = $state(0);
	/** Read from the layout (CSS --per-view). */
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
			// perView cards and one gap fewer: width over one step rounds to the count.
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
	<div class="top">
		<h2 id="{id}-label" class="label type-h5">{label}</h2>
		<Button {...all} />
	</div>
	<div class="window">
		<ul class="track" bind:this={track}>
			{#each items as position, i (i)}
				<li inert={i < index || i >= index + perView}><PositionCard {...position} /></li>
			{/each}
		</ul>
	</div>
	<div class="foot">
		<div class="arrows">
			<ArrowButton
				direction="previous"
				label="Previous openings"
				disabled={index === 0}
				onclick={() => show(index - 1)}
			/>
			<ArrowButton direction="next" label="Next openings" disabled={index >= last} onclick={() => show(index + 1)} />
		</div>
	</div>
</section>

<style>
	/* So the long track can't widen its grid cell. */
	.positions {
		min-width: 0;
	}
	/* The title with the link to every opening across from it. */
	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-24);
	}
	.label {
		margin: 0;
	}
	.window {
		margin-top: var(--space-16);
		overflow: hidden;
	}
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
		margin-top: var(--space-16);
	}
	.arrows {
		display: flex;
		gap: var(--space-8);
	}
</style>
