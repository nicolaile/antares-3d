import type { Attachment } from 'svelte/attachments';
import { SplitText } from 'gsap/SplitText';
import { gsap, prefersReducedMotion } from '$lib/scroll';

gsap.registerPlugin(SplitText);

/**
 * Osmo's highlight text on scroll: the text is split into letters, which
 * start faded and light up one after another as it scrolls through,
 * scrubbed to the scroll. Split again whenever it reflows; the animation is
 * rebuilt with it. With reduced motion it's simply lit.
 *
 * An attachment: `<h2 {@attach highlightText()}>`.
 */
export function highlightText({
	scrollStart = 'top 90%',
	scrollEnd = 'center 40%',
	/** The letters' opacity before they're lit. */
	fade = 0.2,
	/** Between letters: 1 lights them strictly one by one; lower is smoother. */
	stagger = 0.1
}: { scrollStart?: string; scrollEnd?: string; fade?: number; stagger?: number } = {}): Attachment<HTMLElement> {
	return (heading) => {
		if (prefersReducedMotion()) return;
		const split = new SplitText(heading, {
			type: 'words, chars',
			autoSplit: true,
			onSplit(self) {
				return gsap.context(() => {
					gsap
						.timeline({ scrollTrigger: { scrub: true, trigger: heading, start: scrollStart, end: scrollEnd } })
						.from(self.chars, { autoAlpha: fade, stagger, ease: 'linear' });
				});
			}
		});
		return () => split.revert();
	};
}
