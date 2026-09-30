<!--
	@component
	The site menu: a round toggle fixed top-right, one page margin (16px) in from both edges.
	Opening dims the page and grows a panel out of the button's corner in two
	steps — across, then down — before the links rise in. Closing plays it
	back. Escape, the dimmed page and any link close it.

	Structure follows Osmo's two-step scaling navigation: state lives on
	`data-nav-status`, and `data-nav-toggle` marks what opens and closes it.
	The panel sits on the page grid, columns 8–12: the main links and the
	secondary ones pinned top, the latest updates pinned bottom, cycling on
	their own while the menu is open (dashes pick one directly).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, getLenis, prefersReducedMotion } from '$lib/scroll';
	import type { Link, Update } from '$lib/content/site';

	let {
		links,
		secondary = [],
		updates = [],
		current = '/'
	}: {
		links: Link[];
		secondary?: Link[];
		updates?: Update[];
		/** Path of the page we're on; its link is marked. */
		current?: string;
	} = $props();

	let open = $state(false);
	/** Which update shows. The active dash's fill advances it when it ends. */
	let shown = $state(0);
	const next = () => (shown = (shown + 1) % updates.length);
	let slides = $state<HTMLElement>();
	let swap: gsap.core.Timeline | null = null;

	/**
	 * Switching updates: the images crossfade. The old text fades up and out; the new date and title rise
	 * in once the wipe is underway. A switch mid-transition finishes the
	 * running one first, so nothing is left half-drawn.
	 */
	function transition(from: number, to: number) {
		swap?.progress(1).kill();
		swap = null;
		if (!slides || prefersReducedMotion()) return;
		const out = slides.children[from] as HTMLElement;
		const inn = slides.children[to] as HTMLElement;
		const q = (el: HTMLElement, sel: string) => el.querySelectorAll(sel);
		const touched = [out, inn, ...q(out, '.thumb, .date, .title'), ...q(inn, '.thumb, .date, .title')];
		// The outgoing update stays drawn under the incoming one until the end.
		gsap.set(out, { visibility: 'inherit' });
		swap = gsap
			.timeline({ onComplete: () => gsap.set(touched, { clearProps: 'all' }) })
			.to(q(out, '.date, .title'), { autoAlpha: 0, y: -6, duration: 0.6, stagger: 0.06, ease: 'power2.inOut' }, 0)
			.to(q(out, '.thumb'), { autoAlpha: 0, duration: 1.2, ease: 'power2.inOut' }, 0)
			.fromTo(q(inn, '.thumb'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: 'power2.inOut' }, 0)
			.fromTo(
				q(inn, '.date, .title'),
				{ autoAlpha: 0, y: 14 },
				{ autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out' },
				0.7
			);
	}

	let last = 0;
	$effect(() => {
		const i = shown;
		if (i !== last) transition(last, i);
		last = i;
	});
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
			/** Everything else (the divider and updates): a soft fade. */
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
			.to(overlay, { autoAlpha: DIM, duration: 0.4, ease: 'power2.out' }, 0)
			.to(mask, { left: 0, radius: g.r, duration: 0.38 }, 0)
			.to(mask, { bottom: 0, duration: 0.45 }, 0.22)
			// No fade: each link rises into view from behind its line.
			.to(g.links, { yPercent: 0, duration: 0.55, stagger: 0.04, ease: 'power3.out' }, 0.3)
			.to(g.items, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0.45)
			// Hidden elements can't take focus, so move it in once the links show.
			.call(focusFirst, undefined, 0.4);
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
			<Cell start={8} span={5} tablet={{ start: 7, span: 6 }}>
				<div class="panel" id="site-menu" bind:this={panel} inert={!open}>
					<div class="nav">
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
						{#if secondary.length}
							<ul class="links secondary">
								{#each secondary as link (link.label)}
									<li class="line">
										<a
											data-nav-link
											class="link type-small"
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
							<!-- Stacked in one cell, so switching crossfades without a jump. -->
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
												ratio="1 / 1"
												sizes="(max-width: 767px) 25vw, 11vw"
											/>
										</span>
										<span class="copy">
											<span class="type-caption-small date">{update.date}</span>
											<span class="type-small title">{update.title}</span>
										</span>
									</a>
								{/each}
							</div>
							{#if updates.length > 1}
								<div class="dashes">
									{#each updates as update, i (i)}
										<button
											type="button"
											class="dash"
											class:shown={i === shown}
											aria-label="Show update {i + 1} of {updates.length}"
											aria-current={i === shown ? 'true' : undefined}
											onclick={() => (shown = i)}
											onanimationend={next}
										></button>
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
		top: calc(var(--page-margin) + var(--size-font) * 2.125 + var(--space-12));
		left: 0;
		right: 0;
		padding-inline: var(--grid-margin);
	}

	/* 572px tall at 1440 (never taller than the screen leaves room for):
	   links pinned top, the latest updates pinned bottom. */
	.panel {
		--panel-radius: 4px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-40);
		min-height: min(
			calc(var(--size-font) * 35.75),
			100svh - var(--page-margin) * 2 - var(--size-font) * 2.125 - var(--space-12)
		);
		box-sizing: border-box;
		padding: var(--space-20);
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
	.secondary {
		margin-top: var(--space-60);
	}
	/* Each link's mask. The bottom is padded out and pulled back so the clip
	   clears the descenders (the y in Company, the g in Progress). The main
	   links pull back a little further (--tighten), setting them solid
	   rather than on Heading 2's looser line height. */
	.line {
		--line-size: var(--type-heading-2-size);
		--tighten: 0.15;
		overflow: hidden;
		padding-bottom: calc(var(--line-size) * 0.15);
		margin-bottom: calc(var(--line-size) * -0.15 - var(--line-size) * var(--tighten));
	}
	.secondary .line {
		--line-size: var(--type-small-size);
		--tighten: 0;
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
	a:focus-visible,
	button:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}

	/* A hairline, then the update: thumbnail left, date and title beside it,
	   the dashes in the bottom-right corner. */
	.updates {
		position: relative;
		padding-top: var(--space-20);
		border-top: 1px solid var(--grey-200);
	}
	.slides {
		display: grid;
	}
	.update {
		grid-area: 1 / 1;
		display: flex;
		gap: var(--space-20);
		color: var(--grey-950);
		text-decoration: none;
		visibility: hidden;
	}
	/* inherit, not visible: a child set visible would show through the
	   panel's own visibility: hidden once the menu closes. */
	.update.shown {
		z-index: 1;
		visibility: inherit;
	}

	.thumb {
		flex: none;
		width: calc(var(--size-font) * 9.5);
		border-radius: var(--stage-radius);
		overflow: hidden;
	}
	.copy {
		display: grid;
		align-content: start;
		gap: var(--space-8);
		/* Clear of the dashes, and wrapping the title onto two lines. */
		max-width: calc(var(--size-font) * 17);
		padding-top: var(--space-8);
	}
	.date {
		color: var(--grey-950);
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
	/* The hit area is taller than the 1.5px line it draws. */
	.dash {
		position: relative;
		width: calc(var(--size-font) * 1.25);
		height: var(--space-20);
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
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
		background: var(--grey-300);
	}
	/* The active dash fills over the time an update stays up, then hands on
	   to the next. It holds while the menu is closed or the pointer is over
	   the updates. */
	.dash::after {
		background: var(--grey-950);
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

	/* One page margin from the top and right edges of the screen. */
	.toggle {
		position: absolute;
		top: var(--page-margin);
		right: var(--grid-margin);
		pointer-events: auto;
	}

	@media screen and (max-width: 767px) {
		.panel {
			min-height: min(
				calc(var(--size-font) * 32),
				100svh - var(--page-margin) * 2 - var(--size-font) * 2.125 - var(--space-12)
			);
		}
		.thumb {
			width: calc(var(--size-font) * 6);
		}
	}
</style>
