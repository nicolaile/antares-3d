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

	/**
	 * The panel's mask, as separate edges rather than one clip-path string:
	 * insets from the right, bottom and left, and the corner radius, in px.
	 * Widening (left) and dropping (bottom) are separate properties, so the
	 * two steps can overlap without one tween taking over the other's edge
	 * mid-way — which is what made the widening stall and restart.
	 */
	const mask = { left: 0, bottom: 0, radius: 0 };
	const paint = () => {
		panel.style.clipPath = `inset(0px 0px ${mask.bottom}px ${mask.left}px round ${mask.radius}px)`;
	};

	/** Panel geometry, measured fresh each time so a resize is picked up. */
	function geometry() {
		return {
			w: panel.offsetWidth,
			h: panel.offsetHeight,
			b: toggle.offsetWidth,
			r: parseFloat(getComputedStyle(panel).getPropertyValue('--panel-radius')) || 4,
			/** Menu links: each slides up out of its own masked line. */
			links: panel.querySelectorAll('[data-nav-link]'),
			/** Everything else (the latest update): a soft fade. */
			items: panel.querySelectorAll('[data-nav-item]')
		};
	}

	/**
	 * Open, in two steps: a button-sized circle in the panel's top-right
	 * corner widens into a full-width strip, then drops to full height; the
	 * links rise in once the panel is mostly there. Tweens run from wherever
	 * the mask is, so reopening mid-close carries on from there.
	 */
	function openTimeline() {
		const g = geometry();
		// Hidden = fully closed (no close still folding it away).
		const fresh = panel.style.visibility !== 'visible';
		if (fresh) {
			Object.assign(mask, { left: g.w - g.b, bottom: g.h - g.b, radius: g.b / 2 });
			paint();
			gsap.set(panel, { autoAlpha: 1 });
			gsap.set(g.links, { yPercent: 110 });
			gsap.set(g.items, { autoAlpha: 0, y: g.b * 0.6 });
		}
		return gsap
			.timeline({ defaults: { ease: 'menu' }, onUpdate: paint })
			.to(panel, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, 0)
			.to(overlay, { autoAlpha: DIM, duration: 0.5, ease: 'power2.out' }, 0)
			.to(mask, { left: 0, radius: g.r, duration: 0.5 }, 0)
			.to(mask, { bottom: 0, duration: 0.6 }, 0.3)
			// No fade: each link rises into view from behind its line.
			.to(g.links, { yPercent: 0, duration: 0.7, stagger: 0.05, ease: 'power3.out' }, 0.4)
			.to(g.items, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.6)
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
				onUpdate: paint,
				onComplete: () => gsap.set(panel, { visibility: 'hidden' })
			})
			// Links stay put and solid; the folding mask covers them.
			.to(g.items, { autoAlpha: 0, duration: 0.2, ease: 'power1.out' }, 0)
			.to(mask, { left: g.w, bottom: g.h, radius: 0, duration: 0.5 }, 0)
			.to(overlay, { autoAlpha: 0, duration: 0.45, ease: 'power2.inOut' }, 0);
	}

	/** Set when the menu was opened from the keyboard, so focus shows a ring. */
	let viaKeyboard = false;
	const focusFirst = () =>
		(panel.querySelector('a') as HTMLElement | null)?.focus({
			preventScroll: true,
			// A mouse opening shouldn't leave a focus ring on the first link.
			focusVisible: viaKeyboard
		} as FocusOptions);

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
							<li class="line">
								<a
									data-nav-link
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
		<MenuButton
			{open}
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
	/* Each link's mask. The bottom is padded out and pulled back so the clip
	   clears the descenders (the y in Company, the g in Progress) without
	   changing the line spacing. */
	.line {
		overflow: hidden;
		padding-bottom: calc(var(--type-heading-2-size) * 0.15);
		margin-bottom: calc(var(--type-heading-2-size) * -0.15);
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
