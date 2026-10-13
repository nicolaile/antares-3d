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
	import ToggleRing from '$lib/components/ToggleRing.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
	import type { Capability } from '$lib/content/home';

	let {
		label,
		intro,
		items,
		closeSiblings = true
	}: {
		/** Optional: without one (and no intro), the list stands on its own. */
		label?: string;
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
	/** Which row the pointer is over: its ring darkens (ToggleRing). */
	let hovered = $state(-1);

	const MOTION = { duration: 0.6, ease: 'power3.inOut' };

	/** Opens or closes row `i`'s panel by height; its ring turns + to − with it. */
	function set(i: number, on: boolean) {
		if (open[i] === on) return;
		open[i] = on;
		const el = panels[i];
		gsap.killTweensOf(el);
		if (prefersReducedMotion()) {
			gsap.set(el, { height: on ? 'auto' : 0 });
			return;
		}
		gsap.fromTo(el, { height: el.offsetHeight }, { height: on ? 'auto' : 0, ...MOTION });
	}

	function toggle(i: number) {
		const on = !open[i];
		if (on && closeSiblings) open.forEach((o, j) => o && j !== i && set(j, false));
		set(i, on);
	}
</script>

<section class="capabilities" class:headed={intro} aria-labelledby={label ? `${id}-label` : undefined}>
	{#if intro}
		<Row>
			<Cell span={3} tablet={{ span: 5 }}>
				<h2 id="{id}-label" class="section-title type-h5">{label}</h2>
				<p class="intro type-body-default">{intro}</p>
			</Cell>
		</Row>
	{:else if label}
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
						onpointerenter={() => (hovered = i)}
						onpointerleave={() => (hovered = -1)}
					>
						<span class="number type-caption type-tabular">{i + 1}</span>
						<span class="title type-h3">{item.title}</span>
						<span class="toggle"><ToggleRing open={open[i]} active={hovered === i} /></span>
					</button>
				</h3>
				<!-- Inert while closed, so a collapsed row is neither read nor tabbed into. -->
				<div
					class="panel"
					id="{id}-{i}"
					bind:this={panels[i]}
					style:height={i === 0 ? 'auto' : '0px'}
					inert={!open[i]}
				>
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
	/* A little more room above than the page's gap between sections (40px
	   at 1440), so the heading starts its own part of the page. */
	.capabilities {
		padding-top: var(--space-40);
	}

	.label,
	.section-title,
	.intro,
	.heading {
		margin: 0;
	}
	.intro {
		margin-top: var(--space-16);
		color: var(--grey-700);
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
	.headed .list {
		margin-top: var(--space-56);
	}
	.item + .item {
		border-top: 1px solid var(--grey-200);
	}

	/* The row's head and body both on the page's twelve columns, edge to
	   edge in the box (which spans the grid), so the title and paragraph
	   start on the page's second column; the number, ring and photo keep
	   16px in from the box's sides. */
	.head,
	.body {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
	}

	.head {
		align-items: start;
		width: 100%;
		padding: var(--space-16) 0;
		border: 0;
		background: none;
		color: var(--black);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.head:focus-visible {
		outline: 1px solid var(--black);
		outline-offset: -4px;
	}
	.number {
		grid-column: 1;
		padding-top: var(--space-8);
		padding-left: var(--space-16);
	}
	.title {
		grid-column: 2 / span 9;
	}

	/* The ring's place in the row; the ring itself is ToggleRing. */
	.toggle {
		grid-column: 12;
		justify-self: end;
		margin-right: var(--space-16);
		display: flex;
	}

	.panel {
		overflow: hidden;
	}
	/* 32px under the photo; the paragraph sits 32px higher again, 64px
	   off the next row's rule. */
	.body {
		align-items: end;
		padding: 0 0 var(--space-32);
	}
	.text {
		grid-column: 2 / span 4;
		margin: 0 0 var(--space-32);
		color: var(--grey-700);
	}
	.image {
		grid-column: 10 / span 3;
		margin-right: var(--space-16);
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
		/* One column of text: back to 16px in on both sides. */
		.head {
			padding: var(--space-16);
		}
		.body {
			padding: 0 var(--space-16) var(--space-32);
		}
		.number,
		.toggle,
		.image {
			padding-left: 0;
			margin-right: 0;
		}
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
