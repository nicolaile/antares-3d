/**
 * A camera shot for the model viewer. Positions are in units of the model's
 * bounding radius, so a shot frames the same way whatever the model's scale.
 */
export type Shot = {
	/** Camera position. */
	pos: [number, number, number];
	/** Point the camera looks at. */
	target: [number, number, number];
	/** Extra turn of the model about its vertical axis, in radians. */
	spin: number;
	/**
	 * Lens, as vertical field of view in degrees. Defaults to 38. Narrower
	 * flattens perspective; move `pos` out by tan(19°) / tan(fov / 2) to keep
	 * the model the same size.
	 */
	fov?: number;
};
