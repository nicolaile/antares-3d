/**
 * Pipe geometry from a centreline.
 *
 * A pipe is a polyline with a rounded corner at every interior point. From
 * that one description come the route the energy travels (the centreline)
 * and the two walls the diagram draws, offset half a bore either side with
 * their corner radii grown or shrunk to stay concentric. Drawing walls as
 * their own hairlines, rather than a wide stroke with a narrower one on top,
 * keeps every line the same weight at any size.
 */

export type Point = readonly [number, number];

export interface Pipe {
	/** Centreline, in flow order. */
	points: Point[];
	/** Centreline corner radius, one per interior point, or one for all. */
	radius: number | number[];
}

/** Wall centre to wall centre. */
export const BORE = 27;

const unit = (a: Point, b: Point): Point => {
	const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
	return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const n = (v: number) => +v.toFixed(2);

function radii(pipe: Pipe): number[] {
	const count = Math.max(0, pipe.points.length - 2);
	return typeof pipe.radius === 'number' ? Array(count).fill(pipe.radius) : pipe.radius;
}

/** SVG path for a polyline with filleted corners. */
function fillet(points: Point[], r: number[]): string {
	let d = `M${n(points[0][0])} ${n(points[0][1])}`;
	for (let i = 1; i < points.length - 1; i++) {
		const vin = unit(points[i - 1], points[i]);
		const vout = unit(points[i], points[i + 1]);
		const turn = Math.acos(Math.max(-1, Math.min(1, vin[0] * vout[0] + vin[1] * vout[1])));
		const t = r[i - 1] * Math.tan(turn / 2);
		const [x, y] = points[i];
		// y points down, so a positive cross product is a clockwise turn.
		const sweep = cross(vin, vout) > 0 ? 1 : 0;
		d += `L${n(x - vin[0] * t)} ${n(y - vin[1] * t)}`;
		d += `A${n(r[i - 1])} ${n(r[i - 1])} 0 0 ${sweep} ${n(x + vout[0] * t)} ${n(y + vout[1] * t)}`;
	}
	const last = points[points.length - 1];
	return d + `L${n(last[0])} ${n(last[1])}`;
}

/** The centreline as a path: what the energy follows. */
export function centreline(pipe: Pipe): string {
	return fillet(pipe.points, radii(pipe));
}

/** Both walls as paths. */
export function walls(pipe: Pipe, bore = BORE): [string, string] {
	const h = bore / 2;
	const pts = pipe.points;
	const r = radii(pipe);
	const dirs = pts.slice(1).map((p, i) => unit(pts[i], p));
	// Right-hand normal of travel (y down).
	const normals = dirs.map(([x, y]): Point => [-y, x]);

	const side = (s: 1 | -1): string => {
		const out: Point[] = [[pts[0][0] + normals[0][0] * h * s, pts[0][1] + normals[0][1] * h * s]];
		const rr: number[] = [];
		for (let i = 1; i < pts.length - 1; i++) {
			const a = normals[i - 1];
			const b = normals[i];
			// Mitre point of the two offset segments.
			const k = (h * s) / (1 + a[0] * b[0] + a[1] * b[1]);
			out.push([pts[i][0] + (a[0] + b[0]) * k, pts[i][1] + (a[1] + b[1]) * k]);
			// The wall on the inside of a turn has the tighter radius.
			rr.push(r[i - 1] - s * h * Math.sign(cross(dirs[i - 1], dirs[i])));
		}
		const e = pts.length - 1;
		const ne = normals[e - 1];
		out.push([pts[e][0] + ne[0] * h * s, pts[e][1] + ne[1] * h * s]);
		return fillet(out, rr);
	};
	return [side(1), side(-1)];
}
