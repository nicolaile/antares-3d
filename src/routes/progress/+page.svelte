<script lang="ts">
	import { onMount } from 'svelte';
	import { SplitText } from 'gsap/SplitText';
	import Grid from '$lib/components/Grid.svelte';
	import TimelineEntry from '$lib/components/TimelineEntry.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Blueprint from '$lib/modules/Blueprint.svelte';
	import ExplodedView from '$lib/modules/ExplodedView.svelte';
	import Figures from '$lib/modules/Figures.svelte';
	import Footer from '$lib/modules/Footer.svelte';
	import ImageCluster from '$lib/modules/ImageCluster.svelte';
	import QuoteBand from '$lib/modules/QuoteBand.svelte';
	import { gsap, initScroll, destroyScroll, prefersReducedMotion } from '$lib/scroll';
	import { splitReveal } from '$lib/splitReveal';
	import { progress } from '$lib/content/progress';
	import { footer } from '$lib/content/site';

	gsap.registerPlugin(SplitText);

	const { title, intro, model, entries, built, drawing, figures, ahead, quote } = progress;

	let hero: HTMLElement;
	let name: HTMLElement;
	let opening: HTMLElement;

	/**
	 * The ruler stands under the name's first letter: its left edge, as ink
	 * (the text, not the right-aligned block), measured from the view's.
	 */
	function alignRuler() {
		const view = opening.querySelector('.view');
		if (!view) return;
		const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
		const range = document.createRange();
		let left = Infinity;
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (!node.textContent?.trim()) continue;
			range.selectNodeContents(node);
			left = Math.min(left, range.getBoundingClientRect().left);
		}
		if (left === Infinity) return;
		opening.style.setProperty('--ruler-x', `${left - view.getBoundingClientRect().left}px`);
	}

	/**
	 * The opening: the title's lines rise from behind their masks
	 * (`splitReveal`), and the model's name after them, letter by letter. Then, with the scroll, the
	 * name sinks slower than the page as the hero leaves.
	 */
	onMount(() => {
		initScroll();
		alignRuler();
		const resize = new ResizeObserver(alignRuler);
		resize.observe(hero);
		document.fonts.ready.then(alignRuler);
		if (prefersReducedMotion())
			return () => {
				resize.disconnect();
				destroyScroll();
			};
		let split: SplitText | undefined;
		const ctx = gsap.context(() => {
			split = SplitText.create(name, { type: 'lines,chars', mask: 'lines' });
			gsap.from(split.chars, { yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.08, delay: 0.4 });
			gsap.to(name, {
				yPercent: 60,
				ease: 'none',
				scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
			});
		}, hero);
		return () => {
			resize.disconnect();
			ctx.revert();
			split?.revert();
			destroyScroll();
		};
	});
</script>

<svelte:head>
	<title>Progress — Antares</title>
	<meta name="description" content={intro} />
</svelte:head>

<Grid visible={false} />

<main class="progress">
	<section class="hero" bind:this={hero}>
		<Row>
			<Cell span={6} tablet={{ span: 8 }}>
				<h1 class="title type-h1" {@attach splitReveal()}>
					{#each title as line, i (i)}{#if i > 0}<br />{/if}{line}{/each}
				</h1>
			</Cell>
			<Cell start={9} span={4} tablet={{ start: 9, span: 4 }} mobile={{ start: 9, span: 4 }}>
				<p class="name type-display" bind:this={name}>{model.name}</p>
			</Cell>
		</Row>

		<div class="opening" bind:this={opening}>
			<Row align="center" gap={64}>
				<Cell subgrid span={6} tablet={{ span: 7 }}>
					<TimelineEntry {...entries[0]} />
				</Cell>
				<Cell start={8} span={3} tablet={{ start: 8, span: 3 }} mobile={{ start: 3, span: 6 }}>
					<ExplodedView {...model} />
				</Cell>
			</Row>
		</div>
	</section>

	<section class="built" aria-label="Building in 2025">
		<ImageCluster items={built} />
	</section>

	<section class="drawing">
		<Row align="center" gap={64}>
			<Cell subgrid span={6} tablet={{ span: 7 }}>
				<TimelineEntry {...entries[1]} />
			</Cell>
			<Cell start={7} span={6} tablet={{ start: 8, span: 5 }} mobile={{ start: 2, span: 11 }}>
				<div class="bleed"><Blueprint {...drawing} /></div>
			</Cell>
		</Row>
	</section>

	<section class="figures" aria-label="In figures">
		<Figures items={figures} />
	</section>

	<section class="ahead">
		<Row>
			<Cell subgrid span={6} tablet={{ span: 7 }}>
				<TimelineEntry {...entries[2]} />
			</Cell>
		</Row>
		<div class="cluster"><ImageCluster items={ahead} /></div>
	</section>
</main>

<QuoteBand {...quote} />

<Footer {...footer} tone="grey" rule={false} />

<style>
	/* The whole page on the mid grey, html included, so overscroll doesn't
	   flash white; the header bar comes in on it too. */
	:global(html:has(main.progress)),
	:global(body:has(main.progress)) {
		background: var(--grey-400);
	}
	:global(html:has(main.progress)) {
		--header-light: var(--grey-400);
	}
	/* The corner wordmark in black: its difference blend reads mid grey here. */
	:global(html:has(main.progress) a.mark) {
		color: var(--black);
		mix-blend-mode: normal;
	}

	/* On the grid's margins; anything running past the right edge is cut
	   there. */
	.progress {
		padding: var(--space-160) var(--grid-margin) var(--space-120);
		overflow-x: clip;
	}

	.title,
	.name {
		margin: 0;
	}
	/* The model's name in white, set flush right. */
	.name {
		color: var(--white);
		text-align: right;
	}
	.opening {
		margin-top: var(--space-64);
	}
	/* The render and its ruler lifted a little, and a touch past their
	   columns: the ruler still spans the machine, and stays under the name. */
	.opening :global(.view) {
		width: 108%;
		translate: 0 calc(var(--space-120) * -1);
	}
	/* Only the render nudged right, closer to its ruler; the ruler stays
	   under the name. */
	.opening :global(.view .slice) {
		translate: var(--space-48) 0;
	}

	.built {
		margin-top: 0;
	}
	.drawing {
		margin-top: var(--space-160);
	}
	/* Only the drawing lifted, the section's spacing left as it is. */
	.drawing :global(.sheet svg) {
		translate: 0 calc(var(--space-48) * -1);
	}
	/* Its columns and on to the screen's edge, where the drawing's own crop
	   meets it. */
	.bleed {
		width: calc(100% + var(--grid-margin));
	}
	.figures {
		margin-top: var(--space-64);
	}
	.ahead {
		margin-top: calc(var(--space-160) + var(--space-80));
	}
	.cluster {
		margin-top: var(--space-16);
	}

	@media screen and (max-width: 767px) {
		.cluster {
			margin-top: var(--space-64);
		}
	}
</style>
