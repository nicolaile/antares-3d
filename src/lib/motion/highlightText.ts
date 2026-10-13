import type { Attachment } from 'svelte/attachments';
import { SplitText } from 'gsap/SplitText';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

gsap.registerPlugin(SplitText);

/**
 * Letters start faded and light up one after another, scrubbed to the
 * scroll. Re-split (and rebuilt) whenever the text reflows.
 * `<h2 {@attach highlightText()}>`
 */
export function highlightText({
	scrollStart = 'top 90%',
	scrollEnd = 'center 40%',
	/** Opacity before a letter is lit. */
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
