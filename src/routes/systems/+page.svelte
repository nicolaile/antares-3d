<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { onTick, gsap, prefersReducedMotion } from '$lib/scroll';
	import { intro, points } from '$lib/content/systems';
	import { ANCHORS, buildChoreography } from '$lib/three/systemChoreography';
	// Types only: three.js loads on demand, as its own chunk.
	import type { SystemScene } from '$lib/three/SystemScene';

	/**
	 * The R1's seven systems as a click-through: the camera travels from the
	 * shield into the core and out along the heat's path to the grid, one
	 * point at a time, the model in the middle of the screen. Next and
	 * previous (the buttons, the arrow keys, a swipe), or the rail to jump;
	 * each point plays its move and its animation, then holds. The point is
	 * in the URL's hash (#1–#7), so a link opens on it.
	 *
	 * While a point holds, the visitor can drag to turn the model (Mark-0 on
	 * its own springs back; the whole system stays where it's left until the
	 * next point); labels pinned to the parts name what each point shows, and
	 * hide when their part turns away.
	 */

	let host: HTMLDivElement;
	let loader: HTMLDivElement;
	let card: HTMLDivElement;
	let progress = $state(0);
	let failed = $state(false);
	/** The point chosen, −1 the opening; `shown` is the one the card shows, swapped once it's faded out. */
	let active = $state(-1);
	let shown = $state(-1);
	let noteLayers: HTMLElement[] = $state([]);
	let noteEls: HTMLElement[][] = $state(points.map(() => []));
	/**
	 * The close-ups' look (points 2–6), from `?look=lowkey`. With `look` in the URL at all, a
	 * switch shows, to compare the two live; without it, the studio and no switch.
	 */
	let look: 'studio' | 'lowkey' = $state('studio');
	let comparing = $state(false);
	let scene: SystemScene | null = null;
	let choreography: ReturnType<typeof buildChoreography> | null = null;

	// Each point's labels fade in while it's the active one.
	$effect(() => {
		const current = active;
		noteLayers.forEach((layer, i) =>
			gsap.to(layer, { autoAlpha: i === current ? 1 : 0, duration: 0.5, ease: 'power2.out', overwrite: true })
		);
	});

	const pad = (n: number) => String(n).padStart(2, '0');
	const copy = $derived(shown < 0 ? null : points[shown]);

	/** Writes the look and the point into the URL, without a navigation. */
	function writeUrl() {
		const url = new URL(location.href);
		if (comparing) url.searchParams.set('look', look);
		url.hash = active >= 0 ? String(active + 1) : '';
		replaceState(url, {});
	}

	function setLook(next: 'studio' | 'lowkey') {
		look = next;
		scene?.setLook(next);
		writeUrl();
	}

	/** Goes to point `i` (−1 the opening): the scene plays there; the card fades out and back in with its copy. */
	function go(i: number) {
		i = Math.max(-1, Math.min(points.length - 1, i));
		if (i === active) return;
		active = i;
		writeUrl();
		scene?.settle();
		choreography?.go(i, { instant: prefersReducedMotion() });
		gsap.to(card, {
			autoAlpha: 0,
			y: -12,
			duration: 0.25,
			ease: 'power2.in',
			overwrite: true,
			onComplete: async () => {
				shown = i;
				await tick();
				gsap.fromTo(card, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.15 });
			}
		});
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const el = e.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
		const forward = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && el?.tagName !== 'BUTTON');
		const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
		if (!forward && !back) return;
		e.preventDefault();
		go(active + (forward ? 1 : -1));
	}

	// A horizontal swipe steps on touch screens (touch drags don't turn the model).
	let swipe: { x: number; y: number } | null = null;
	function ontouchstart(e: TouchEvent) {
		swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
	}
	function ontouchend(e: TouchEvent) {
		if (!swipe) return;
		const dx = e.changedTouches[0].clientX - swipe.x;
		const dy = e.changedTouches[0].clientY - swipe.y;
		swipe = null;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(active + (dx < 0 ? 1 : -1));
	}

	onMount(() => {
		const param = new URLSearchParams(location.search).get('look');
		comparing = param !== null;
		look = param === 'lowkey' ? 'lowkey' : 'studio';
		// A link straight to a point (#1–#7) opens on it.
		const linked = Number(location.hash.slice(1));
		const start = Number.isInteger(linked) && linked >= 1 && linked <= points.length ? linked - 1 : -1;
		active = shown = start;
		let destroyed = false;
		const wide = matchMedia('(min-width: 768px)');
		// The model sits in the middle of the frame. Narrow screens stack the
		// copy along the bottom, so there it rises a little to clear it.
		const frame = () => {
			if (!scene) return;
			scene.state.shift = 0;
			scene.state.shiftY = wide.matches ? 0 : 0.12;
		};
		wide.addEventListener('change', frame);
		gsap.fromTo(card, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.3 });

		/**
		 * Pins the active point's labels to their parts, after each frame, and
		 * fades out any whose part has turned away or gone behind another
		 * (the scene tests them against what it drew).
		 */
		let anchored = -2;
		const pinNotes = () => {
			if (!scene || active < 0) return;
			if (anchored !== active) {
				anchored = active;
				scene.setAnchors(points[active].notes.map((n) => ({ name: n.at, p: ANCHORS[n.at] })));
			}
			noteEls[active]?.forEach((el, k) => {
				const at = points[active].notes[k].at;
				const p = scene!.project(ANCHORS[at], at);
				el.style.visibility = p ? 'visible' : 'hidden';
				if (p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
				const seen = scene!.anchorVisible(at) ? '1' : '0';
				if (el.dataset.seen !== seen) {
					el.dataset.seen = seen;
					gsap.to(el, { opacity: Number(seen), duration: 0.3, ease: 'power2.out', overwrite: true });
				}
			});
		};
		const stopTick = onTick(() => {
			scene?.render(gsap.ticker.time);
			pinNotes();
		});

		// Editing the hash (#1–#7) goes to that point too.
		const onHash = () => {
			const n = Number(location.hash.slice(1));
			go(Number.isInteger(n) && n >= 1 && n <= points.length ? n - 1 : -1);
		};
		addEventListener('hashchange', onHash);

		import('$lib/three/SystemScene')
			.then(async ({ SystemScene }) => {
				if (destroyed) return;
				const light = matchMedia('(pointer: coarse)').matches || innerWidth < 768;
				const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
				scene = new SystemScene(host, { light, still, look, onProgress: (f) => (progress = f) });
				// Scriptable from the console.
				if (import.meta.env.DEV) {
					const w = window as unknown as Record<string, unknown>;
					w.__system = scene;
					w.__go = go;
				}
				frame();
				// The timeline only touches `state`: built before the models land,
				// so choosing a point during the load still lands in the right place.
				choreography = buildChoreography(scene.state);
				scene.setCameraPath(choreography.keys);
				if (start >= 0) choreography.go(start, { instant: true });
				await scene.load();
				if (destroyed) return;
				gsap.to(loader, { autoAlpha: 0, duration: 0.9, ease: 'power2.out' });
			})
			.catch((e) => {
				console.error(e);
				failed = true;
			});

		return () => {
			destroyed = true;
			wide.removeEventListener('change', frame);
			removeEventListener('hashchange', onHash);
			stopTick();
			choreography?.kill();
			gsap.killTweensOf(card);
			scene?.destroy();
		};
	});
