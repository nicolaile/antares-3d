<!--
	@component
	The opening screen: the wordmark and a short intro above a full-bleed
	image, with the latest updates in its bottom-right corner.

	On scroll the image's mask rises with the page while the photo inside
	moves slower, a parallax. The wordmark rides up with it, shrinking to
	18px tall, until it reaches the top-left corner — level with the menu
	button — and stays there for the rest of the page.

	The updates turn like a wheel inside their dark card: every few seconds
	the current one rises, tilts back and shrinks away while the next rolls
	up from below. Drag it up or down to turn it by hand. Hovering or
	focusing the card holds it.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { initScroll, destroyScroll, gsap, ScrollTrigger, prefersReducedMotion } from '$lib/scroll';
	import type { Update } from '$lib/content/site';

	let {
		title,
		text,
		image,
		updates = []
	}: {
		title: string;
		text: string;
		image: { src: PictureSource; alt: string };
		/** Cycled in the image's corner, latest first. */
		updates?: Update[];
	} = $props();

	/** Seconds each update stays up. */
	const DWELL = 5;
	let shown = $state(0);
	let reel = $state<HTMLElement>();
	let swap: gsap.core.Timeline | null = null;
	let timer: gsap.core.Tween | null = null;
	let held = false;

	/**
	 * One turn of the wheel, `dir` 1 forward (up) or -1 back (down). Each
	 * update moves as one piece, image and text together: the old one leaves
	 * through the top of the card, tilting back and shrinking a little, while
	 * the new one rolls in from below, tilted the other way, and settles
	 * flat. Going back runs the same turn mirrored. `ease: 'none'` gives a
	 * timeline a drag can scrub linearly.
	 */
	function build(from: number, to: number, dir: 1 | -1, ease = 'menu') {
		const out = reel!.children[from] as HTMLElement;
		const inn = reel!.children[to] as HTMLElement;
		const travel = () => reel!.offsetHeight * dir;
		// The outgoing update stays drawn until it has turned away.
		gsap.set(out, { visibility: 'inherit' });
		const tl = gsap
			.timeline({ paused: true, defaults: { duration: 1.2, ease } })
			.to(out, { y: () => -travel(), scale: 0.85, rotationX: 50 * dir, autoAlpha: 0 }, 0)
			.fromTo(
				inn,
				{ y: travel, scale: 0.85, rotationX: -40 * dir, autoAlpha: 0 },
				{ y: 0, scale: 1, rotationX: 0, autoAlpha: 1 },
				0
			);
		const clear = () => gsap.set([out, inn], { clearProps: 'all' });
		return { tl, clear };
	}

	/** A timed turn. One that starts mid-turn finishes the running one first. */
	function turn(from: number, to: number, dir: 1 | -1 = 1) {
		swap?.progress(1).kill();
		swap = null;
		if (!reel || prefersReducedMotion()) return;
		const { tl, clear } = build(from, to, dir);
		swap = tl.eventCallback('onComplete', clear).play();
	}

	/** Queues the next turn; held while the pointer or focus is on the card. */
	function schedule() {
		timer?.kill();
		if (updates.length < 2) return;
		timer = gsap.delayedCall(DWELL, () => {
			if (held) schedule();
			else shown = (shown + 1) % updates.length;
		});
	}
	const hold = (on: boolean) => () => (held = on);

	/**
	 * Dragging turns the wheel by hand: up for the next update, down for the
	 * previous. The turn trails the pointer a little (quickTo), so it glides
	 * rather than snapping to every pixel, and eases out over one and a half
	 * card heights, giving easily at first and resisting towards the end.
	 * Let go past 40% of the way, or with a flick, and it carries on round;
	 * otherwise it settles back. A drag never counts as a click.
	 */
	/** How far a full turn takes, in card heights. */
	const REACH = 1.5;
	const resist = gsap.parseEase('power2.out');
	let drag: {
		y0: number;
		dir: 0 | 1 | -1;
		to: number;
		turn: ReturnType<typeof build> | null;
		/** Eases the turn's progress towards the pointer. */
		follow: ((progress: number) => void) | null;
		moved: boolean;
		y: number;
		t: number;
		v: number;
	} | null = null;
	/** Set when a drag already turned the wheel, so the effect doesn't again. */
	let turned = false;
	let swallowClick = false;

	function grab(e: PointerEvent) {
		if (updates.length < 2 || e.button !== 0) return;
		swap?.progress(1).kill();
		swap = null;
		timer?.kill();
		drag = {
			y0: e.clientY,
			dir: 0,
			to: shown,
			turn: null,
			follow: null,
			moved: false,
			y: e.clientY,
			t: e.timeStamp,
			v: 0
		};
		// Keeps the drag going when the pointer leaves the card.
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// Not an active pointer (a synthetic event); the drag still works.
		}
	}

	function pull(e: PointerEvent) {
		if (!drag || !reel) return;
		const dy = e.clientY - drag.y0;
		if (!drag.moved && Math.abs(dy) < 4) return;
		drag.moved = true;
		const dt = Math.max(1, e.timeStamp - drag.t);
		drag.v = (e.clientY - drag.y) / dt;
		drag.y = e.clientY;
		drag.t = e.timeStamp;
		const dir = dy < 0 ? 1 : -1;
		if (dir !== drag.dir) {
			if (drag.turn) {
				gsap.killTweensOf(drag.turn.tl);
				drag.turn.tl.progress(0).kill();
				drag.turn.clear();
			}
			drag.dir = dir;
			drag.to = (shown + dir + updates.length) % updates.length;
			drag.turn = prefersReducedMotion() ? null : build(shown, drag.to, dir, 'none');
			drag.follow = drag.turn
				? gsap.quickTo(drag.turn.tl, 'progress', { duration: 0.5, ease: 'power3.out' })
				: null;
		}
		drag.follow?.(resist(Math.min(1, Math.abs(dy) / (reel.offsetHeight * REACH))));
	}

	function release(e: PointerEvent) {
		if (!drag || !reel) return;
		const d = drag;
		drag = null;
		swallowClick = d.moved;
		if (!d.dir) return schedule();
		// Judged on where the pointer got to, not where the trailing turn is.
		const done = resist(Math.min(1, Math.abs(e.clientY - d.y0) / (reel.offsetHeight * REACH)));
		// A flick is a quick move (px per ms) the way the drag was heading.
		const flick = Math.abs(d.v) > 0.4 && Math.sign(-d.v) === d.dir;
		const commit = done > 0.4 || flick;
		if (!d.turn) {
			if (commit) shown = d.to;
			return schedule();
		}
		const { tl, clear } = d.turn;
		// Hand over from the pointer-follow to one long glide to rest.
		gsap.killTweensOf(tl);
		const at = tl.progress();
		swap = gsap
			.timeline()
			.to(tl, {
				progress: commit ? 1 : 0,
				duration: 0.5 + 0.7 * (commit ? 1 - at : at),
				ease: 'expo.out'
			})
			.call(() => {
				if (commit) {
					turned = true;
					shown = d.to;
				} else schedule();
				clear();
			});
	}

	/** Swallows the click that ends a drag, so it doesn't follow the link. */
	function onclickcapture(e: MouseEvent) {
		if (!swallowClick) return;
		swallowClick = false;
		e.preventDefault();
		e.stopPropagation();
	}

	let last = 0;
	$effect(() => {
		const i = shown;
		if (i !== last && !turned) turn(last, i);
		turned = false;
		last = i;
		schedule();
		return () => timer?.kill();
	});

	let brand: HTMLElement;
	let mark: HTMLElement;
	let mask: HTMLElement;
	let photo: HTMLElement;

	onMount(() => {
		initScroll();
		const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
		/** The wordmark's height once it's in the corner: 18px at 1440. */
		const REST = 1.125;
		// Where the wordmark comes to rest: centred on the 34px menu button,
		// which sits one page margin (--page-margin, 1 unit) in from the top.
		const restTop = () => unit() * (1 + (2.125 - REST) / 2);

		const ctx = gsap.context(() => {
			// Rides the page up with the image, then holds in the corner. It
			// pins when its bottom edge — the one anchored to the image — is
			// REST below restTop, which is where the shrunk mark's top lands.
			const pin = ScrollTrigger.create({
				trigger: brand,
				start: () => `bottom ${restTop() + unit() * REST}px`,
				end: 'max',
				pin: true,
				pinSpacing: false
			});
			// Shrinks the whole way up, from its hero size down to REST tall,
			// landing at the moment it pins. Scaled from its bottom-left
			// corner, so its gap to the image stays the same as it goes.
			gsap.to(mark, {
				scale: () => (unit() * REST) / mark.offsetHeight,
				ease: 'none',
				scrollTrigger: {
					start: 0,
					end: () => Math.max(1, pin.start),
					scrub: true,
					invalidateOnRefresh: true
				}
			});

			// The photo drifts down inside its mask, 40% of the mask's height
			// over the time the mask takes to leave the screen.
			if (!prefersReducedMotion()) {
				gsap.fromTo(
					photo,
					{ y: 0 },
					{
						y: () => mask.offsetHeight * 0.4,
						ease: 'none',
						scrollTrigger: {
							trigger: mask,
							start: 0,
							end: 'bottom top',
							scrub: true,
							invalidateOnRefresh: true
						}
					}
				);
			}
		});
		document.fonts.ready.then(() => ScrollTrigger.refresh());

		return () => {
			ctx.revert();
			destroyScroll();
		};
	});
