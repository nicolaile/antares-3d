<!--
	@component
	A few big figures with a line under each, at staggered columns. Each rolls
	in like an odometer on scroll, and its characters roll over on hover.
-->
<script lang="ts">
	import { odometer } from '$lib/motion/odometer';
	import { letterRoll } from '$lib/motion/letterRoll';

	type Figure = {
		value: number;
		label: string;
		/** First column on desktop. */
		start: number;
		/** A unit, like `MW`. */
		suffix?: string;
		/** Between thousands, if any. */
		separator?: string;
		/** A crosshair after the figure. */
		mark?: boolean;
	};

	let { items }: { items: Figure[] } = $props();

	const format = (n: number, separator = '') =>
		Math.round(n)
			.toString()
			.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
</script>

<ul class="figures">
	{#each items as item, i (i)}
		<li class="row" style:--start={item.start}>
			<p class="figure type-display type-tabular">
				<span
					{@attach odometer({ duration: 1, travel: 4, ease: 'power2.inOut', digitStagger: 0.04, delay: i * 0.12 })}
					{@attach letterRoll()}>{format(item.value, item.separator)}{item.suffix ?? ''}</span
				>
				{#if item.mark}<span class="mark" aria-hidden="true"></span>{/if}
			</p>
			<p class="label type-caption">{item.label}</p>
		</li>
	{/each}
</ul>

<style>
	.figures {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		row-gap: var(--space-16);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		grid-column: var(--start) / -1;
	}
	.figure {
		position: relative;
		display: inline-flex;
		align-items: center;
		margin: 0;
		color: var(--white);
		white-space: nowrap;
	}
	/* In em, so the line breaks the same at every width. */
	.label {
		max-width: 24em;
		margin: var(--space-12) 0 0;
		color: var(--grey-750);
	}

	/* As tall as the digits (0.74em cap height in this face), lifted a hair
	   to sit on them rather than on the line box's centre. */
	.mark {
		position: relative;
		width: 0.74em;
		height: 0.74em;
		translate: 0 -0.02em;
		margin-left: var(--space-16);
	}
	.mark::before,
	.mark::after {
		position: absolute;
		background: var(--white);
		content: '';
	}
	.mark::before {
		top: 50%;
		right: 0;
		left: 0;
		height: 1px;
	}
	.mark::after {
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
	}

	@media screen and (max-width: 767px) {
		.row {
			grid-column: 1 / -1;
		}
		.label {
			max-width: 75%;
		}
	}
</style>
