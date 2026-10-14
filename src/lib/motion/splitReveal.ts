import type { Attachment } from 'svelte/attachments';
import { SplitText } from 'gsap/SplitText';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

gsap.registerPlugin(SplitText);

export type SplitRevealType = 'lines' | 'words' | 'chars';

const splitConfig = {
	lines: { duration: 0.8, stagger: 0.08 },
	words: { duration: 0.6, stagger: 0.06 },
	chars: { duration: 0.4, stagger: 0.01 }
};

/**
 * Masked text reveal: lines (or words, or letters) rise into per-line masks
 * the first time the text scrolls into view. Re-split whenever it reflows.
 * `<h2 {@attach splitReveal()}>`, or `splitReveal('words')`.
 */
export function splitReveal(type: SplitRevealType = 'lines'): Attachment<HTMLElement> {
	return (heading) => {
		if (prefersReducedMotion()) return;
		const typesToSplit =
			type === 'lines' ? ['lines'] : type === 'words' ? ['lines', 'words'] : ['lines', 'words', 'chars'];
		// Start is unclamped: clamped, text on screen at load would get a start
		// of 0, which a page sitting at 0 never passes, so it wouldn't play.
		// Once played, a re-split leaves the lines alone: a new tween would hide
		// them, and its already-passed trigger can't be relied on to show them.
		let played = false;
		const split = SplitText.create(heading, {
			type: typesToSplit.join(', '),
			mask: 'lines',
			autoSplit: true,
			linesClass: 'line',
			wordsClass: 'word',
			charsClass: 'letter',
			onSplit(instance) {
				if (played) return;
				const config = splitConfig[type];
				return gsap.from(instance[type], {
					yPercent: 110,
					duration: config.duration,
					stagger: config.stagger,
					ease: 'expo.out',
					scrollTrigger: { trigger: heading, start: 'top 80%', once: true, onEnter: () => (played = true) }
				});
			}
		});
		return () => split.revert();
	};
}
