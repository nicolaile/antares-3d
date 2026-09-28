<!--
	@component
	The site menu: a round toggle fixed top-right, 20px in from both edges.
	Opening dims the page and grows a panel out of the button's corner in two
	steps — across, then down — before the links rise in. Closing plays it
	back. Escape, the dimmed page and any link close it.

	Structure follows Osmo's two-step scaling navigation: state lives on
	`data-nav-status`, and `data-nav-toggle` marks what opens and closes it.
	The panel sits on the page grid, columns 9–12.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import { gsap, getLenis, prefersReducedMotion } from '$lib/scroll';
	import type { Link } from '$lib/content/site';

	let {
		links,
		latest,
		current = '/'
	}: {
		links: Link[];
		latest?: { date: string; title: string; href: string };
		/** Path of the page we're on; its link is marked. */
		current?: string;
	} = $props();

	let open = $state(false);
	let panel: HTMLElement;
	let overlay: HTMLElement;
	let toggle: HTMLElement;
	let tl: gsap.core.Timeline | null = null;

	/** How far the page dims: the darkest grey at 70%. Matches the CSS. */
	const DIM = 0.7;

	/** Panel geometry, measured fresh each time so a resize is picked up. */
	function geometry() {
		const w = panel.offsetWidth;
		const h = panel.offsetHeight;
		const b = toggle.offsetWidth;
		const r = parseFloat(getComputedStyle(panel).getPropertyValue('--panel-radius')) || 4;
		const clip = (right: number, bottom: number, left: number, radius: number) =>
			`inset(0px ${right}px ${bottom}px ${left}px round ${radius}px)`;
		return {
			b,
			items: panel.querySelectorAll('[data-nav-item]'),
			/** A button-sized circle tucked into the panel's top-right corner. */
			closed: clip(0, h - b, w - b, b / 2),
			strip: clip(0, h - b, 0, r),
			full: clip(0, 0, 0, r),
			/** Nothing: a 0×0px point at the panel's top-right corner, under the button. */
			gone: clip(0, h, w, 0)
		};
	}

	/**
	 * Open, in two steps: the circle widens into a full-width strip, then
	 * drops to full height; the links rise in once the panel is mostly
	 * there. Tweens run from wherever things are, so reopening mid-close
	 * carries on from there instead of snapping back to the circle.
	 */
	function openTimeline() {
		const g = geometry();
		// Hidden = fully closed (no close still fading it away).
		const fresh = panel.style.visibility !== 'visible';
		if (fresh) {
			gsap.set(panel, { clipPath: g.closed, autoAlpha: 1 });
			gsap.set(g.items, { autoAlpha: 0, y: g.b * 0.6 });
		}
		return gsap
			.timeline({ defaults: { ease: 'menu' } })
			.to(panel, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, 0)
			.to(overlay, { autoAlpha: DIM, duration: 0.5, ease: 'power2.out' }, 0)
			.to(panel, { clipPath: g.strip, duration: 0.5 }, 0)
			.to(panel, { clipPath: g.full, duration: 0.6 }, 0.3)
			.to(g.items, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.045, ease: 'power3.out' }, 0.45)
			// Hidden elements can't take focus, so move it in once the links show.
			.call(focusFirst, undefined, 0.5);
	}

	/**
	 * Close, in one move: the mask folds straight into the panel's top-right
	 * corner, under the button, all the way down to 0px — so by the end
	 * there's nothing left to hide. No fade on the panel; the links and the
	 * dimmed page fade with it.
	 */
	function closeTimeline() {
		const g = geometry();
		return gsap
			.timeline({
				defaults: { ease: 'menu' },
				onComplete: () => gsap.set(panel, { visibility: 'hidden' })
			})
			.to(g.items, { autoAlpha: 0, duration: 0.2, ease: 'power1.out' }, 0)
			.to(panel, { clipPath: g.gone, duration: 0.5 }, 0)
			.to(overlay, { autoAlpha: 0, duration: 0.45, ease: 'power2.inOut' }, 0);
	}

	const focusFirst = () => (panel.querySelector('a') as HTMLElement | null)?.focus({ preventScroll: true });

	async function setOpen(next: boolean) {
		if (next === open) return;
		open = next;
		tl?.kill();
		tl = null;
		if (next) {
			getLenis()?.stop();
			await tick();
			if (prefersReducedMotion()) {
				gsap.set(panel, { autoAlpha: 1, clipPath: 'none' });
				gsap.set(overlay, { autoAlpha: DIM });
				focusFirst();
			} else {
				tl = openTimeline();
			}
		} else {
			getLenis()?.start();
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
			if (open) getLenis()?.start();
		};
	});
