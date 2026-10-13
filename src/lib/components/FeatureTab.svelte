<!--
	@component
	One tab in the R1 feature strip: a card with a number on a grey badge
	and the feature's title beside it. Open, the badge and title turn
	orange, and a lighter fill runs across the card as autoplay counts
	down to the next (`progress`). The strip decides which tab is open, and
	the open feature's description reads in the stage below, not here.
-->
<script lang="ts">
	let {
		index,
		title,
		open = false,
		progress = 0,
		onselect
	}: {
		/** Zero-based; shown as 1, 2, … */
		index: number;
		title: string;
		open?: boolean;
		/** 0–1: how far autoplay is towards the next feature, while open. */
		progress?: number;
		onselect: () => void;
	} = $props();
</script>

<li class="tab" class:open>
	<button type="button" class="face" aria-pressed={open} onclick={onselect}>
		<span class="fill" aria-hidden="true" style:transform="scaleX({open ? progress : 0})"></span>
		<span class="number type-annotation type-tabular">{index + 1}</span>
		<span class="title type-body-default">{title}</span>
	</button>
</li>

<style>
	.tab {
		--badge: calc(var(--size-font) * 1.375);
		flex: none;
		width: var(--tab-width);
		scroll-snap-align: start;
	}

	/* 45px tall at 1440 (the font's 15.83px × 2.842): the badge 16px in
	   from the card's left edge, the title 12px beside it on one line. */
	.face {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		gap: var(--space-12);
		width: 100%;
		height: calc(var(--size-font) * 2.842);
		box-sizing: border-box;
		padding: 0 var(--space-16);
		border: 0;
		border-radius: var(--card-radius);
		background: var(--grey-950);
		color: var(--white);
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
		transition: background 0.25s ease;
	}
	.face:hover {
		background: var(--grey-900);
	}
	.face:focus-visible {
		outline: 1px solid var(--white);
		outline-offset: -1px;
	}

	/* Grey while closed, the accent once open. Swaps at once: fading the
	   fill and the number together flickers the number. */
	.number {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--badge);
		height: var(--badge);
		border-radius: var(--stage-radius);
		background: var(--grey-800);
	}
	.face:hover .number {
		background: var(--grey-800);
	}
	.open .number,
	.open .face:hover .number {
		background: var(--orange);
		color: var(--black);
	}
	/* Autoplay's progress: a lighter card filling from the left, under
	   the badge and title. */
	.fill {
		position: absolute;
		inset: 0;
		background: var(--grey-900);
		transform-origin: left;
		pointer-events: none;
	}
	.number,
	.title {
		position: relative;
	}
	.open .title {
		color: var(--orange);
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
