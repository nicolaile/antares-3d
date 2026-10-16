<!--
	@component
	A person's panel, and the page it slides over. Wrap the page's content
	in it; `show(person)` opens the panel.

	The panel slides in from the right over the dimmed page (full width on
	phones). While open, everything outside it is inert and doesn't scroll.
	Escape, the dimmed page or (on phones) the close button close it, handing
	focus back to the card that opened it.
-->
<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import closeIcon from '$lib/assets/icons/close.svg?raw';
	import { SplitText } from 'gsap/SplitText';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
	import { holdPage } from '$lib/chrome/modal';
	import type { Person } from '$lib/content/company';

	let { children }: { children: Snippet } = $props();

	let person = $state<Person | null>(null);
	let open = $state(false);
	/** The scroll position when it opened, where the panel sits. */
	let top = $state(0);
	let stage: HTMLElement;
	let panel: HTMLElement;
	let dim: HTMLElement;
	let opener: HTMLElement | null = null;
	let tl: gsap.core.Timeline | null = null;
	/** Undoes `holdPage`. */
	let release: (() => void) | null = null;
	const releaseAll = () => {
		release?.();
		release = null;
	};

	/** Overlay opacity when open. */
	const DIM = 0.85;

	/** The `panel` ease is defined in scroll.ts. */
	const OPEN = { duration: 0.65, ease: 'panel' };
	const CLOSE = OPEN;

	/*
	 * A cursor label against the panel's left edge, following the pointer's
	 * height, its letters rising through a mask. Fine pointers only.
	 */
	const LABEL = 'Click to close';
	let label: HTMLElement;
	let labelText: HTMLElement;
	let chars: Element[] = [];
	let fade: gsap.core.Tween | null = null;
	/** Open and finished sliding; the label shows only then. */
	let settled = false;
	let fine = false;
	let labelShown = false;
	let yTo: gsap.QuickToFunc | null = null;
	/** The last pointer position, for checking what's under it after a slide. */
	let pointer = { x: 0, y: 0 };

	$effect(() => {
		fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
		gsap.registerPlugin(SplitText);
		gsap.set(label, { autoAlpha: 0, xPercent: -100, yPercent: -50 });
		yTo = gsap.quickTo(label, 'y', { duration: 0.4, ease: 'power3.out' });
		const split = SplitText.create(labelText, { type: 'chars', mask: 'chars' });
		chars = split.chars;
		return () => split.revert();
	});

	function setLabel(on: boolean) {
		if (!fine || on === labelShown) return;
		labelShown = on;
		if (!on) {
			if (prefersReducedMotion()) {
				gsap.set(label, { autoAlpha: 0 });
				return;
			}
			fade = gsap.to(chars, {
				yPercent: -100,
				duration: 0.3,
				ease: 'power3.out',
				stagger: 0.008,
				overwrite: true,
				onComplete: () => gsap.set(label, { autoAlpha: 0 })
			});
			return;
		}
		// Start at the pointer, not gliding over from where it last was.
		gsap.set(label, { x: panel.getBoundingClientRect().left });
		yTo?.(pointer.y, pointer.y);
		// Kill an exit in flight so it can't hide the label once it's back. Not
		// `overwrite` or killTweensOf on the label: those would kill quickTo's tween.
		fade?.kill();
		gsap.set(label, { autoAlpha: 1 });
		if (prefersReducedMotion()) return;
		gsap.fromTo(
			chars,
			{ yPercent: 100 },
			{ yPercent: 0, duration: 0.6, ease: 'power3.out', stagger: 0.015, overwrite: true }
		);
	}

	/** Shows the label if the pointer is resting on the dimmed page. */
	function checkLabel() {
		setLabel(settled && document.elementFromPoint(pointer.x, pointer.y) === dim);
	}

	function onpointermove(e: PointerEvent) {
		pointer = { x: e.clientX, y: e.clientY };
		if (!fine || !settled) return;
		gsap.set(label, { x: panel.getBoundingClientRect().left });
		yTo?.(e.clientY);
		setLabel(settled && e.target === dim);
	}

	/** The pointer left the window. */
	function onmouseout(e: MouseEvent) {
		if (!e.relatedTarget) setLabel(false);
	}

	export async function show(next: Person) {
		person = next;
		if (open) return;
		opener = document.activeElement as HTMLElement | null;
		top = window.scrollY;
		open = true;
		release = holdPage(stage);
		await tick();
		panel.scrollTop = 0;
		panel.focus({ preventScroll: true });

		tl?.kill();
		if (prefersReducedMotion()) {
			gsap.set(panel, { x: -panel.offsetWidth });
			gsap.set(dim, { opacity: DIM });
			settled = true;
			checkLabel();
			return;
		}
		tl = gsap
			// The label may show only once it lands.
			.timeline({
				defaults: OPEN,
				onComplete: () => {
					settled = true;
					checkLabel();
				}
			})
			.fromTo(panel, { x: 0 }, { x: () => -panel.offsetWidth }, 0)
			.fromTo(dim, { opacity: 0 }, { opacity: DIM }, 0);
	}

	function hide() {
		if (!open) return;
		settled = false;
		setLabel(false);
		const done = async () => {
			gsap.set(panel, { clearProps: 'transform' });
			open = false;
			releaseAll();
			// The page is inert until this update lands; focus it after.
			await tick();
			opener?.focus({ preventScroll: true });
		};
		tl?.kill();
		if (prefersReducedMotion()) return done();
		tl = gsap.timeline({ defaults: CLOSE, onComplete: done }).to(panel, { x: 0 }, 0).to(dim, { opacity: 0 }, 0);
	}

	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') hide();
	}

	// Navigating away while open: release so the next page scrolls.
	$effect(() => () => {
		tl?.kill();
		releaseAll();
	});