</script>

<nav
	class="menu"
	data-twostep-nav
	data-nav-status={open ? 'active' : 'not-active'}
	aria-label="Main"
>
	<!-- Pointer-only close target; Escape covers the keyboard. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="overlay" data-nav-toggle="close" bind:this={overlay} onclick={() => setOpen(false)} aria-hidden="true"></div>

	<div class="bar">
		<Row>
			<Cell start={9} span={4} tablet={{ start: 7, span: 6 }}>
				<div class="panel" id="site-menu" bind:this={panel} inert={!open}>
					<ul class="links">
						{#each links as link (link.label)}
							<li data-nav-item>
								<a
									class="link type-heading-2"
									class:current={link.href === current}
									aria-current={link.href === current ? 'page' : undefined}
									href={link.href}
									onclick={() => setOpen(false)}>{link.label}</a
								>
							</li>
						{/each}
					</ul>
					{#if latest}
						<a class="latest" href={latest.href} data-nav-item onclick={() => setOpen(false)}>
							<span class="type-label date">{latest.date}</span>
							<span class="type-body title">{latest.title}</span>
						</a>
					{/if}
				</div>
			</Cell>
		</Row>
	</div>

	<div class="toggle" data-nav-toggle="toggle" bind:this={toggle}>
		<MenuButton {open} controls="site-menu" onclick={() => setOpen(!open)} />
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

	/* The page, dimmed to DIM (70%) by the script while open. */
	.overlay {
		position: absolute;
		inset: 0;
		background: var(--grey-950);
		opacity: 0;
		visibility: hidden;
		pointer-events: auto;
	}

	/* A full-width fixed strip carrying the page margin, so the panel lands
	   on the same columns as the page. It starts under the button. */
	.bar {
		position: absolute;
		top: calc(var(--grid-margin) + var(--size-font) * 2.3125 + var(--space-12));
		left: 0;
		right: 0;
		padding-inline: var(--grid-margin);
	}

	/* 527px tall at 1440: links pinned top, the latest update pinned bottom. */
	.panel {
		--panel-radius: 4px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: calc(var(--size-font) * 33);
		box-sizing: border-box;
		padding: var(--space-15) var(--space-15) var(--space-20);
		border-radius: var(--panel-radius);
		background: var(--grey-0);
		visibility: hidden;
		pointer-events: auto;
	}

	.links {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.link {
		display: inline-block;
		color: var(--grey-700);
		text-decoration: none;
		transition: color 0.2s ease;
	}
	.link:hover,
	.link:focus-visible,
	.link.current {
		color: var(--grey-950);
	}
	a:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}

	.latest {
		display: grid;
		gap: var(--space-12);
		max-width: 20em;
		color: var(--grey-950);
		text-decoration: none;
	}
	.date {
		color: var(--grey-700);
	}
	.latest:hover .title {
		color: var(--grey-700);
	}

	/* 20px from the top and right edges of the screen. */
	.toggle {
		position: absolute;
		top: var(--grid-margin);
		right: var(--grid-margin);
		pointer-events: auto;
	}

	@media screen and (max-width: 767px) {
		.panel {
			min-height: calc(var(--size-font) * 28);
		}
	}
</style>
