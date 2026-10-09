/**
 * The header's state, shared by everything in it: the wordmark, the bar
 * behind it and the menu button.
 *
 * - `hidden`: the visitor is scrolling down, away from the top. The
 *   wordmark slides out of the way; the menu button stays.
 * - `backed`: the visitor is scrolling back up, still down the page. The
 *   bar slides in behind the wordmark and button.
 * - `barDark`: the colour the bar takes over what's under it: dark over
 *   anything marked `data-tone="dark"`, unless it's also marked
 *   `data-header="light"` (Missions' slideshow), which gets the white bar.
 * - `dark`: the menu button's tone, the same as the bar's: so over a
 *   `data-header="light"` section it stays light, bar or no bar.
 * - `follow`: from the very top of the page, the wordmark isn't fixed yet: it
 *   scrolls up with the page, this many px, until it's out of view. Null
 *   once it has left, or come back on a scroll up.
 *
 * Read from the native scroll (Lenis drives it, so its smoothing is
 * included). A change of direction only counts once it has run a few
 * pixels, so a wobble at the end of a scroll doesn't flicker the header.
 */
import { gsap, prefersReducedMotion } from '$lib/scroll';

/**
 * How far a change of direction must run before it counts, in px: further
 * going down, so a wobble doesn't hide the wordmark; hardly at all going
 * up, so it answers the moment the visitor turns back.
 */
const DEAD_ZONE = 8;
const DEAD_ZONE_UP = 3;

/**
 * The wordmark and the bar move together. Coming in: at full speed from
 * the first frame, then a long glide into place. Going: a quick pull away.
 */
export const SHOW = { duration: 0.6, ease: 'expo.out' };
export const HIDE = { duration: 0.3, ease: 'power2.in' };

class Header {
	hidden = $state(false);
	backed = $state(false);
	dark = $state(false);
	barDark = $state(false);
	follow = $state<number | null>(0);
}

export const header = new Header();

/** The menu button, in units of the root font size: one page margin from the right, 34px across. */
const MARGIN = 1.25;
const BUTTON = 2.125;

/** The header bar's height, in units: 68px at 1440. Keep in step with HeaderBar's CSS. */
const BAR = 4.25;

/** The header bar's height, in px. */
export function headerHeight() {
	const unit = parseFloat(getComputedStyle(document.body).fontSize);
	return unit * BAR;
}

/** Whether the point under the menu button's centre is inside an element matching `selector`. */
function under(selector: string) {
	const unit = parseFloat(getComputedStyle(document.body).fontSize);
	const x = window.innerWidth - unit * (MARGIN + BUTTON / 2);
	// Centred in the header band, as the button is.
	const y = unit * (BAR / 2);
	return [...document.querySelectorAll(selector)].some((el) => {
		const r = el.getBoundingClientRect();
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	});
}

let lastY = 0;
/** The page is being moved for the visitor (a slideshow settling): the header holds still. */
let frozen = false;

/** Holds the header as it is while the page scrolls itself, and lets it go again. */
export function freezeHeader(on: boolean) {
	frozen = on;
	lastY = Math.max(0, window.scrollY);
	run = 0;
}
/** How far the scroll has run in its current direction, signed. */
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

/** The tone under the header, given whether the bar is showing. */
function tone() {
	header.barDark = under('[data-tone="dark"]') && !under('[data-header="light"]');
	header.dark = header.barDark;
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
 * Slides an element up off the top of the screen while `hide()` is true, and
 * back down when it isn't, without fading (with reduced motion it fades in
 * place instead). With `follow`, while it returns a number the element is
 * moved up that many px instead, keeping pace with the page. The first
 * state is set at once, without animating.
 * Use as an attachment: `{@attach slideWithHeader(() => header.hidden)}`.
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
