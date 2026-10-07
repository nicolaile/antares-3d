<!--
	@component
	A labelled accordion in a hairline box: one row per item, its number in
	the first column, its title in H2 from the second, and a round + button
	at the far right. One row is open at a time (the first, to start), or
	any number with `closeSiblings` off: the +'s upright turns flat into a −,
	and under the title its paragraph sits on columns
	2–5, level with the foot of its photo on 10–12. Rows open and close by
	height, with GSAP. On phones the photo comes first, the paragraph
	under it.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import type { Capability } from '$lib/content/home';

	let {
		label,
		intro,
		items,
		closeSiblings = true
	}: {
		label: string;
		/** With an intro, the label becomes a heading over a short paragraph. */
		intro?: string;
		items: Capability[];
		/** Opening a row closes the one open; off, rows open and close on their own. */
		closeSiblings?: boolean;
	} = $props();

	/** Which rows are open: the first, to start. */
	let open = $state(untrack(() => items.map((_, i) => i === 0)));
	const id = $props.id();
	let panels: HTMLElement[] = $state([]);
	/** Each row's button ring, whose dark ring fades in on hover and while open. */
	let rings: HTMLElement[] = $state([]);
	/** Each row's upright stroke, which lies flat to make the − . */
	let uprights: SVGPathElement[] = $state([]);

	const MOTION = { duration: 0.6, ease: 'power3.inOut' };

	/** Opens or closes row `i`'s panel by height, its + morphing to − with it. */
	function set(i: number, on: boolean) {
		if (open[i] === on) return;
		open[i] = on;
		const el = panels[i];
		gsap.killTweensOf([el, uprights[i]]);
		if (prefersReducedMotion()) {
			gsap.set(el, { height: on ? 'auto' : 0 });
			gsap.set(uprights[i], { rotate: on ? 90 : 0, svgOrigin: '8 8' });
			return;
		}
		ring(i, on);
		gsap.fromTo(el, { height: el.offsetHeight }, { height: on ? 'auto' : 0, ...MOTION });
		gsap.to(uprights[i], { rotate: on ? 90 : 0, svgOrigin: '8 8', ...MOTION });
	}

	/** Fades row `i`'s dark ring in or out. */
	function ring(i: number, on: boolean) {
		gsap.to(rings[i], { '--ring': on ? 1 : 0, duration: 0.4, ease: 'power2.out', overwrite: true });
	}

	function toggle(i: number) {
		const on = !open[i];
		if (on && closeSiblings) open.forEach((o, j) => o && j !== i && set(j, false));
		set(i, on);
	}
</script>

<section class="capabilities" aria-labelledby="{id}-label">
	{#if intro}
		<Row>
			<Cell span={3} tablet={{ span: 5 }}>
				<h2 id="{id}-label" class="section-title type-h3">{label}</h2>
				<p class="intro type-body-default">{intro}</p>
			</Cell>
		</Row>
	{:else}
		<h2 id="{id}-label" class="label type-caption">{label}</h2>
	{/if}
	<ol class="list">
		{#each items as item, i (i)}
			<li class="item" class:open={open[i]}>
				<h3 class="heading">
					<button
						type="button"
						class="head"
						aria-expanded={open[i]}
						aria-controls="{id}-{i}"
						onclick={() => toggle(i)}
						onpointerenter={() => ring(i, true)}
						onpointerleave={() => ring(i, open[i])}
					>
						<span class="number type-caption type-tabular">{i + 1}</span>
						<span class="title type-h2">{item.title}</span>
						<span class="toggle" aria-hidden="true" bind:this={rings[i]} style:--ring={i === 0 ? 1 : 0}>
							<!-- add.svg / minus.svg's strokes, drawn here so the upright can turn. -->
							<svg viewBox="0 0 16 16" fill="none">
								<path d="M15 8H1" stroke="currentColor" />
								<path
									d="M8 15V1"
									stroke="currentColor"
									bind:this={uprights[i]}
									transform={i === 0 ? 'rotate(90 8 8)' : undefined}
								/>
							</svg>
						</span>
					</button>
				</h3>
				<div class="panel" id="{id}-{i}" bind:this={panels[i]} style:height={i === 0 ? 'auto' : '0px'}>
					<div class="body">
						<p class="text type-body-default">{item.text}</p>
						<div class="image">
							<Picture {...item.image} ratio="{item.image.src.img.w} / {item.image.src.img.h}" sizes="(max-width: 767px) 100vw, 25vw" />
						</div>
					</div>
				</div>
			</li>
		{/each}
	</ol>
</section>

<style>
	.label,
	.section-title,
	.intro,
	.heading {
		margin: 0;
	}
	.intro {
		margin-top: var(--space-16);
		color: var(--grey-500);
	}
	.label {
		color: var(--grey-700);
	}

	/* A hairline box, the rows divided by hairlines. */
	.list {
		margin: var(--space-40) 0 0;
		padding: 0;
		border: 1px solid var(--grey-200);
		border-radius: var(--card-radius);
		list-style: none;
	}
	.item + .item {
		border-top: 1px solid var(--grey-200);
	}

	/* The row's head and body both on the page's twelve columns, so the
	   title and paragraph line up with the grid outside the box. */
	.head,
	.body {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
	}

	.head {
		align-items: start;
		width: 100%;
		padding: var(--space-16);
		border: 0;
		background: none;
		color: var(--grey-950);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.head:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: -4px;
	}
	.number {
		grid-column: 1;
		padding-top: var(--space-8);
	}
	.title {
		grid-column: 2 / span 9;
	}

	/* 36px round, a light ring closed; the dark one fades in over it on
	   hover and while open (--ring, 0 to 1, tweened by GSAP). */
	.toggle {
		grid-column: 12;
		justify-self: end;
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 2.25);
		height: calc(var(--size-font) * 2.25);
		box-sizing: border-box;
		position: relative;
		border: 1px solid var(--grey-300);
		border-radius: 50%;
	}
	.toggle::after {
		position: absolute;
		inset: -1px;
		border: 1px solid var(--grey-950);
		border-radius: 50%;
		opacity: var(--ring, 0);
		content: '';
	}
	.toggle :global(svg) {
		display: block;
		width: calc(var(--size-font) * 0.875);
		height: calc(var(--size-font) * 0.875);
	}

	.panel {
		overflow: hidden;
	}
	/* 32px under the photo; the paragraph sits 32px higher again, 64px
	   off the next row's rule. */
	.body {
		align-items: end;
		padding: 0 var(--space-16) var(--space-32);
	}
	.text {
		grid-column: 2 / span 4;
		margin: 0 0 var(--space-32);
		color: var(--grey-700);
	}
	.image {
		grid-column: 10 / span 3;
		overflow: hidden;
		border-radius: var(--card-radius);
	}

	@media screen and (max-width: 991px) {
		.text {
			grid-column: 2 / span 6;
		}
		.image {
			grid-column: 9 / span 4;
		}
	}

	/* The number above the title; the photo, then the paragraph. */
	@media screen and (max-width: 767px) {
		.number {
			grid-column: 1 / span 6;
			grid-row: 1;
			padding-top: 0;
		}
		.title {
			grid-column: 1 / span 10;
			grid-row: 2;
			margin-top: var(--space-16);
		}
		.toggle {
			grid-column: 11 / span 2;
			grid-row: 1 / span 2;
		}
		.image {
			grid-column: 1 / -1;
			grid-row: 1;
		}
		.text {
			grid-column: 1 / -1;
			grid-row: 2;
			margin-top: var(--space-24);
		}
	}
</style>
