/**
 * The model's look, as dialled in through the render controls panel.
 *
 * Applied after the model loads and after the studio toggle, which swaps in
 * its own lighting preset — so these are the values you actually see, and
 * the controls panel's Reset returns to them. To change the look, tune it in
 * the panel (dev, or `?controls`), then copy the readouts here.
 *
 * Lives in a .ts file because the colours are render values, not UI colour:
 * the colour system's check covers markup and styles, not the renderer.
 */
import type { RenderParams } from './ModelViewer';

export const LOOK: Partial<RenderParams> = {
	// First: switching studio on applies its own lighting preset, and every
	// value below has to land on top of that. Object order is apply order.
	studio: 1,

	// Material
	color: '#dedede',
	roughness: 0.55,
	metalness: 1,
	clearcoat: 0.3,
	coatRoughness: 0.5,
	materialEnv: 0.8,

	// Light
	key: 9,
	rim: 0,
	ambient: 0,
	environment: 0.3,
	exposure: 1.13,

	// Gradient map: off, kept tuned for when it's switched on.
	gradient: 0,
	gradientAmount: 1,
	gradientScatter: 0,
	gradientFrequency: 2,
	gradientOffset: 1,
	gradientTrack: 0,

	// Studio: on. The backdrop matches the panel's Fog (grey-100), so the
	// sweep reads as the panel itself rather than a box inside it.
	sweepLight: '#eeeeee',
	sweepDark: '#eeeeee',
	sweepAngle: 0,
	sweepMid: 0.49,
	sweepSpread: 1,
	sweepCurve: 1.4,
	sweepLift: 0,
	sweepFalloff: 0.55,
	shadeAzimuth: 360,
	shadeElevation: 58,
	shadeCoverage: 0.26,
	shadeSoftness: 0.68,
	shadeDepth: 1,
	studioBounce: 0,
	studioKey: 1,
	studioGrain: 0.165,
	studioGrainSize: 1,
	studioGrainSpeed: 0,

	// Post
	ao: 1
};
