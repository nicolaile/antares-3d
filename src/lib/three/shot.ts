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
	 * The model's whole turn about its vertical axis, radians, whatever its
	 * slow turn has done: a fixed view of it (head-on, say) rather than one
	 * turned to its open point (CadStage). Pair with a feature held still.
	 */
	turn?: number;
	/**
	 * Arriving from another model (CadStage): the model starts this much
	 * further round, radians, and turns into place as it's revealed.
	 */
	swing?: number;
	/** Likewise, how much further it starts leaning (`lean`), radians, straightening up as it's revealed. */
	swingLean?: number;
	/**
	 * Likewise, where the camera starts (and looks), in the shot's units,
	 * sweeping in to `pos` and `target` as the model is revealed.
	 */
	swingFrom?: { pos: [number, number, number]; target?: [number, number, number] };
	/** Seconds before the camera starts its move: waiting for the stage to be seen. */
	after?: number;
	/** Cut to the shot at once rather than gliding there: the stage isn't seen yet. */
	snap?: boolean;
	/**
	 * Lean of the whole model sideways, about the line of sight, in radians:
	 * positive leans its top to the left. Default 0, upright.
	 */
	lean?: number;
	/**
	 * Lens, as vertical field of view in degrees. Defaults to 38. Narrower
	 * flattens perspective; move `pos` out by tan(19°) / tan(fov / 2) to keep
	 * the model the same size.
	 */
	fov?: number;
	/**
	 * `point`: `pos` and `target` are offsets from the open point on the
	 * model rather than from its middle, once the model has turned the point
	 * to face the camera (CadStage). Frames a part off the model's centre.
	 */
	aim?: 'point';
};
