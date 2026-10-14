<!--
	@component
	The site menu: a round toggle fixed top-right. Opening dims the page and
	grows a panel out of the button's corner (across, then down) before the
	links rise in. Escape, the dimmed page and any link close it.

	State lives on `data-nav-status`; `data-nav-toggle` marks what opens and
	closes it. The panel holds the links on top and the latest updates at the
	bottom, which auto-cycle while open (the dashes pick one directly).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
	import { header } from '$lib/chrome/header.svelte';
	import { holdPage } from '$lib/chrome/modal';
	import type { Link, Update } from '$lib/content/site';

	/**
	 * Hovering a link greys the rest of its list, so the hovered one stands
	 * out; leaving the list brings them all back to black.
	 */
	function dim(e: PointerEvent) {
		const list = e.currentTarget as HTMLElement;
		const hovered = e.type === 'pointerleave' ? null : (e.target as Element).closest('.link');
		if (e.type !== 'pointerleave' && !hovered) return;
		const token = (name: string) => getComputedStyle(list).getPropertyValue(name).trim();
		for (const link of list.querySelectorAll('.link')) {
			const color = token(!hovered || link === hovered ? '--black' : '--grey-700');
			gsap.to(link, { color, duration: prefersReducedMotion() ? 0 : 0.2, ease: 'power1.out', overwrite: 'auto' });
		}
	}

	let {
		links,
		secondary = [],
		updates = [],
		current = '/'
	}: {
		links: Link[];
		secondary?: Link[];
		updates?: Update[];
		/** The current path; its link is marked. */
		current?: string;
	} = $props();

	let open = $state(false);
	/** The active dash's CSS fill animation advances this when it ends. */
	let shown = $state(0);
	const next = () => (shown = (shown + 1) % updates.length);
	let slides = $state<HTMLElement>();
	let swap: gsap.core.Timeline | null = null;

	/**
	 * Turns updates like a wheel: the old one tilts out through the top as the
	 * new one rolls in from below; an earlier dash mirrors it. A switch mid-turn
	 * finishes the running one first so nothing is left half-turned.
	 */
	function transition(from: number, to: number) {
		swap?.progress(1).kill();
		swap = null;
		if (!slides || prefersReducedMotion()) return;
		const out = slides.children[from] as HTMLElement;
		const inn = slides.children[to] as HTMLElement;
		const dir = to === (from + 1) % updates.length || to > from ? 1 : -1;
		const travel = slides.offsetHeight * dir;
		// Keep the outgoing update drawn until it has turned out of the clipped frame.
		gsap.set(out, { visibility: 'inherit' });
		swap = gsap
			.timeline({
				defaults: { duration: 1.2, ease: 'menu', lazy: false },
				onComplete: () => gsap.set([out, inn], { clearProps: 'all' })
			})
			.to(out, { y: -travel, scale: 0.85, rotationX: 50 * dir }, 0)
			.fromTo(
				inn,
				{ y: travel, scale: 0.85, rotationX: -40 * dir, autoAlpha: 0 },
				{ y: 0, scale: 1, rotationX: 0, autoAlpha: 1 },
				0
			);
	}

	let last = 0;
	$effect(() => {
		const i = shown;
		if (i !== last) transition(last, i);
		last = i;
	});
	let nav: HTMLElement;
	let panel: HTMLElement;
	let overlay: HTMLElement;
	let toggle: HTMLElement;
	let tl: gsap.core.Timeline | null = null;

	/** Overlay opacity when open. */
	const DIM = 0.7;

	/**
	 * The panel's clip-path insets and radius, in px, as separate properties
	 * so the widening (left) and dropping (bottom) tweens can overlap without
	 * overwriting each other mid-way.
	 */
	const mask = { left: 0, bottom: 0, radius: 0 };
	const paint = () => {
		panel.style.clipPath = `inset(0px 0px ${mask.bottom}px ${mask.left}px round ${mask.radius}px)`;
	};

	/** Measured fresh each time so a resize is picked up. */
	function geometry() {
		return {
			w: panel.offsetWidth,
			h: panel.offsetHeight,
			b: toggle.offsetWidth,
			r: parseFloat(getComputedStyle(panel).getPropertyValue('--panel-radius')) || 8,
			/** Each slides up out of its own masked line. */
			links: panel.querySelectorAll('[data-nav-link]'),
			/** The divider and updates: a soft fade. */
			items: panel.querySelectorAll('[data-nav-item]')
		};
	}

	/**
	 * A button-sized circle in the panel's corner widens into a strip, then
	 * drops to full height. Tweens run from wherever the mask is, so reopening
	 * mid-close carries on from there.
	 */
	function openTimeline() {
		const g = geometry();
		// Hidden means fully closed, not mid-close.
		const fresh = panel.style.visibility !== 'visible';
		if (fresh) {
			Object.assign(mask, { left: g.w - g.b, bottom: g.h - g.b, radius: g.b / 2 });
			paint();
			gsap.set(panel, { autoAlpha: 1 });
			gsap.set(g.links, { yPercent: 110 });
			gsap.set(g.items, { autoAlpha: 0, y: g.b * 0.6 });
		}
		return (
			gsap
				.timeline({ defaults: { ease: 'menu' }, onUpdate: paint })
				.to(panel, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, 0)
				.to(overlay, { autoAlpha: DIM, duration: 0.4, ease: 'power2.out' }, 0)
				.to(mask, { left: 0, radius: g.r, duration: 0.38 }, 0)
				.to(mask, { bottom: 0, duration: 0.45 }, 0.22)
				.to(g.links, { yPercent: 0, duration: 0.55, stagger: 0.04, ease: 'power3.out' }, 0.3)
				.to(g.items, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0.45)
				// Hidden elements can't take focus, so move it in once the links show.
				.call(focusFirst, undefined, 0.4)
		);
	}

	/** The mask folds straight into the corner under the button, down to 0px. */
	function closeTimeline() {
		const g = geometry();
		return (
			gsap
				.timeline({
					defaults: { ease: 'menu' },
					onUpdate: paint,
					onComplete: () => gsap.set(panel, { visibility: 'hidden' })
				})
				// Links stay put and solid; the folding mask covers them.
				.to(g.items, { autoAlpha: 0, duration: 0.2, ease: 'power1.out' }, 0)
				.to(mask, { left: g.w, bottom: g.h, radius: 0, duration: 0.5 }, 0)
				.to(overlay, { autoAlpha: 0, duration: 0.45, ease: 'power2.inOut' }, 0)
		);
	}

	/** Opened from the keyboard: focus shows a ring. */
	let viaKeyboard = false;
	const focusFirst = () =>
		(panel.querySelector('a') as HTMLElement | null)?.focus({
			preventScroll: true,
			// A mouse opening shouldn't leave a focus ring on the first link.
			focusVisible: viaKeyboard
		} as FocusOptions);

	/** Undoes `holdPage`. */
	let release: (() => void) | null = null;
	const releaseAll = () => {
		release?.();
		release = null;
	};

	async function setOpen(next: boolean) {
		if (next === open) return;
		open = next;
		tl?.kill();
		tl = null;
		if (next) {
			release = holdPage(nav);
			await tick();
			if (prefersReducedMotion()) {
				gsap.set(panel, { autoAlpha: 1, clipPath: 'none' });
				gsap.set(overlay, { autoAlpha: DIM });
				focusFirst();
			} else {
				tl = openTimeline();
			}
		} else {
			releaseAll();
			if (prefersReducedMotion()) {
				gsap.set(panel, { autoAlpha: 0 });
				gsap.set(overlay, { autoAlpha: 0 });
			} else {
				tl = closeTimeline();
			}
			toggle.querySelector('button')?.focus({ preventScroll: true });
		}
	}

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && open) setOpen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			tl?.kill();
			releaseAll();
		};
	});
