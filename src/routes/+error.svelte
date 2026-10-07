<!--
	The error page, 404s included: a dark field of stars with the copy top
	left. Antares, in the field, is the way home.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Grid from '$lib/components/Grid.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import StarField from '$lib/modules/StarField.svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import { error } from '$lib/content/error';

	const missing = $derived(page.status === 404);
	const title = $derived(missing ? error.notFound.title : String(page.status));
	const intro = $derived(missing ? error.notFound.intro : error.other.intro);

	let copy: HTMLElement;
	let arrow: SVGElement;

	onMount(() => {
		if (prefersReducedMotion()) return;
		const tween = gsap.from(copy.children, {
			autoAlpha: 0,
			y: 14,
			duration: 1.2,
			ease: 'expo.out',
			stagger: 0.1,
			delay: 0.2
		});
		return () => tween.kill();
	});

	/** The copy clears away as the stars fall into Antares. */
	function onwarp() {
		gsap.to(copy, { autoAlpha: 0, y: -8, duration: 0.5, ease: 'power2.in' });
	}

	const nudge = (x: number) => () => gsap.to(arrow, { x, duration: 0.5, ease: 'expo.out' });
</script>

<svelte:head>
	<title>{title} — Antares</title>
</svelte:head>

<Grid visible={false} />

<main class="error" data-tone="dark">
	<StarField {...error.star} href={error.home.href} home={error.home.label} {onwarp} />

	<Row>
		<Cell span={4} tablet={{ span: 6 }}>
			<div class="copy" bind:this={copy} data-stars-avoid>
				<h1 class="type-h3">{title}</h1>
				<p class="type-body-large">{intro}</p>
				<a
					class="home type-body-default"
					href={error.home.href}
					onmouseenter={nudge(4)}
					onmouseleave={nudge(0)}
				>
					{error.home.label}
					<svg bind:this={arrow} viewBox="0 0 16 16" aria-hidden="true">
						<path d="M2 8h12M8.27 13.72 14 8 8.27 2.26" />
					</svg>
				</a>
			</div>
		</Cell>
	</Row>
</main>

<style>
	/* The whole page is dark, html included, so overscroll doesn't flash white. */
	:global(html:has(main.error)) {
		background: var(--grey-850);
	}

	.error {
		position: relative;
		box-sizing: border-box;
		min-height: 100svh;
		padding: var(--space-128) var(--grid-margin) 0;
		overflow: hidden;
		background: var(--grey-850);
		color: var(--grey-0);
	}

	/* Above the field. */
	.copy {
		position: relative;
		z-index: 1;
	}
	h1 {
		margin: 0;
	}
	p {
		margin: var(--space-16) 0 0;
		color: var(--grey-400);
	}
	.home {
		display: inline-flex;
		gap: var(--space-8);
		align-items: center;
		margin-top: var(--space-32);
		color: var(--grey-0);
		text-decoration: none;
	}
	.home svg {
		width: calc(var(--size-font) * 1);
		height: calc(var(--size-font) * 1);
		fill: none;
		stroke: currentColor;
	}
</style>
