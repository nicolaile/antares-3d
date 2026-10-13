import type { Attachment } from 'svelte/attachments';
import { SplitText } from 'gsap/SplitText';
import { gsap, prefersReducedMotion } from '$lib/scroll';

gsap.registerPlugin(SplitText);

/**
 * Osmo's masked text reveal: the text is split, each line wrapped in its
 * own mask, and the lines (or words, or letters) rise into it from below
 * the first time it scrolls into view. Split again whenever it reflows
 * (fonts arriving, a resize); the returned tween is reverted with each
 * split, so animations never stack. With reduced motion it's simply there.
 *
 * An attachment: `<h2 {@attach splitReveal()}>`, or `splitReveal('words')`.
 */
export type SplitRevealType = 'lines' | 'words' | 'chars';

const splitConfig = {
	lines: { duration: 0.8, stagger: 0.08 },
	words: { duration: 0.6, stagger: 0.06 },
	chars: { duration: 0.4, stagger: 0.01 }
};

export function splitReveal(type: SplitRevealType = 'lines'): Attachment<HTMLElement> {
	return (heading) => {
		if (prefersReducedMotion()) return;
		// Only split as far as the animation needs.
		const typesToSplit = type === 'lines' ? ['lines'] : type === 'words' ? ['lines', 'words'] : ['lines', 'words', 'chars'];
		// Not Osmo's `clamp()`: text already on screen at the top of the page
		// would get a start of 0, which the page sitting at 0 never passes, so
		// it stayed hidden until the first scroll. Unclamped, it's passed, and
		// plays on load.
		// Once it has played, a fresh split (a resize, fonts arriving) leaves
		// the lines where they are: a new tween would hide them again, and its
		// trigger, already passed, can't be relied on to show them.
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