</script>

<svelte:window {onkeydown} {onpointermove} {onmouseout} />

<div class="stage" class:open bind:this={stage}>
	<div class="page" inert={open}>
		{@render children()}
	</div>

	<!-- Pointer-only close target; Escape covers the keyboard. -->
	<div class="dim" bind:this={dim} style:top="{top}px" onclick={hide} aria-hidden="true"></div>

	<div
		class="panel"
		bind:this={panel}
		style:top="{top}px"
		role="dialog"
		aria-modal="true"
		aria-labelledby="person-name"
		tabindex="-1"
	>
		{#if person}
			<button class="close type-caption" type="button" onclick={hide}>
				Close
				<span class="close-icon" aria-hidden="true">{@html closeIcon}</span>
			</button>

			<h2 id="person-name" class="name type-sub-headline">
				{person.name}
				<span class="role">{person.role}</span>
			</h2>

			<div class="portrait">
				<!-- Eager, so it reuses the card's loaded image where it can. -->
				<Picture
					{...person.image}
					ratio="996 / 648"
					surface
					loading="eager"
					sizes="(max-width: 767px) 100vw, 33vw"
				/>
			</div>

			<p class="bio type-body-default">{person.bio}</p>
		{/if}
	</div>

	<!-- Fixed, so it lives outside the transformed panel. -->
	<div class="cursor-label" bind:this={label} aria-hidden="true">
		<span class="type-caption" bind:this={labelText}>{LABEL}</span>
	</div>
</div>

<style>
	/* Clips the waiting panel so it never adds a sideways scroll (`clip`, not
	   `hidden`: no scroll container). Open, it rises above the menu button. */
	.stage {
		position: relative;
		overflow-x: clip;
	}
	.stage.open {
		z-index: 60;
	}

	/* Placed at the scroll position it opened at; the page is scroll-locked. */
	.dim {
		position: absolute;
		left: 0;
		width: 100%;
		height: 100svh;
		background: var(--black);
		opacity: 0;
		pointer-events: none;
	}
	.open .dim {
		pointer-events: auto;
	}

	/* Waits past the right edge; a third of the grid plus a gutter's third
	   covers columns 9–12 and the margin. */
	.panel {
		position: absolute;
		left: 100%;
		display: flex;
		flex-direction: column;
		width: calc((100% - 2 * var(--grid-margin) + var(--grid-gutter)) / 3 + var(--grid-margin));
		height: 100svh;
		box-sizing: border-box;
		padding: var(--page-margin);
		overflow-y: auto;
		overscroll-behavior: contain;
		visibility: hidden;
		background: var(--black);
		color: var(--white);
		/* Its own layer, so the slide never waits on it being drawn. */
		will-change: transform;
	}
	.open .panel {
		visibility: visible;
	}
	.panel:focus {
		outline: none;
	}

	/* GSAP pins its right side to the panel's edge at the pointer's height. */
	.cursor-label {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 1;
		padding-right: var(--page-margin);
		color: var(--white);
		white-space: nowrap;
		pointer-events: none;
		visibility: hidden;
	}

	/* Top right, on every size: Escape and the dimmed page also close it. */
	.close {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		align-self: flex-end;
		padding: 0;
		border: 0;
		background: none;
		color: var(--white);
		cursor: pointer;
	}
	/* Sized to the 14px label. */
	.close-icon :global(svg) {
		display: block;
		width: var(--space-12);
		height: var(--space-12);
	}
	.close:focus-visible {
		outline: 1px solid var(--white);
		outline-offset: 2px;
	}

	.name,
	.bio {
		margin: 0;
	}
	/* Nothing shrinks to fit a short window (the portrait would crop); the
	   panel scrolls instead. */
	.panel > * {
		flex-shrink: 0;
	}
	.name {
		margin-top: var(--space-160);
	}
	.role {
		display: block;
		color: var(--grey-400);
	}
	.portrait {
		margin-top: var(--space-16);
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	.bio {
		margin-top: var(--space-16);
		color: var(--grey-400);
	}

	/* Tablet: columns 7–12, as a third would be too narrow. */
	@media screen and (max-width: 991px) {
		.panel {
			width: calc(50% + var(--grid-gutter) / 2);
		}
	}
	@media screen and (max-width: 767px) {
		.panel {
			width: 100%;
		}
		.name {
			margin-top: var(--space-64);
		}
	}
</style>
