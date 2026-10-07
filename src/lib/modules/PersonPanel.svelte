<!--
	@component
	A person's panel, and the page it slides over. Wrap the page's content
	in it; `show(person)` opens the panel.

	The panel waits just past the page's right edge and slides in over it
	by its own width; the page stays where it is, dimmed beside it.

	The panel covers columns 7–12 and the margin (728px at 1440), with the
	page dimmed beside it; full width on phones. Name and role (H4)
	at the top; portrait, a rule and their bio pinned to the foot. While
	it's open the page is inert and doesn't scroll, and the wrapper rises
	above the menu button. Escape, the dimmed page and (on phones, where
	there's no dimmed page) the close button close it, handing focus back
	to the card that opened it.
-->
<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { SplitText } from 'gsap/SplitText';
	import { gsap, getLenis, prefersReducedMotion } from '$lib/scroll';
	import type { Person } from '$lib/content/company';

	let { children }: { children: Snippet } = $props();

	let person = $state<Person | null>(null);
	let open = $state(false);
	/** Where the panel sits: the scroll position when it opened. */
	let top = $state(0);
	let panel: HTMLElement;
	let dim: HTMLElement;
	let opener: HTMLElement | null = null;
	let tl: gsap.core.Timeline | null = null;

	/** How far the page dims behind the panel. */
	const DIM = 0.7;

	/** Both ways: 650ms on the panel ease (see scroll.ts). */
	const OPEN = { duration: 0.65, ease: 'panel' };
	const CLOSE = OPEN;

	/*
	 * "Click to close", set against the dimmed page's edge where the panel
	 * begins. It rides up and down that edge with the pointer, on quickTo,
	 * and its letters rise through a mask (SplitText): up into place as it
	 * appears, and on up and out as it goes. Mouse and trackpad only: on touch there's
	 * no pointer to follow.
	 */
	const LABEL = 'Click to close';
	let label: HTMLElement;
	let labelText: HTMLElement;
	let chars: Element[] = [];
	let fade: gsap.core.Tween | null = null;
	/** Open and finished sliding: the only time the label may show. */
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
			// The letters carry on up and out of the mask, then it hides.
			fade = gsap.to(chars, {
				yPercent: -100,
				// Out-eased so it moves the moment the pointer leaves.
				duration: 0.3,
				ease: 'power3.out',
				stagger: 0.008,
				overwrite: true,
				onComplete: () => gsap.set(label, { autoAlpha: 0 })
			});
			return;
		}
		// Start where the pointer is, so it doesn't glide in from where it was last.
		gsap.set(label, { x: panel.getBoundingClientRect().left });
		yTo?.(pointer.y, pointer.y);
		// Stop an exit in flight, so it can't hide the label once it's back.
		// Not `overwrite` or killTweensOf on the label: those would take
		// quickTo's y tween with it.
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
		// The panel's left edge, where the dimmed page ends.
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
		getLenis()?.stop();
		document.documentElement.classList.add('scroll-locked');
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
			// Once it lands, and not before, the label shows if the pointer is
			// on the dimmed page.
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
			getLenis()?.start();
			document.documentElement.classList.remove('scroll-locked');
			// The page is inert until this update lands; focus it after.
			await tick();
			opener?.focus({ preventScroll: true });
		};
		tl?.kill();
		if (prefersReducedMotion()) return done();
		tl = gsap
			.timeline({ defaults: CLOSE, onComplete: done })
			.to(panel, { x: 0 }, 0)
			.to(dim, { opacity: 0 }, 0);
	}

	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') hide();
	}

	// Leaving the page with the panel open: let the next page scroll again.
	$effect(() => () => {
		tl?.kill();
		if (!open) return;
		getLenis()?.start();
		document.documentElement.classList.remove('scroll-locked');
	});
</script>

<svelte:window {onkeydown} {onpointermove} {onmouseout} />

