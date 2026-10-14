/**
 * What an open overlay (the menu, a person's panel) does to the rest of the
 * page. Each helper returns its own undo, so two overlays can't release what
 * the other still holds.
 */
import { getLenis } from '$lib/motion/scroll';

/**
 * Makes `keep`'s siblings and its ancestors' siblings (up to <body>) inert.
 * Anything already inert stays inert on release.
 */
export function inertOutside(keep: Element): () => void {
	const set: HTMLElement[] = [];
	for (let el: Element | null = keep; el && el !== document.body; el = el.parentElement) {
		for (const sibling of el.parentElement?.children ?? []) {
			if (sibling === el || !(sibling instanceof HTMLElement) || sibling.inert) continue;
			sibling.inert = true;
			set.push(sibling);
		}
	}
	return () => {
		for (const el of set) el.inert = false;
		set.length = 0;
	};
}

let locks = 0;

/**
 * Stops the page scrolling: Lenis where a page runs it, and `scroll-locked`
 * on <html> (app.css) for pages that don't. Counted, so the page scrolls
 * again only once every lock is released.
 */
export function lockScroll(): () => void {
	if (locks++ === 0) {
		getLenis()?.stop();
		document.documentElement.classList.add('scroll-locked');
	}
	let held = true;
	return () => {
		if (!held) return;
		held = false;
		if (--locks > 0) return;
		getLenis()?.start();
		document.documentElement.classList.remove('scroll-locked');
	};
}

/** `inertOutside` plus `lockScroll`. The undo is safe to call more than once. */
export function holdPage(keep: Element): () => void {
	const undo = [lockScroll(), inertOutside(keep)];
	return () => undo.splice(0).forEach((fn) => fn());
}
