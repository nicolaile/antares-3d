import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, CustomEase);

/**
 * The menu's curve: a slow start, a long confident middle, a soft landing.
 * Also written as `cubic-bezier(0.48, 0.02, 0.03, 0.98)` wherever CSS
 * transitions use it (MenuButton). Keep the two in step.
 */
CustomEase.create('menu', '0.48, 0.02, 0.03, 0.98');

let lenis: Lenis | null = null;
let refs = 0;

/**
 * One clock for everything.
 *
 * Lenis, ScrollTrigger and the WebGL renderer each want their own rAF loop.
 * Running three loops means Lenis can update scroll *after* ScrollTrigger has
 * read it, which shows up as a one-frame lag between the copy and the 3D —
 * the classic "the model trails the text" bug. So: GSAP's ticker is the only
 * rAF in the app, it drives Lenis, and Lenis pushes ScrollTrigger.
 */
export function initScroll() {
	refs++;
	if (lenis) return lenis;

	// Smoothing is the vestibular trigger; with reduced motion the wheel maps 1:1.
	const reduce = prefersReducedMotion();
	// 0.14: catches up a little faster than Lenis's 0.1 default, so the page
	// still glides but no longer trails the wheel.
	lenis = new Lenis({ lerp: reduce ? 1 : 0.14, smoothWheel: !reduce });
	lenis.on('scroll', ScrollTrigger.update);
	if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lenis = lenis;

	gsap.ticker.add(tickLenis);
	// GSAP's lag smoothing skips frames after a stall, which makes scrub jump.
	gsap.ticker.lagSmoothing(0);

	return lenis;
}

function tickLenis(time: number) {
	// GSAP reports seconds, Lenis expects milliseconds.
	lenis?.raf(time * 1000);
}

/** The shared Lenis instance, once `initScroll` has run. */
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
	lenis.destroy();
	lenis = null;
}

export function prefersReducedMotion() {
	return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, ScrollTrigger };
