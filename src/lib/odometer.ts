import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/scroll';

/**
 * Osmo's number odometer: each digit rolls up through a strip of 0–9, like
 * a mechanical counter, right to left, landing on the element's own text
 * the first time it scrolls into view. Anything that isn't a digit (a
 * separator, a unit) stays put. Once landed, the strips are swapped back
 * for plain digits. With reduced motion it's simply the number.
 *
 * An attachment: `<span {@attach odometer()}>10.000.000</span>`.
 */
const defaults = {
	duration: 1,
	ease: 'power3.out',
	digitStagger: 0.04,
	triggerStart: 'top 100%',
	/** How many times 0–9 repeats in each strip, so every digit rolls forward. */
	digitCycles: 2
};

/** The line's height as a share of the font size: one digit's step in the strip. */
function lineHeightRatio(el: HTMLElement) {
	const cs = getComputedStyle(el);
	return cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
}

export function odometer({
	duration = defaults.duration,
	delay = 0,
	travel,
	ease = defaults.ease,
	digitStagger = defaults.digitStagger
}: {
	duration?: number;
	delay?: number;
	/** How many steps each digit rolls to land, instead of all the way up from 0: a calmer roll. */
	travel?: number;
	ease?: string;
	digitStagger?: number;
} = {}): Attachment<HTMLElement> {
	return (el) => {
		if (prefersReducedMotion()) return;
		const text = el.textContent?.trim() ?? '';
		const step = lineHeightRatio(el);
		const box = 'display:inline-block;overflow:clip;padding:0.05em;margin:-0.05em;';

		// Each character's advance in the set text, kerning and all, so the
		// cells add up to exactly the number's own width: it keeps its spacing
		// while it rolls, and nothing after it (a unit) moves when the plain
		// text comes back.
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

		// Build: a clipped cell per digit holding its strip, statics as they are.
		el.textContent = '';
		el.style.cssText += 'display:inline-flex;align-items:center;';
		const rollers: { roller: HTMLElement; target: number }[] = [];
		[...text].forEach((char, i) => {
			const cell = document.createElement('span');
			cell.style.cssText = `${box}box-sizing:content-box;width:${widths[i]}em;height:${step}em;line-height:${step};text-align:center;`;
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
			// From 0: a 0 rolls a full turn to land, everything else straight up.
			// With `travel`, every digit starts that many steps short of its own
			// place in the second turn, and rolls only those.
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
