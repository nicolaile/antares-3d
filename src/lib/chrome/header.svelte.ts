/**
 * Header state shared by the wordmark, the bar and the menu button. A
 * module-level `$state` singleton: safe because pages are prerendered and
 * state lives per tab. Driven by the native scroll (which Lenis moves).
 */
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

/**
 * Px a change of direction must run before it counts: more going down so a
 * wobble at the end of a scroll doesn't hide the wordmark, little going up.
 */
const DEAD_ZONE = 8;
const DEAD_ZONE_UP = 3;

/** Shared by the wordmark and the bar so they move together. */
export const SHOW = { duration: 0.6, ease: 'expo.out' };
export const HIDE = { duration: 0.3, ease: 'power2.in' };

class Header {
	/** Scrolling down: the wordmark slides away; the menu button stays. */
	hidden = $state(false);
	/** Scrolling back up mid-page: the bar slides in behind the wordmark and button. */
	backed = $state(false);
	/** The menu button's tone; matches `barDark`. */
	dark = $state(false);
	/** Over `data-tone="dark"`, unless also `data-header="light"` (Missions' slideshow). */
	barDark = $state(false);
	/** The wordmark's tone: the bar's while the bar is behind it, else what's under the wordmark itself. */
	markDark = $state(false);
	/** Near the top the wordmark scrolls with the page by this many px; null once it has left. */
	follow = $state<number | null>(0);
}

export const header = new Header();

// Root-font units; keep in step with app.css --header-* (and --page-margin).
const MARGIN = 1.25;
const BUTTON = 2.125;

/** Keep in step with app.css --header-height. */
const BAR = 4.25;

export function headerHeight() {
	const unit = parseFloat(getComputedStyle(document.body).fontSize);
	return unit * BAR;
}

/** Whether the point on the header's centre line, at `x`, is inside an element matching `selector`. */
function under(selector: string, x = menuX()) {
	const unit = parseFloat(getComputedStyle(document.body).fontSize);
	const y = unit * (BAR / 2);
	return [...document.querySelectorAll(selector)].some((el) => {
		const r = el.getBoundingClientRect();
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	});
}

/** The menu button's centre. */
function menuX() {
	const unit = parseFloat(getComputedStyle(document.body).fontSize);
	return window.innerWidth - unit * (MARGIN + BUTTON / 2);
}

/** Just inside the wordmark's left edge. */
function markX() {
	const unit = parseFloat(getComputedStyle(document.body).fontSize);
	return unit * (MARGIN + 0.5);
}

let lastY = 0;
/** The page is scrolling itself (a slideshow settling), so the header holds still. */
let frozen = false;

/** Holds the header as it is while the page scrolls itself, and lets it go again. */
export function freezeHeader(on: boolean) {
	frozen = on;
	lastY = Math.max(0, window.scrollY);
	run = 0;
}
/** Signed distance run in the current direction. */
let run = 0;

/**
 * Re-reads the header from the scroll position. Also run after a navigation
 * or a jump, with `reset`, so a new page starts with the header showing.
 */
export function updateHeader(reset = false) {
	step(reset);
	tone();
}

function step(reset: boolean) {
	const y = Math.max(0, window.scrollY);
	if (reset) {
		lastY = y;
		run = 0;
		header.hidden = false;
		header.backed = false;
		header.follow = y < headerHeight() ? y : null;
		return;
	}

	const dy = y - lastY;
	lastY = y;
	if (dy === 0 || frozen) return;
	run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;

	// Back at the top: the wordmark sits in the page again.
	if (y <= 1) header.follow = 0;
	// Leaving the top, it goes up with the page, as if it weren't fixed,
	// until it's clear of the screen; then it's hidden, as on any scroll down.
	if (header.follow !== null) {
		if (y < headerHeight()) {
			header.follow = y;
			header.hidden = false;
			header.backed = false;
			return;
		}
		header.follow = null;
		header.hidden = true;
		header.backed = false;
		return;
	}

	// Near the top, coming back up: the wordmark shows, no bar yet.
	if (y <= headerHeight()) {
		header.hidden = run > DEAD_ZONE;
		header.backed = false;
		return;
	}
	if (run > DEAD_ZONE) {
		header.hidden = true;
		header.backed = false;
	} else if (run < -DEAD_ZONE_UP) {
		header.hidden = false;
		header.backed = true;
	}
}

function tone() {
	header.barDark = under('[data-tone="dark"]') && !under('[data-header="light"]');
	header.dark = header.barDark;
	header.markDark = header.backed ? header.barDark : under('[data-tone="dark"]', markX());
}

/** Starts following the scroll. Returns the cleanup. */
export function trackHeader() {
	const onScroll = () => updateHeader();
	const onResize = tone;
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize);
	updateHeader(true);
	return () => {
		window.removeEventListener('scroll', onScroll);
		window.removeEventListener('resize', onResize);
	};
}

/**
 * Attachment: the wordmark white over dark sections and black over light,
 * switching at once, as the bar and menu button do. `{@attach markTone}`
 */
export function markTone(el: HTMLElement) {
	const color = getComputedStyle(el)
		.getPropertyValue(header.markDark ? '--white' : '--black')
		.trim();
	gsap.set(el, { color, overwrite: 'auto' });
}

/**
 * Attachment that slides an element off the top while `hide()` is true (fades
 * with reduced motion). While `follow()` returns a number, the element is
 * offset by that many px instead. The first state is set without animating.
 * `{@attach slideWithHeader(() => header.hidden)}`
 */
export function slideWithHeader(hide: () => boolean, follow?: () => number | null) {
	let first = true;
	return (el: HTMLElement) => {
		const away = hide();
		const by = follow?.() ?? null;
		// Far enough up that its bottom edge clears the top of the screen.
		const off = () => -(el.getBoundingClientRect().bottom - (gsap.getProperty(el, 'y') as number)) - 4;
		if (by !== null) {
			gsap.killTweensOf(el);
			gsap.set(el, { y: -by, autoAlpha: 1 });
		} else if (prefersReducedMotion()) {
			gsap.to(el, { autoAlpha: away ? 0 : 1, duration: first ? 0 : 0.2, overwrite: true });
		} else if (first) {
			gsap.set(el, { y: away ? off() : 0 });
		} else {
			gsap.to(el, away ? { y: off(), ...HIDE, overwrite: true } : { y: 0, ...SHOW, overwrite: true });
		}
		first = false;
	};
}
