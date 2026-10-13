<!--
	@component
	One tab in the R1 feature strip: a numbered badge and the feature's title.
	While open, a fill runs across it as autoplay counts down (`progress`).
	An ARIA tab: the strip is the tablist and owns which tab is open; only
	the open tab is in the tab order (roving tabindex).
-->
<script lang="ts">
	let {
		index,
		title,
		open = false,
		progress = 0,
		id,
		controls,
		onselect
	}: {
		/** Zero-based; shown as 1, 2, … */
		index: number;
		title: string;
		open?: boolean;
		/** 0–1: autoplay's progress towards the next feature, while open. */
		progress?: number;
		id: string;
		/** The id of the panel showing the open feature. */
		controls: string;
		onselect: () => void;
	} = $props();
</script>

<li class="tab" class:open role="presentation">
	<button
		type="button"
		class="face"
		role="tab"
		{id}
		aria-selected={open}
		aria-controls={controls}
		tabindex={open ? 0 : -1}
		onclick={onselect}
	>
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
		background: var(--grey-925);
	}
	.face:focus-visible {
		outline: 1px solid var(--white);
		outline-offset: -1px;
	}

	/* Swaps without a transition: fading it alongside the fill flickers. */
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
	.fill {
		position: absolute;
		inset: 0;
		background: var(--grey-925);
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