<div class="stage" class:open>
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
			<header class="head">
				<h2 id="person-name" class="name type-h4">
					{person.name}
					<span class="role">{person.role}</span>
				</h2>
				<button class="close type-body-default" type="button" onclick={hide}>Close</button>
			</header>

			<div class="body">
				<div class="portrait">
					<!-- Eager, and the card's sizes, so it reuses the image the card
					     already loaded and is there the moment the panel opens. -->
					<Picture
						{...person.image}
						ratio="996 / 648"
						surface
						loading="eager"
						sizes="(max-width: 767px) 50vw, (max-width: 991px) 33vw, 25vw"
					/>
				</div>
				<div class="about">
					<h3 class="label type-body-default">About</h3>
					<p class="bio type-body-default">{person.bio}</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Fixed to the screen, so outside the sliding panel. -->
	<div class="cursor-label" bind:this={label} aria-hidden="true">
		<span class="type-caption" bind:this={labelText}>{LABEL}</span>
	</div>
</div>

<style>
	/* Clips the panel waiting past the right edge, so it never adds a
	   sideways scroll. `clip`, not `hidden`: no scroll container. Open, it
	   rises above the fixed menu button, like a modal. */
	.stage {
		position: relative;
		overflow-x: clip;
	}
	.stage.open {
		z-index: 60;
	}

	/* Both a screen tall, at the scroll position the panel opened at; the
	   page doesn't scroll while it's open. */
	.dim {
		position: absolute;
		left: 0;
		width: 100%;
		height: 100svh;
		background: var(--grey-950);
		opacity: 0;
		pointer-events: none;
	}
	.open .dim {
		pointer-events: auto;
	}

	/* Waits just past the page's right edge. Columns 7–12 and the margin:
	   half the width plus half a gutter, 20px (the page margin) inside on
	   every side. */
	.panel {
		position: absolute;
		left: 100%;
		display: flex;
		flex-direction: column;
		width: calc(50% + var(--grid-gutter) / 2);
		height: 100svh;
		box-sizing: border-box;
		padding: var(--page-margin);
		overflow-y: auto;
		overscroll-behavior: contain;
		visibility: hidden;
		background: var(--grey-0);
		color: var(--grey-950);
		/* Its own GPU layer, so the slide never waits on it being drawn. */
		will-change: transform;
	}
	.open .panel {
		visibility: visible;
	}
	.panel:focus {
		outline: none;
	}

	/* GSAP pins its right side to the panel's edge and centres it on the
	   pointer's height; the text ends a page margin short of the edge. */
	.cursor-label {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 1;
		padding-right: var(--page-margin);
		color: var(--grey-0);
		white-space: nowrap;
		pointer-events: none;
		visibility: hidden;
	}

	.head {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--space-24);
	}
	.name {
		margin: 0;
	}
	.role {
		display: block;
		color: var(--grey-500);
	}
	/* Phones only: there the panel covers the page, so there's nothing to
	   tap outside it. */
	.close {
		display: none;
		padding: 0;
		border: 0;
		background: none;
		color: var(--grey-500);
		cursor: pointer;
	}
	.close:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}

	/* Pinned to the foot of the panel, on its six columns. */
	.body {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		margin-top: auto;
		padding-top: var(--space-64);
	}
	.portrait {
		grid-column: 5 / span 2;
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	.about {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		margin-top: var(--space-32);
		padding-top: var(--space-24);
		border-top: 1px solid var(--grey-200);
	}
	.label,
	.bio {
		margin: 0;
	}
	.label {
		grid-column: 1 / span 2;
	}
	.bio {
		grid-column: 3 / span 4;
		color: var(--grey-950);
	}

	@media screen and (max-width: 767px) {
		.panel {
			width: 100%;
		}
		.close {
			display: block;
		}
		.portrait {
			grid-column: 1 / span 3;
		}
		.label,
		.bio {
			grid-column: 1 / -1;
		}
		.bio {
			margin-top: var(--space-16);
		}
	}
</style>
