import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

/**
 * On hover, letters roll down out of view while a copy drops in from above,
 * rippling out from the letter the pointer entered on; then the plain text
 * is restored. Built on hover, not before, so it coexists with anything else
 * that rewrites the text (the odometer): while that runs, hover does nothing.
 * Each letter keeps its kerned advance, so nothing shifts as it's built.
 * `<span {@attach letterRoll()}>935MW</span>`
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
			// For screen readers, which would read the letters one by one.
			const label = document.createElement('span');
			label.className = 'visually-hidden';
			label.textContent = text;
			el.appendChild(label);
			const visible: HTMLElement[] = [];
			const hidden: HTMLElement[] = [];
			const cells: HTMLElement[] = [];
			[...text].forEach((char, i) => {
				// A clipped cell per letter: the letter, and its copy just above.
				const cell = document.createElement('span');
				cell.style.cssText = `position:relative;display:inline-block;overflow:clip;overflow-clip-margin:0.1em 0;width:${widths[i]}em;`;
				cell.setAttribute('aria-hidden', 'true');
				const a = document.createElement('span');
				const b = document.createElement('span');
				a.style.cssText = 'display:block;will-change:transform;';
				b.style.cssText = 'position:absolute;left:0;bottom:100%;display:block;will-change:transform;';
				a.textContent = b.textContent = char;
				cell.append(a, b);
				el.appendChild(cell);
				cells.push(cell);
				visible.push(a);
				hidden.push(b);
			});
			return { text, visible, hidden, cells };
		}

		const onOver = (e: MouseEvent) => {
			if (rolling) return;
			// Something else (the odometer) still has the text in pieces.
			if (el.children.length) return;
			const parts = build();
			if (!parts) return;
			rolling = true;

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
