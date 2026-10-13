<!--
	The error page, 404s included: a black field of stars with the status,
	large, top left. Antares, in the field, is the way home.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import StarField from '$lib/modules/StarField.svelte';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
	import { error } from '$lib/content/error';

	const missing = $derived(page.status === 404);
	const title = $derived(missing ? error.notFound.title : String(page.status));

	let copy: HTMLElement;

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
</script>

<svelte:head>
	<title>{title} — Antares</title>
</svelte:head>


<main class="error" data-tone="dark">
	<StarField {...error.star} href={error.home.href} home={error.home.label} {onwarp} />

	<Row>
		<Cell span={4} tablet={{ span: 6 }}>
			<div class="copy" bind:this={copy} data-stars-avoid>
				<h1 class="type-display">{title}</h1>
			</div>
		</Cell>
	</Row>
</main>

<style>
	/* The whole page is dark, html included, so overscroll doesn't flash white. */
	:global(html:has(main.error)) {
		background: var(--black);
	}

	.error {
		position: relative;
		box-sizing: border-box;
		min-height: 100svh;
		padding: var(--space-128) var(--grid-margin) 0;
		overflow: hidden;
		background: var(--black);
		color: var(--white);
	}

	/* Above the field. */
	.copy {
		position: relative;
		z-index: 1;
	}
	h1 {
		margin: 0;
	}

</style>
