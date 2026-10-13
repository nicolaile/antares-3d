import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

export type ParallaxOptions = {
	/** In % of its own size. */
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

/**
 * Moves the element (or a `[data-parallax="target"]` inside it) from `start`
 * to `end`, scrubbed to the scroll. For an image inside a frame, put this on
 * the frame (overflow hidden) and mark a taller wrapper (say 120%) as the
 * target, so the image moves without showing an edge.
 * `<div {@attach parallax({ start: 20, end: -20 })}>`
 */
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
		// So a nested parallax keeps its own target: a target belongs to the nearest trigger.
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