</script>

<nav bind:this={nav} class="menu" data-twostep-nav data-nav-status={open ? 'active' : 'not-active'} aria-label="Main">
	<!-- Pointer-only close target; Escape covers the keyboard. -->
	<div
		class="overlay"
		data-nav-toggle="close"
		bind:this={overlay}
		onclick={() => setOpen(false)}
		aria-hidden="true"
	></div>

	<div class="bar">
		<Row>
			<Cell start={8} span={5} tablet={{ start: 7, span: 6 }}>
				<div class="panel" id="site-menu" bind:this={panel} inert={!open}>
					<div class="nav">
						<ul class="links" onpointerover={dim} onpointerleave={dim}>
							{#each links as link (link.label)}
								<li class="line">
									<a
										data-nav-link
										class="link type-h3"
										class:current={link.href === current}
										aria-current={link.href === current ? 'page' : undefined}
										href={link.href}
										onclick={() => setOpen(false)}>{link.label}</a
									>
								</li>
							{/each}
						</ul>
						{#if secondary.length}
							<ul class="links secondary" onpointerover={dim} onpointerleave={dim}>
								{#each secondary as link (link.label)}
									<li class="line">
										<a
											data-nav-link
											class="link type-body-default"
											class:current={link.href === current}
											aria-current={link.href === current ? 'page' : undefined}
											href={link.href}
											onclick={() => setOpen(false)}>{link.label}</a
										>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					{#if updates.length}
						<div class="updates" data-nav-item>
							<!-- Stacked in one cell, so switching turns without a jump. -->
							<div class="slides" bind:this={slides}>
								{#each updates as update, i (i)}
									<a
										class="update"
										class:shown={i === shown}
										inert={i !== shown}
										href={update.href}
										onclick={() => setOpen(false)}
									>
										<span class="thumb">
											<Picture
												src={update.image.src}
												alt={update.image.alt}
												ratio="456 / 277"
												sizes="(max-width: 767px) 32vw, 14vw"
											/>
										</span>
										<span class="copy">
											<span class="type-caption-small date">{update.date}</span>
											<span class="type-body-default title">{update.title}</span>
										</span>
									</a>
								{/each}
							</div>
							{#if updates.length > 1}
								<div class="dashes">
									{#each updates, i (i)}
										<button
											type="button"
											class="dash"
											class:shown={i === shown}
											aria-label="Show update {i + 1} of {updates.length}"
											aria-current={i === shown ? 'true' : undefined}
											onclick={() => (shown = i)}
											onanimationend={next}><span class="hit"></span></button
										>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</Cell>
		</Row>
	</div>

	<div class="toggle" data-nav-toggle="toggle" bind:this={toggle}>
		<MenuButton
			{open}
			tone={header.dark ? 'dark' : 'light'}
			controls="site-menu"
			onclick={(e?: MouseEvent) => {
				// detail is 0 for Enter/Space presses, 1+ for real clicks.
				viaKeyboard = !e || e.detail === 0;
				setOpen(!open);
			}}
		/>
	</div>
</nav>

<style>
	/* Above the page and its fixed controls, below the dev grid overlay. */
	.menu {
		position: fixed;
		inset: 0;
		z-index: 50;
		pointer-events: none;
	}

	/* Dimmed to DIM by the script while open. */
	.overlay {
		position: absolute;
		inset: 0;
		background: var(--black);
		opacity: 0;
		visibility: hidden;
		pointer-events: auto;
	}

	/* Carries the page margin so the panel lands on the page's columns. */
	.bar {
		position: absolute;
		top: calc(var(--header-top) + var(--header-button) + var(--space-16));
		left: 0;
		right: 0;
		padding-inline: var(--grid-margin);
	}

	/* Never taller than the screen leaves room for. */
	.panel {
		--panel-radius: 8px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-40);
		min-height: min(
			calc(var(--size-font) * 35.75),
			100svh - var(--header-top) - var(--page-margin) - var(--header-button) - var(--space-16)
		);
		box-sizing: border-box;
		padding: var(--space-24);
		border-radius: var(--panel-radius);
		background: var(--white);
		visibility: hidden;
		pointer-events: auto;
	}

	.links {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.secondary {
		margin-top: var(--space-32);
	}
	/* Each link's mask, padded out and pulled back so the clip clears
	   descenders. --tighten sets the main links solid rather than on the
	   heading's looser line height. */
	.line {
		--line-size: var(--type-h3-size);
		--tighten: 0.15;
		overflow: hidden;
		padding-bottom: calc(var(--line-size) * 0.15);
		margin-bottom: calc(var(--line-size) * -0.15 - var(--line-size) * var(--tighten));
	}
	.secondary .line {
		--line-size: var(--type-body-default-size);
		--tighten: 0;
	}
	.link {
		display: inline-block;
		color: var(--black);
		text-decoration: none;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 1px solid var(--black);
		outline-offset: 2px;
	}

	.updates {
		position: relative;
		padding-top: var(--space-24);
	}
	/* Hairline across the panel's full width, through its padding. */
	.updates::before {
		content: '';
		position: absolute;
		top: 0;
		right: calc(var(--space-24) * -1);
		left: calc(var(--space-24) * -1);
		height: 1px;
		background: var(--grey-200);
	}
	/* One vanishing point so the updates turn on a shared wheel; clipped so
	   a turn never passes over the links above. */
	.slides {
		display: grid;
		perspective: 600px;
		overflow: clip;
	}
	.update {
		grid-area: 1 / 1;
		display: flex;
		gap: var(--space-24);
		color: var(--black);
		text-decoration: none;
		visibility: hidden;
	}
	/* inherit, not visible: a visible child would show through the closed
	   panel's visibility: hidden. */
	.update.shown {
		z-index: 1;
		visibility: inherit;
	}

	.thumb {
		flex: none;
		width: calc(var(--size-font) * 12);
		border-radius: var(--stage-radius);
		overflow: hidden;
	}
	.copy {
		display: grid;
		align-content: start;
		gap: var(--space-8);
		/* Clears the dashes and wraps the title onto two lines. */
		max-width: calc(var(--size-font) * 17);
		padding-top: var(--space-8);
	}
	.date {
		color: var(--black);
	}
	/* Above the shown update, whose link spans the full width under them. */
	.dashes {
		z-index: 2;
		position: absolute;
		right: 0;
		bottom: 0;
		display: flex;
		gap: var(--space-4);
	}
	.dash {
		position: relative;
		width: calc(var(--size-font) * 1.25);
		height: calc(var(--size-font) * 1.25);
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	/* At least 24px tall and across half the gap each side, so neighbours
	   meet without overlapping; the button (and its focus ring) keeps its size. */
	.hit {
		position: absolute;
		inset: min(0px, (var(--size-font) * 1.25 - 24px) / 2) calc(var(--space-4) / -2);
	}
	.dash:not(.shown):hover::before {
		background: var(--grey-400);
	}
	.dash::before,
	.dash::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1.5px;
		background: var(--button);
	}
	.dash::before {
		background: var(--grey-200);
	}
	/* Fills over an update's dwell time, then `animationend` advances it.
	   Paused while the menu is closed or the updates are hovered. */
	.dash::after {
		background: var(--black);
		transform: scaleX(0);
		transform-origin: left;
	}
	.dash.shown::after {
		animation: dash-fill 8s linear forwards;
	}
	.menu[data-nav-status='not-active'] .dash.shown::after,
	.updates:hover .dash.shown::after,
	.updates:focus-within .dash.shown::after {
		animation-play-state: paused;
	}
	@keyframes dash-fill {
		to {
			transform: scaleX(1);
		}
	}
	/* No auto-advance: the active dash is simply solid. */
	@media (prefers-reduced-motion: reduce) {
		.dash.shown::after {
			animation: none;
			transform: none;
		}
	}

	.toggle {
		position: absolute;
		top: var(--header-top);
		right: var(--grid-margin);
		pointer-events: auto;
	}

	@media screen and (max-width: 767px) {
		.panel {
			min-height: min(
				calc(var(--size-font) * 32),
				100svh - var(--header-top) - var(--page-margin) - var(--header-button) - var(--space-16)
			);
		}
		.thumb {
			width: calc(var(--size-font) * 7.5);
		}
	}
</style>
