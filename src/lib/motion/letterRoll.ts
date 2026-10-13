import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

/**
 * Made With GSAP's effect 041, calmer: hovering a line of text rolls its
 * letters down out of view while a copy drops in from above, rippling
 * out from the letter the pointer came in on. Lands softly, no overshoot.
 * Then the letters are swapped back for the plain text.
 *
 * Built on the first hover, not before, so it sits happily alongside
 * anything else that rewrites the text first (the odometer): while that's
 * still running, a hover does nothing. Each letter is set to its own
 * advance in the text, kerning and all, so nothing shifts as it's built.
 * Real pointers only; with reduced motion it's the still text.
 *
 * An attachment: `<span {@attach letterRoll()}>935MW</span>`.
 */
export function letterRoll({
	duration = 0.6,
	ease = 'power3.out',
	stagger = 0.023
}: { duration?: number; ease?: string; stagger?: number } = {}): Attachment<HTMLElement> {
	return (el) => {
		if (prefersReducedMotion() || !matchMedia('(hover: hover)').matches) return;
		let rolling = false;

		function build() {
			const text = el.textContent ?? '';
			const node = el.firstChild;
			if (!(node instanceof Text) || el.childNodes.length !== 1 || !text) return null;

			// Each character's advance in the set text, in em.
			const range = document.createRange();
			const em = parseFloat(getComputedStyle(el).fontSize);
			const widths = [...text].map((_, i) => {
				range.setStart(node, i);
				range.setEnd(node, i + 1);
				return range.getBoundingClientRect().width / em;
			});

			el.textContent = '';
			const visible: HTMLElement[] = [];
			const hidden: HTMLElement[] = [];
			[...text].forEach((char, i) => {
				// A clipped cell per letter: the letter, and its copy just above.
				const cell = document.createElement('span');
				cell.style.cssText = `position:relative;display:inline-block;overflow:clip;overflow-clip-margin:0.1em 0;width:${widths[i]}em;`;
				const a = document.createElement('span');
				const b = document.createElement('span');
				a.style.cssText = 'display:block;will-change:transform;';
				b.style.cssText = 'position:absolute;left:0;bottom:100%;display:block;will-change:transform;';
				a.textContent = b.textContent = char;
				b.setAttribute('aria-hidden', 'true');
				cell.append(a, b);
				el.appendChild(cell);
				visible.push(a);
				hidden.push(b);
			});
			return { text, visible, hidden, cells: [...el.children] };
		}

		const onOver = (e: MouseEvent) => {
			if (rolling) return;
			// The odometer (or anything else) still has the text in pieces.
			if (el.children.length) return;
			const parts = build();
			if (!parts) return;
			rolling = true;

			// The letter under the pointer, by where it is across.
			const x = e.clientX;
			let from = parts.cells.findIndex((c) => c.getBoundingClientRect().right >= x);
			if (from < 0) from = parts.cells.length - 1;

			const opts = { yPercent: 100, duration, ease, stagger: { each: stagger, from } };
			gsap.to(parts.visible, opts);
			gsap.to(parts.hidden, {
				...opts,
				onComplete: () => {
					el.textContent = parts.text;
					rolling = false;
				}
			});
		};

		el.addEventListener('mouseenter', onOver);
		return () => el.removeEventListener('mouseenter', onOver);
	};
}
