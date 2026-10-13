import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, CustomEase);

/** Keep in step with the `cubic-bezier(0.48, 0.02, 0.03, 0.98)` in MenuButton's CSS. */
CustomEase.create('menu', '0.48, 0.02, 0.03, 0.98');

/** The person panel's slide. */
CustomEase.create('panel', '0.32, 0, 0, 0.97');

let lenis: Lenis | null = null;
let refs = 0;
/** Re-measures the scroll triggers when the page's height changes (see `initScroll`). */
let resized: ResizeObserver | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * One clock for everything: GSAP's ticker is the only rAF in the app; it
 * drives Lenis, and Lenis pushes ScrollTrigger. Separate loops let Lenis
 * update scroll after ScrollTrigger has read it, so the 3D trails the copy
 * by a frame. Ref-counted with `destroyScroll`.
 */
export function initScroll() {
	refs++;
	if (lenis) return lenis;

	// Smoothing is the vestibular trigger; with reduced motion the wheel maps 1:1.
	const reduce = prefersReducedMotion();
	// A little faster than Lenis's 0.1 default, so the page glides without trailing the wheel.
	lenis = new Lenis({ lerp: reduce ? 1 : 0.14, smoothWheel: !reduce });
	lenis.on('scroll', ScrollTrigger.update);
	if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lenis = lenis;

	gsap.ticker.add(tickLenis);
	// GSAP's lag smoothing skips frames after a stall, which makes scrub jump.
	gsap.ticker.lagSmoothing(0);

	// ScrollTrigger only re-measures on window resize, so content changing
	// height later (images arriving, a section opening) would leave pins in
	// the wrong place. Re-measure whenever the page's height settles.
	resized = new ResizeObserver(() => {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
	});
	resized.observe(document.body);

	return lenis;
}

function tickLenis(time: number) {
	lenis?.raf(time * 1000);
}

/** Null until `initScroll` has run. */
export function getLenis() {
	return lenis;
}

/** Register a per-frame callback (e.g. the renderer) on the shared ticker. */
export function onTick(fn: () => void) {
	gsap.ticker.add(fn);
	return () => gsap.ticker.remove(fn);
}

export function destroyScroll() {
	refs = Math.max(0, refs - 1);
	if (refs > 0 || !lenis) return;
	gsap.ticker.remove(tickLenis);
	resized?.disconnect();
	resized = null;
	clearTimeout(refreshTimer);
	lenis.destroy();
	lenis = null;
}

export function prefersReducedMotion() {
	return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, ScrollTrigger };
