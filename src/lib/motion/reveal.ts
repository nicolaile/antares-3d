import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

/**
 * Fades an element in the first time it scrolls into view. With `items` (a
 * selector), its matching descendants fade in instead, staggered.
 * Each target gets a `reveal` event as its fade starts, so what's inside can
 * make an entrance of its own (ReactorExplorer's model turns in).
 * `<div {@attach reveal()}>`, or on a layout `Cell`.
 */
export function reveal({
	items,
	duration = 1.2,
	delay = 0,
	stagger = 0.15
}: { items?: string; duration?: number; delay?: number; stagger?: number } = {}): Attachment<HTMLElement> {
	return (node) => {
		if (prefersReducedMotion()) return;
		const targets = items ? gsap.utils.toArray<HTMLElement>(node.querySelectorAll(items)) : node;
		const tween = gsap.from(targets, {
			autoAlpha: 0,
			duration,
			delay,
			stagger: {
				each: stagger,
				onStart(this: gsap.core.Tween) {
					(this.targets()[0] as HTMLElement).dispatchEvent(new CustomEvent('reveal'));
				}
			},
			ease: 'power2.out',
			scrollTrigger: { trigger: node, start: 'top 80%', once: true }
		});
		return () => {
			tween.scrollTrigger?.kill();
			tween.revert();
		};
	};
}