</script>

<svelte:window {onkeydown} {ontouchstart} {ontouchend} />

<svelte:head>
	<title>Systems — Antares</title>
	<meta name="description" content="The R1 microreactor's seven systems, from the shield to the grid." />
</svelte:head>

<div class="page">
	<div class="stage" bind:this={host} aria-hidden="true"></div>

	<div class="notes" aria-hidden="true">
		{#each points as point, i (point.title)}
			<div class="note-layer" bind:this={noteLayers[i]}>
				{#each point.notes as note, k (note.at)}
					<div class="note" bind:this={noteEls[i][k]}>
						<span class="dot"></span>
						<span class="type-caption label">{note.text}</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<div class="loader" bind:this={loader}>
		<p class="type-caption">{failed ? 'The 3D scene couldn’t start' : `Loading the reactor ${Math.round(progress * 100)}%`}</p>
	</div>

	<nav class="rail" aria-label="Systems">
		<ol>
			{#each points as point, i (point.title)}
				<li>
					<button class="type-caption" class:active={active === i} aria-current={active === i} onclick={() => go(i)}>
						<span class="type-tabular">{pad(i + 1)}</span>
						<span class="name">{point.title}</span>
					</button>
				</li>
			{/each}
		</ol>
	</nav>

	<div class="card" class:opening={shown < 0} bind:this={card} aria-live="polite">
		{#if copy}
			<p class="type-caption muted"><span class="type-tabular">{pad(shown + 1)} / {pad(points.length)}</span></p>
			<h2 class="type-h3">{copy.title}</h2>
			<p class="type-caption muted">{copy.text}</p>
		{:else}
			<p class="type-caption muted">{intro.label}</p>
			<h1 class="type-h3">{intro.title}</h1>
			<p class="type-caption muted">{intro.text}</p>
		{/if}
		<div class="controls">
			{#if shown < 0}
				<button class="type-caption next" onclick={() => go(0)}>Start</button>
			{:else}
				<button class="type-caption" onclick={() => go(shown - 1)} aria-label="Previous system">Previous</button>
				{#if shown < points.length - 1}
					<button class="type-caption next" onclick={() => go(shown + 1)} aria-label="Next system">Next</button>
				{:else}
					<button class="type-caption next" onclick={() => go(-1)}>Back to the start</button>
				{/if}
			{/if}
		</div>
	</div>

	{#if comparing}
		<div class="look" role="group" aria-label="Close-up look">
			<button class="type-caption" aria-pressed={look === 'studio'} onclick={() => setLook('studio')}>Studio</button>
			<button class="type-caption" aria-pressed={look === 'lowkey'} onclick={() => setLook('lowkey')}>Low-key</button>
		</div>
	{/if}
</div>

<style>
	/* One screen: nothing scrolls. */
	.page {
		position: relative;
		height: 100svh;
		overflow: hidden;
		background: var(--grey-950);
		color: var(--grey-0);
	}

	.stage {
		position: absolute;
		inset: 0;
	}

	.stage :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
	}

	.stage:global([data-dragging]) :global(canvas) {
		cursor: grabbing;
	}

	/* Labels pinned to the model: a dot on the part, the name beside it. */
	.notes {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.note-layer {
		position: absolute;
		inset: 0;
		visibility: hidden;
		opacity: 0;
	}

	.note {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
	}

	.dot {
		position: absolute;
		width: var(--space-8);
		height: var(--space-8);
		border-radius: 50%;
		background: var(--accent-500);
		box-shadow: 0 0 0 var(--space-4) var(--grey-950);
		transform: translate(-50%, -50%);
	}

	.label {
		position: absolute;
		left: var(--space-16);
		top: 0;
		color: var(--grey-0);
		white-space: nowrap;
		transform: translateY(-50%);
	}

	.loader {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: var(--grey-950);
		color: var(--grey-400);
		pointer-events: none;
	}

	/* The copy, in the corner, clear of the model in the middle. */
	.card {
		position: absolute;
		left: var(--space-40);
		bottom: var(--space-40);
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		max-width: 20rem;
		visibility: hidden;
	}

	/* The opening's title is larger: room for it on one line. */
	.card.opening {
		max-width: 26rem;
	}

	.card h1,
	.card h2,
	.card p {
		margin: 0;
	}

	.muted {
		color: var(--grey-400);
	}

	.controls {
		display: flex;
		gap: var(--space-8);
		margin-top: var(--space-8);
	}

	.controls button {
		padding: var(--space-8) var(--space-16);
		border: 0;
		border-radius: var(--space-24);
		background: var(--grey-800);
		color: var(--grey-0);
		cursor: pointer;
	}

	.controls .next {
		background: var(--grey-0);
		color: var(--grey-950);
	}

	.rail {
		position: absolute;
		top: 50%;
		right: var(--space-40);
		transform: translateY(-50%);
		z-index: 2;
	}

	.rail ol {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-8);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rail button {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		padding: var(--space-4) 0;
		border: 0;
		background: none;
		color: var(--grey-500);
		cursor: pointer;
	}

	.rail button.active {
		color: var(--grey-0);
	}

	/* Names show for the active point, and on hover. */
	.rail .name {
		display: none;
	}

	.rail button.active .name,
	.rail button:hover .name {
		display: inline;
	}

	/* Compares the close-ups' two looks: only with ?look in the URL. */
	.look {
		position: absolute;
		right: var(--space-40);
		bottom: var(--space-40);
		z-index: 2;
		display: flex;
		gap: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--space-8);
		background: var(--grey-800);
	}

	.look button {
		padding: var(--space-4) var(--space-8);
		border: 0;
		border-radius: var(--space-4);
		background: none;
		color: var(--grey-400);
		cursor: pointer;
	}

	.look button[aria-pressed='true'] {
		background: var(--grey-0);
		color: var(--grey-950);
	}

	@media (max-width: 767px) {
		.rail {
			display: none;
		}

		.card {
			left: var(--space-24);
			right: var(--space-24);
			bottom: var(--space-24);
			max-width: none;
		}

		.look {
			top: var(--space-80);
			right: var(--space-24);
			bottom: auto;
		}
	}
</style>