</script>

<section class="hero">
	<div class="intro">
		<Row align="end" gap={40}>
			<Cell span={6} mobile={{ span: 12 }}>
				<div class="brand" bind:this={brand}>
					<a class="home" href="/" aria-label="Antares home" bind:this={mark}>
						<Wordmark />
					</a>
				</div>
			</Cell>
			<Cell start={10} span={3} tablet={{ start: 8, span: 5 }} mobile={{ span: 12 }}>
				<p class="blurb type-small">
					<span class="title">{title}</span>
					<span class="text">{text}</span>
				</p>
			</Cell>
		</Row>
	</div>

	<div class="mask" bind:this={mask}>
		<div class="photo" bind:this={photo}>
			<Picture {...image} ratio="auto" sizes="100vw" loading="eager" />
		</div>

		<!-- Sticks to the bottom of the screen until the image ends. -->
		{#if updates.length}
			<div class="corner">
				<Row>
					<Cell start={10} span={3} tablet={{ start: 7, span: 6 }} mobile={{ span: 12 }}>
						<div
							class="update"
							role="group"
							aria-label="Latest updates"
							onpointerenter={hold(true)}
							onpointerleave={hold(false)}
							onfocusin={hold(true)}
							onfocusout={hold(false)}
							onpointerdown={grab}
							onpointermove={pull}
							onpointerup={release}
							onpointercancel={release}
							{onclickcapture}
							ondragstart={(e) => e.preventDefault()}
						>
							<!-- Stacked in one cell: the card is as tall as the longest. -->
							<div class="reel" bind:this={reel}>
								{#each updates as update, i (i)}
									<a class="slide" class:shown={i === shown} inert={i !== shown} href={update.href}>
										<span class="thumb">
											<Picture
												src={update.image.src}
												alt={update.image.alt}
												ratio="1 / 1"
												sizes="(max-width: 767px) 25vw, 7vw"
											/>
										</span>
										<span class="copy">
											<span class="type-caption-small date">{update.date}</span>
											<span class="type-caption headline">{update.title}</span>
										</span>
									</a>
								{/each}
							</div>
						</div>
					</Cell>
				</Row>
			</div>
		{/if}
	</div>
</section>

<style>
	/* The intro, then an image a full screen tall, so it runs on past the
	   first screen by the intro's height. */
	.hero {
		position: relative;
	}

	/* 356px tall at 1440, its content sitting on the bottom edge. */
	.intro {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		box-sizing: border-box;
		height: calc(var(--size-font) * 22.25);
		padding: 0 var(--grid-margin) var(--space-30);
	}

	/* Above the page and footer once pinned, below the menu (z-index 50).
	   White with a difference blend, so it reads black on the page and
	   white over the image and the footer. */
	.brand {
		position: relative;
		z-index: 40;
		mix-blend-mode: difference;
		color: var(--grey-0);
	}
	/* ScrollTrigger wraps the pinned wordmark in a spacer that copies its
	   z-index, which isolates the blend inside it; the spacer blends too. */
	:global(.pin-spacer:has(> .brand)) {
		mix-blend-mode: difference;
	}
	/* 54px tall at 1440 (18px once it has shrunk into the corner). */
	.home {
		display: block;
		width: fit-content;
		height: calc(var(--size-font) * 3.375);
		color: inherit;
		transform-origin: 0 100%;
	}
	.home:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 4px;
	}

	.blurb {
		display: grid;
		margin: 0;
	}
	.title {
		color: var(--grey-950);
	}
	.text {
		color: var(--grey-700);
	}

	/* Full bleed. The photo is 40% taller than its mask and starts raised
	   by that much, so it can drift down without opening a gap. Keep the
	   inset in step with the drift in the script. */
	/* clip, not hidden: hidden would make the mask a scroll container and
	   the card would stick to it instead of the screen. The card sits at
	   the bottom, in flow. */
	.mask {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		height: 100svh;
		min-height: calc(var(--size-font) * 40);
		overflow: clip;
		background: var(--grey-100);
	}
	.photo {
		position: absolute;
		inset: -40% 0 0;
		will-change: transform;
	}
	.photo :global(.picture) {
		height: 100%;
	}

	/* Held one page margin off the bottom of the screen until the mask's own bottom
	   edge catches up and carries it away. */
	.corner {
		position: sticky;
		bottom: 0;
		padding: 0 var(--grid-margin) var(--page-margin);
	}
	/* A dark, frosted card: the tint is its own layer so the text stays
	   solid. */
	/* Dragged vertically, so it takes touches itself rather than scrolling
	   the page. */
	.update {
		position: relative;
		isolation: isolate;
		touch-action: none;
		user-select: none;
		cursor: grab;
		padding: var(--space-8);
		border-radius: 4px;
		overflow: hidden;
		color: var(--grey-0);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.update::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--grey-950);
		opacity: 0.85;
	}
	/* One vanishing point for the whole reel, so the updates turn on a
	   shared wheel rather than each tilting on its own. */
	.reel {
		display: grid;
		perspective: 600px;
	}
	/* inherit, not visible, so a hidden panel above still hides it. */
	.slide {
		grid-area: 1 / 1;
		display: flex;
		gap: var(--space-15);
		color: inherit;
		text-decoration: none;
		visibility: hidden;
		cursor: inherit;
	}
	.slide.shown {
		z-index: 1;
		visibility: inherit;
	}
	.update:active,
	.update:active .slide {
		cursor: grabbing;
	}
	.slide:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 2px;
	}
	.thumb {
		flex: none;
		width: calc(var(--size-font) * 5.875);
		border-radius: var(--stage-radius);
		overflow: hidden;
	}
	/* Rounded on the image itself too: the reel's 3D perspective can put
	   the image on its own layer, where the container's clip doesn't
	   reach. */
	.thumb :global(.picture),
	.thumb :global(img) {
		border-radius: var(--stage-radius);
	}
	.copy {
		display: grid;
		align-content: start;
		gap: var(--space-12);
		padding-top: var(--space-4);
		padding-right: var(--space-8);
	}
	.date {
		color: var(--grey-400);
	}

	@media screen and (max-width: 767px) {
		/* The intro stacks, wordmark over the blurb, so it sizes to fit. */
		.intro {
			height: auto;
			padding-top: calc(var(--size-font) * 7.5);
		}
		.home {
			height: calc(var(--size-font) * 2.5);
		}
	}
</style>
