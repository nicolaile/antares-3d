<!--
	@component
	A labelled accordion in a hairline box: each row a title that opens to a
	paragraph and photo. The first row starts open.
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
		label?: string;
		/** Turns the label into a heading over this paragraph. */
		intro?: string;
		items: Capability[];
		/** Opening a row closes the open one; off, rows toggle independently. */
		closeSiblings?: boolean;
	} = $props();

	let open = $state(untrack(() => items.map((_, i) => i === 0)));
	const id = $props.id();
	let panels: HTMLElement[] = $state([]);
	let bodies: HTMLElement[] = $state([]);
	/** The hovered row's ring darkens. */
	let hovered = $state(-1);

	const MOTION = { duration: 0.6, ease: 'power3.inOut' };

	/**
	 * Closed, a panel keeps its min-height as room under the title, and its
	 * content fades out so none of it shows in that room.
	 */
	function set(i: number, on: boolean) {
		if (open[i] === on) return;
		open[i] = on;
		const el = panels[i];
		const body = bodies[i];
		const height = on ? 'auto' : getComputedStyle(el).minHeight;
		gsap.killTweensOf([el, body]);
		if (prefersReducedMotion()) {
			gsap.set(el, { height });
			gsap.set(body, { autoAlpha: on ? 1 : 0 });
			return;
		}
		gsap.fromTo(el, { height: el.offsetHeight }, { height, ...MOTION });
		gsap.to(body, { autoAlpha: on ? 1 : 0, ...MOTION });
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
						<span class="title type-h3">{item.title}</span>
						<span class="toggle"><ToggleRing open={open[i]} active={hovered === i} /></span>
					</button>
				</h3>
				<!-- Closed, the 0 height gives way to the min-height. -->
				<div class="panel" id="{id}-{i}" bind:this={panels[i]} style:height={i === 0 ? 'auto' : '0px'} inert={!open[i]}>
					<div class="body" bind:this={bodies[i]} style:opacity={i === 0 ? 1 : 0}>
						<p class="text type-body-default">{item.text}</p>
						<div class="image">
							<Picture
								{...item.image}
								ratio="{item.image.src.img.w} / {item.image.src.img.h}"
								sizes="(max-width: 767px) 100vw, 25vw"
							/>
						</div>
					</div>
				</div>
			</li>
		{/each}
	</ol>
</section>

<style>
	/* Extra room above, so the heading starts its own part of the page. */
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

	/* Head and body on the page's columns (the box spans the grid), so the
	   paragraph lines up with the page's second column. */
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
	.title {
		grid-column: 1 / span 10;
		padding-left: var(--space-16);
	}

	.toggle {
		grid-column: 12;
		justify-self: end;
		margin-right: var(--space-16);
		display: flex;
	}

	/* The min-height is a closed row's room under its title. */
	.panel {
		min-height: var(--space-40);
		overflow: hidden;
	}
	.body {
		align-items: end;
		padding: var(--space-20) 0 var(--space-24);
	}
	.text {
		grid-column: 2 / span 4;
		margin: 0 0 var(--space-40);
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

	/* Phones: the photo, then the paragraph. */
	@media screen and (max-width: 767px) {
		.head {
			padding: var(--space-16);
		}
		.body {
			padding: var(--space-20) var(--space-16) var(--space-24);
		}
		.title,
		.toggle,
		.image {
			padding-left: 0;
			margin-right: 0;
		}
		.toggle {
			grid-column: 11 / span 2;
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
