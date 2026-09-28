<!--
	@component
	One entry in a feature list: a "02  Title" row that stays put, and when
	open, a thumbnail and description that unfold beneath it. The list
	decides which card is open.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Picture from './Picture.svelte';
	import { tick, untrack } from 'svelte';
	import { prefersReducedMotion } from '$lib/scroll';

	let {
		index,
		title,
		text,
		thumb,
		open = false,
		onselect
	}: {
		/** Zero-based; shown as 01, 02, … */
		index: number;
		title: string;
		text: string;
		thumb?: PictureSource;
		open?: boolean;
		onselect: () => void;
	} = $props();

	const number = $derived(String(index + 1).padStart(2, '0'));

	let card: HTMLLIElement;
	let extras: HTMLElement[] = [];
	/** Lags `open` on the way closed, so the content can fade out first. */
	let expanded = $state(untrack(() => open));
	let run = 0;
	/** The state last asked for — may differ from `expanded` mid-close. */
	let target = untrack(() => open);
	/** The held shrink of a close in progress; a reopen must drop it. */
	let shrinking: Animation | null = null;

	const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
	const fade = (from: number, to: number, duration: number, delay = 0) =>
		Promise.all(
			extras.filter(Boolean).map(
				(el) => el.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: 'ease', fill: 'both' }).finished
			)
		);

	/** One duration for both directions, so the card closing and the card
	    opening move in lockstep. */
	const DURATION = 500;

	/** Height the card has with only its header row. */
	function closedHeight() {
		const face = card.firstElementChild as HTMLElement;
		const pad = parseFloat(getComputedStyle(face).paddingBottom);
		const title = face.querySelector('.title') as HTMLElement;
		return title.getBoundingClientRect().bottom - card.getBoundingClientRect().top + pad;
	}

	// Open: grow while the content fades in. Close: shrink while it fades
	// out, the card's own edge masking it — then drop it from the layout.
	// Same length and curve both ways. A newer toggle cancels an older one
	// mid-way, so quick clicks never leave a card half-changed.
	$effect(() => {
		const next = open;
		if (next === target) return;
		target = next;
		const id = ++run;
		if (prefersReducedMotion()) {
			expanded = next;
			return;
		}
		const timing = { duration: DURATION, easing: EASE };
		(async () => {
			const from = card.offsetHeight;
			shrinking?.cancel();
			shrinking = null;
			if (next) {
				expanded = true;
				await tick();
				card.animate([{ height: `${from}px` }, { height: `${card.offsetHeight}px` }], timing);
				fade(0, 1, DURATION * 0.7, DURATION * 0.3);
			} else {
				const shrink = (shrinking = card.animate([{ height: `${from}px` }, { height: `${closedHeight()}px` }], {
					...timing,
					fill: 'forwards'
				}));
				fade(1, 0, DURATION * 0.6);
				await shrink.finished.catch(() => {});
				if (id !== run) return;
				expanded = false;
				await tick();
				shrink.cancel();
				shrinking = null;
			}
		})();
	});
</script>

<li class="card" class:open={expanded} bind:this={card}>
	<button type="button" class="face type-body" aria-expanded={open} onclick={onselect}>
		<span class="number">{number}</span>
		<span class="title">{title}</span>
		{#if thumb}
			<span class="thumb" bind:this={extras[0]}>
				<Picture src={thumb} ratio="{thumb.img.w} / {thumb.img.h}" fit="contain" sizes="120px" />
			</span>
		{/if}
		<span class="text" bind:this={extras[1]}>{text}</span>
	</button>
</li>

<style>
	.card {
		overflow: hidden;
		background: var(--grey-0);
	}

	/* Number in a fixed first column, title in the second; the unfolding
	   parts span both. */
	.face {
		display: grid;
		grid-template-columns: var(--space-40) 1fr;
		width: 100%;
		padding: var(--space-20) var(--space-12);
		border: 0;
		background: none;
		color: var(--grey-950);
		text-align: left;
		cursor: pointer;
	}
	.card:not(.open) .face:hover {
		color: var(--grey-700);
	}
	.face:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: -1px;
	}

	.thumb,
	.text {
		display: none;
		grid-column: 1 / -1;
	}
	.open .thumb {
		display: block;
		justify-self: center;
		width: calc(var(--size-font) * 5.625);
		margin-top: var(--space-40);
	}
	.open .text {
		display: block;
		margin-top: var(--space-40);
		color: var(--grey-700);
	}
</style>
