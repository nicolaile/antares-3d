import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/scroll';

/**
 * Fades an element in the first time it scrolls into view, once its top
 * is a fifth of the way up the screen. With reduced motion it's simply
 * there.
 *
 * With `items`, a selector, it's those of its descendants that fade in
 * instead, one after another in page order, `stagger` seconds apart.
 *
 * Each element gets a `reveal` event as its fade starts, so what's inside
 * can make an entrance of its own (ReactorExplorer's model turns in).
 *
 * An attachment: `<div {@attach reveal()}>`, or on a layout `Cell`, which
 * passes it on to its element.
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
