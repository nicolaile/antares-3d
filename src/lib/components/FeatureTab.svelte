<!--
	@component
	One tab in the R1 feature strip: a card with a number on a grey badge
	and the feature's title beside it. Open, the badge turns orange. The
	strip decides which tab is open, and the open feature's description
	reads in the stage below, not here.
-->
<script lang="ts">
	let {
		index,
		title,
		open = false,
		onselect
	}: {
		/** Zero-based; shown as 1, 2, … */
		index: number;
		title: string;
		open?: boolean;
		onselect: () => void;
	} = $props();
</script>

<li class="tab" class:open>
	<button type="button" class="face" aria-pressed={open} onclick={onselect}>
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

	/* 48px tall at 1440: the badge 13px in from the card's edges, the
	   title beside it on one line. */
	.face {
		display: flex;
		align-items: center;
		gap: var(--space-16);
		width: 100%;
		height: calc(var(--size-font) * 3);
		box-sizing: border-box;
		padding: 0 calc((var(--size-font) * 3 - var(--badge)) / 2);
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--grey-825);
		color: var(--grey-0);
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
		transition: background 0.25s ease;
	}
	.face:hover {
		background: var(--grey-800);
	}
	.face:focus-visible {
		outline: 1px solid var(--grey-0);
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
		background: var(--grey-775);
	}
	.face:hover .number {
		background: var(--grey-750);
	}
	.open .number,
	.open .face:hover .number {
		background: var(--accent-500);
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
