import type { Attachment } from 'svelte/attachments';
import { gsap, prefersReducedMotion } from '$lib/motion/scroll';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);
CustomEase.create('move', '0.3, 0.075, 0, 1');

/**
 * Hovering a card in a collage grows it while the others shrink and step
 * aside, the nearest moving most. On touch, a tap focuses and a second tap
 * (or one outside) resets. `{@attach collageFocus()}` on the collage:
 *
 *     [data-interactive-collage-list]            the area the cards sit in
 *       [data-interactive-collage-item]          each card, where it's placed
 *         [data-interactive-collage-item-inner]  what moves
 *
 * The focused card gets `[data-interactive-collage-focus]`.
 */
export function collageFocus({
	activeScale = 1.075,
	inactiveScale = 0.9,
	/** Gap cleared either side of the focused card, % of the collage's width. */
	gapPercent = 3,
	/** Extra movement for the second card away from the focused one. */
	secondCardBoost = 1.35,
	/** How far the others are pulled towards the vertical middle, %. */
	centerPullPercent = 25,
	duration = 0.8,
	ease = 'move'
} = {}): Attachment<HTMLElement> {
	return (root) => {
		if (prefersReducedMotion()) return;
		const list = root.querySelector<HTMLElement>('[data-interactive-collage-list]') ?? root;
		const items = [...root.querySelectorAll<HTMLElement>('[data-interactive-collage-item]')];
		if (!items.length) return;
		const isTouch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

		const controller = new AbortController();
		const { signal } = controller;
		let activeItem: HTMLElement | null = null;
		const getInner = (item: HTMLElement) =>
			item.querySelector<HTMLElement>('[data-interactive-collage-item-inner]') ?? item;

		const getMoveStrength = (distance: number) => {
			const strength = 1 / (1 + Math.pow(distance - 1, 1.2) * 0.45);
			return distance === 2 ? strength * secondCardBoost : strength;
		};

		const animateItem = (item: HTMLElement, xPercent: number, yPercent: number, scale: number) => {
			gsap.to(getInner(item), { xPercent, yPercent, scale, duration, ease, overwrite: true });
		};

		const resetCollage = () => {
			activeItem = null;
			items.forEach((item) => {
				item.removeAttribute('data-interactive-collage-focus');
				animateItem(item, 0, 0, 1);
			});
		};

		const focusItem = (active: HTMLElement) => {
			if (activeItem === active) return;
			activeItem = active;
			items.forEach((item) => item.toggleAttribute('data-interactive-collage-focus', item === active));

			const listRect = list.getBoundingClientRect();
			const listCenterY = listRect.top + listRect.height / 2;
			const gap = (listRect.width * gapPercent) / 100;

			const orderedItems = [...items].sort((a, b) => {
				const aRect = a.getBoundingClientRect();
				const bRect = b.getBoundingClientRect();
				return aRect.left + aRect.width / 2 - (bRect.left + bRect.width / 2);
			});

			const activeIndex = orderedItems.indexOf(active);
			const activeRect = active.getBoundingClientRect();
			const activeCenterX = activeRect.left + activeRect.width / 2;
			const activeLeft = activeCenterX - (activeRect.width * activeScale) / 2;
			const activeRight = activeCenterX + (activeRect.width * activeScale) / 2;

			const leftItem = orderedItems[activeIndex - 1];
			const rightItem = orderedItems[activeIndex + 1];
			let leftMove = 0;
			let rightMove = 0;
			if (leftItem) {
				const rect = leftItem.getBoundingClientRect();
				const itemRight = rect.left + rect.width / 2 + (rect.width * inactiveScale) / 2;
				leftMove = Math.min(0, activeLeft - gap - itemRight);
			}
			if (rightItem) {
				const rect = rightItem.getBoundingClientRect();
				const itemLeft = rect.left + rect.width / 2 - (rect.width * inactiveScale) / 2;
				rightMove = Math.max(0, activeRight + gap - itemLeft);
			}

			orderedItems.forEach((item, index) => {
				if (item === active) {
					animateItem(item, 0, 0, activeScale);
					return;
				}
				const rect = item.getBoundingClientRect();
				const difference = index - activeIndex;
				const distance = Math.abs(difference);
				const strength = getMoveStrength(distance);
				const itemCenterY = rect.top + rect.height / 2;
				const centerProgress = (listCenterY - itemCenterY) / (listRect.height / 2);
				const moveX = difference < 0 ? leftMove * strength : rightMove * strength;
				const scale = inactiveScale - (1 - strength) * 0.12;
				animateItem(item, (moveX / rect.width) * 100, centerPullPercent * centerProgress * strength, scale);
			});
		};

		const getHoveredItem = (event: PointerEvent) => {
			if (activeItem) {
				const rect = getInner(activeItem).getBoundingClientRect();
				if (
					event.clientX >= rect.left &&
					event.clientX <= rect.right &&
					event.clientY >= rect.top &&
					event.clientY <= rect.bottom
				) {
					return activeItem;
				}
			}
			return (
				document
					.elementFromPoint(event.clientX, event.clientY)
					?.closest<HTMLElement>('[data-interactive-collage-item]') ?? null
			);
		};

		if (isTouch) {
			items.forEach((item) => {
				item.addEventListener(
					'click',
					(event) => {
						event.stopPropagation();
						if (activeItem === item) resetCollage();
						else focusItem(item);
					},
					{ signal }
				);
			});
			document.addEventListener(
				'click',
				(event) => {
					if (!root.contains(event.target as Node)) resetCollage();
				},
				{ signal }
			);
		} else {
			root.addEventListener(
				'pointermove',
				(event) => {
					const item = getHoveredItem(event);
					if (item && root.contains(item)) focusItem(item);
					else resetCollage();
				},
				{ signal }
			);
			root.addEventListener('pointerleave', resetCollage, { signal });
		}

		return () => {
			controller.abort();
			gsap.killTweensOf(items.map(getInner));
		};
	};
}
