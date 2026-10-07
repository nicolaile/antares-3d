<!--
	@component
	A short label that trails the pointer, for things you click: "Next"
	over a slideshow's right half. Its top-left corner follows the pointer on
	quickTo, the text sitting below and right of it, clear of the arrow.
	While `active`, its letters rise into place through a mask (SplitText);
	when it goes, they carry on up and out. It lingers a moment before going,
	so sweeping from one target to the next keeps it up. Mouse and trackpad
	only: on touch there's no pointer to follow. With reduced motion it just
	appears.

	Optionally a `detail` after the text (a slideshow's "02-08", say) and an
	`icon` (raw SVG markup, drawn in the label's colour) before or after
	both; they rise in and out with the letters. When `detail` changes
	while the label is up, just the characters that changed roll in.

	Given `clip`, a selector, it only shows where it overlaps one of those
	elements (rounded corners included): cut off at a card's edge, and
	sliding out of one card and into the next as it trails across.

	Sits outside anything transformed, or `position: fixed` stops meaning
	the screen.
-->
<script lang="ts">
	import { SplitText } from 'gsap/SplitText';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		text,
		active = false,
		clip,
		linger: lingerFor = 0.2,
		detail,
		icon,
		iconAt = 'end'
	}: {
		text: string;
		/** Set after the text, a step apart. */
		detail?: string;
		/** Raw SVG markup; its stroke and fill colours give way to the label's. */
		icon?: string;
		iconAt?: 'start' | 'end';
		active?: boolean;
		clip?: string;
		/**
		 * Seconds it waits after leaving a target, in case the pointer lands
		 * on another. 0 for a pair of labels that hand over to each other.
		 */
		linger?: number;
	} = $props();

	let label: HTMLElement;
	let textEl: HTMLElement;
	let detailEl: HTMLElement;
	let iconEl: HTMLElement | undefined = $state();
	let textChars: Element[] = [];
	let detailChars: Element[] = [];
	let textSplit: SplitText | null = null;
	let detailSplit: SplitText | null = null;

	/** The icon's colours swapped for the label's. */
	const svg = $derived(
		icon?.replace(/(stroke|fill)="(?!none)[^"]*"/g, '$1="currentColor"')
	);

	/** Everything that rises and falls, in reading order. */
	function parts(): Element[] {
		const glyph = iconEl ? [iconEl] : [];
		const letters = [...textChars, ...detailChars];
		return iconAt === 'start' ? [...glyph, ...letters] : [...letters, ...glyph];
	}
	let exit: gsap.core.Tween | null = null;
	/** The pending hide, during the linger. */
	let linger: gsap.core.Tween | null = null;
	/** The letters are in, or on their way in. */
	let visible = false;
	let xTo: gsap.QuickToFunc | null = null;
	let yTo: gsap.QuickToFunc | null = null;
	let fine = $state(false);
	let pointer = { x: 0, y: 0 };
	/** The elements it's cut to, gathered as it appears. */
	let boxes: HTMLElement[] = [];
	/** Showing, or on its way out: worth clipping each frame. */
	let live = false;

	/**
	 * Cuts the label to every box it overlaps: one rounded rectangle per box,
	 * in the label's own coordinates, together in a single clip path.
	 */
	function cut() {
		if (!live || !clip) return;
		const x = gsap.getProperty(label, 'x') as number;
		const y = gsap.getProperty(label, 'y') as number;
		const w = label.offsetWidth;
		const h = label.offsetHeight;
		let d = '';
		for (const box of boxes) {
			const r = box.getBoundingClientRect();
			if (r.right < x || r.left > x + w || r.bottom < y || r.top > y + h) continue;
			const k = Math.min(parseFloat(getComputedStyle(box).borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
			const l = r.left - x;
			const t = r.top - y;
			const rt = l + r.width;
			const b = t + r.height;
			d += `M${l + k} ${t}H${rt - k}A${k} ${k} 0 0 1 ${rt} ${t + k}V${b - k}A${k} ${k} 0 0 1 ${rt - k} ${b}H${l + k}A${k} ${k} 0 0 1 ${l} ${b - k}V${t + k}A${k} ${k} 0 0 1 ${l + k} ${t}Z`;
		}
		// Over none of them: nothing shows.
		label.style.clipPath = `path('${d || 'M0 0Z'}')`;
	}

	$effect(() => {
		fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
		gsap.registerPlugin(SplitText);
		gsap.set(label, { autoAlpha: 0 });
		xTo = gsap.quickTo(label, 'x', { duration: 0.4, ease: 'power3.out' });
		yTo = gsap.quickTo(label, 'y', { duration: 0.4, ease: 'power3.out' });
		gsap.ticker.add(cut);
		return () => {
			gsap.ticker.remove(cut);
			textSplit?.revert();
			detailSplit?.revert();
		};
	});

	// The letters are set and split here rather than in the markup, since
	// SplitText rewrites them.
	$effect(() => {
		const t = text;
		textSplit?.revert();
		textEl.textContent = t;
		textSplit = SplitText.create(textEl, { type: 'chars', mask: 'chars' });
		textChars = textSplit.chars;
	});

	// A new detail while the label is up rolls in on its own, only the
	// characters that changed: "01-08" to "02-08" moves just the 2.
	$effect(() => {
		const d = detail ?? '';
		const before = detailChars.map((c) => c.textContent);
		detailSplit?.revert();
		detailEl.textContent = d;
		detailSplit = d ? SplitText.create(detailEl, { type: 'chars', mask: 'chars' }) : null;
		detailChars = detailSplit?.chars ?? [];
		const changed =
			before.length === detailChars.length
				? detailChars.filter((c, i) => c.textContent !== before[i])
				: detailChars;
		if (!visible || !changed.length || prefersReducedMotion()) return;
		gsap.fromTo(
			changed,
			{ yPercent: 100 },
			{ yPercent: 0, duration: 0.6, ease: 'power3.out', stagger: 0.015 }
		);
	});

	let shown = false;
	$effect(() => {
		const on = active && fine;
		if (on === shown) return;
		shown = on;
		if (on) reveal();
		else linger = gsap.delayedCall(lingerFor, hide);
	});

	function reveal() {
		linger?.kill();
		// Still up from the last target: it simply carries on following.
		if (visible) return;
		visible = true;
		// Start at the pointer, not gliding over from where it last was.
		xTo?.(pointer.x, pointer.x);
		yTo?.(pointer.y, pointer.y);
		// Stop an exit in flight, so it can't hide the label once it's back.
		exit?.kill();
		if (clip) boxes = [...document.querySelectorAll<HTMLElement>(clip)];
		live = true;
		cut();
		gsap.set(label, { autoAlpha: 1 });
		if (prefersReducedMotion()) return;
		gsap.fromTo(
			parts(),
			{ yPercent: 100 },
			{ yPercent: 0, duration: 0.6, ease: 'power3.out', stagger: 0.015, overwrite: true }
		);
	}

	function hide() {
		visible = false;
		if (prefersReducedMotion()) {
			live = false;
			gsap.set(label, { autoAlpha: 0 });
			return;
		}
		exit = gsap.to(parts(), {
			yPercent: -100,
			duration: 0.3,
			ease: 'power3.out',
			stagger: 0.008,
			overwrite: true,
			onComplete: () => {
				live = false;
				gsap.set(label, { autoAlpha: 0 });
			}
		});
	}

	function onpointermove(e: PointerEvent) {
		pointer = { x: e.clientX, y: e.clientY };
		if (!fine) return;
		xTo?.(e.clientX);
		yTo?.(e.clientY);
	}
</script>

<svelte:window {onpointermove} />

<div class="cursor-label type-caption" bind:this={label} aria-hidden="true">
	{#if svg && iconAt === 'start'}
		<span class="icon-mask"><span class="icon" bind:this={iconEl}>{@html svg}</span></span>
	{/if}
	<span bind:this={textEl}></span>
	<span class="detail" bind:this={detailEl}></span>
	{#if svg && iconAt === 'end'}
		<span class="icon-mask"><span class="icon" bind:this={iconEl}>{@html svg}</span></span>
	{/if}
</div>

<style>
	/* Text, detail and icon in a row, a step apart. */
	.cursor-label {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		position: fixed;
		top: 0;
		left: 0;
		z-index: 1;
		/* Off the pointer: 12px down and 20px right at 1440. */
		padding: calc(var(--space-8) + var(--space-4)) 0 0 var(--space-20);
		/* White: it sits on dark bands, like the slideshow's. */
		color: var(--grey-0);
		white-space: nowrap;
		pointer-events: none;
		visibility: hidden;
	}
	.detail:empty {
		display: none;
	}
	/* 16px at 1440, masked like the letters so it rises through its own box. */
	.icon-mask {
		display: block;
		overflow: hidden;
	}
	.icon {
		display: block;
		width: var(--space-16);
		height: var(--space-16);
	}
	.icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
