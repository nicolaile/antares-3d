import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

const defaults = {
	duration: 1,
	ease: 'power3.out',
	digitStagger: 0.04,
	triggerStart: 'top 100%',
	/** Times 0–9 repeats in each strip, so every digit rolls forward. */
	digitCycles: 2
};

/** Line height over font size: one digit's step in the strip. */
function lineHeightRatio(el: HTMLElement) {
	const cs = getComputedStyle(el);
	return cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
}

/**
 * Each digit rolls up through a 0–9 strip, right to left, landing on the
 * element's own text the first time it scrolls into view. Non-digits stay
 * put; plain text is restored once landed.
 * `<span {@attach odometer()}>10.000.000</span>`
 */
export function odometer({
	duration = defaults.duration,
	delay = 0,
	travel,
	ease = defaults.ease,
	digitStagger = defaults.digitStagger
}: {
	duration?: number;
	delay?: number;
	/** Steps each digit rolls to land, instead of all the way up from 0: a calmer roll. */
	travel?: number;
	ease?: string;
	digitStagger?: number;
} = {}): Attachment<HTMLElement> {
	return (el) => {
		if (prefersReducedMotion()) return;
		const text = el.textContent?.trim() ?? '';
		const step = lineHeightRatio(el);
		const box = 'display:inline-block;overflow:clip;padding:0.05em;margin:-0.05em;';

		// Kerned advances, so the cells add up to the number's own width and
		// nothing after it shifts when the plain text comes back.
		el.textContent = text;
		const node = el.firstChild as Text;
		const range = document.createRange();
		const em = parseFloat(getComputedStyle(el).fontSize);
		const edges = Array.from({ length: text.length + 1 }, (_, i) => {
			range.setStart(node, Math.min(i, text.length - 1));
			range.setEnd(node, Math.min(i, text.length - 1) + 1);
			const r = range.getBoundingClientRect();
			return i < text.length ? r.left : r.right;
		});
		const widths = [...text].map((_, i) => (edges[i + 1] - edges[i]) / em);

		el.textContent = '';
		el.style.cssText += 'display:inline-flex;align-items:center;';
		// For screen readers, which would read the strips as 0–9.
		const label = document.createElement('span');
		label.className = 'visually-hidden';
		label.textContent = text;
		el.appendChild(label);
		const rollers: { roller: HTMLElement; target: number }[] = [];
		[...text].forEach((char, i) => {
			const cell = document.createElement('span');
			cell.style.cssText = `${box}box-sizing:content-box;width:${widths[i]}em;height:${step}em;line-height:${step};text-align:center;`;
			cell.setAttribute('aria-hidden', 'true');
			if (!/\d/.test(char)) {
				cell.dataset.odometerPart = 'static';
				cell.textContent = char;
				el.appendChild(cell);
				return;
			}
			cell.dataset.odometerPart = 'mask';
			const roller = document.createElement('span');
			roller.style.cssText = `display:block;white-space:pre;text-align:center;will-change:transform;line-height:${step};`;
			roller.textContent = Array.from({ length: 10 * defaults.digitCycles }, (_, d) => d % 10).join('\n');
			cell.appendChild(roller);
			el.appendChild(cell);
			const end = Number(char);
			// A 0 rolls a full turn to land. With `travel`, each digit starts that
			// many steps short of its place in the second turn.
			const target = travel ? 10 + end : end > 0 ? end : 10;
			if (travel) gsap.set(roller, { y: `${-(target - travel) * step}em` });
			rollers.push({ roller, target });
		});

		const done = () => (el.textContent = text);
		const tl = gsap.timeline({
			delay,
			scrollTrigger: { trigger: el, start: defaults.triggerStart, once: true },
			onComplete: done
		});
		rollers.forEach(({ roller, target }, i) => {
			const fromRight = rollers.length - 1 - i;
			tl.to(roller, { y: `${-target * step}em`, duration, ease, force3D: true }, fromRight * digitStagger);
		});

		return () => {
			tl.scrollTrigger?.kill();
			tl.kill();
			done();
		};
	};
}
