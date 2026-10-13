import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/scroll';

/**
 * Osmo's global parallax: the element (or a `[data-parallax="target"]`
 * inside it) moves from `start` to `end`, in % of its own size, while it
 * passes between `scrollStart` and `scrollEnd`, scrubbed to the scroll.
 * `disable` turns it off from a breakpoint down; gsap.matchMedia rebuilds
 * it as the screen crosses one. With reduced motion it holds still.
 *
 * An attachment: `<div {@attach parallax({ start: 20, end: -20 })}>`.
 *
 * For an image moving inside a frame: put this on the frame (overflow
 * hidden), and mark a taller wrapper inside it (say 120% high) as the
 * target, so the image has room to move without showing an edge.
 */
export type ParallaxOptions = {
	/** Where it starts and ends, in % of its own size. Defaults 20 and -20. */
	start?: number;
	end?: number;
	direction?: 'vertical' | 'horizontal';
	/** `true` follows the scroll exactly; a number is seconds to catch up. */
	scrub?: boolean | number;
	/** ScrollTrigger positions; default from entering to leaving the screen. */
	scrollStart?: string;
	scrollEnd?: string;
	/** Off at and below this breakpoint. */
	disable?: 'mobile' | 'mobileLandscape' | 'tablet';
};

export function parallax({
	start = 20,
	end = -20,
	direction = 'vertical',
	scrub = true,
	scrollStart = 'top bottom',
	scrollEnd = 'bottom top',
	disable
}: ParallaxOptions = {}): Attachment<HTMLElement> {
	return (trigger) => {
		if (prefersReducedMotion()) return;
		// Marked, so a parallax nested inside another keeps its own target:
		// a target belongs to the nearest trigger around it.
		trigger.setAttribute('data-parallax', 'trigger');
		const mm = gsap.matchMedia();
		mm.add(
			{
				isMobile: '(max-width: 479px)',
				isMobileLandscape: '(max-width: 767px)',
				isTablet: '(max-width: 991px)',
				isDesktop: '(min-width: 992px)'
			},
			(context) => {
				const { isMobile, isMobileLandscape, isTablet } = context.conditions ?? {};
				if (
					(disable === 'mobile' && isMobile) ||
					(disable === 'mobileLandscape' && isMobileLandscape) ||
					(disable === 'tablet' && isTablet)
				)
					return;

				const target =
					[...trigger.querySelectorAll<HTMLElement>('[data-parallax="target"]')].find(
						(el) => el.parentElement?.closest('[data-parallax="trigger"]') === trigger
					) || trigger;
				const prop = direction === 'horizontal' ? 'xPercent' : 'yPercent';
				gsap.fromTo(
					target,
					{ [prop]: start },
					{
						[prop]: end,
						ease: 'none',
						scrollTrigger: { trigger, start: `clamp(${scrollStart})`, end: `clamp(${scrollEnd})`, scrub }
					}
				);
			}
		);
		return () => mm.revert();
	};
}
