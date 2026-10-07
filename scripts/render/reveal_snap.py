"""The product reveal, after the reference motor film run backwards: Mark-0
starts laid out on its side as a horizontal exploded line, drifting; the
parts snap together fast and settle, while the whole thing rotates upright
and the camera pushes in to the hero angle.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render/reveal_snap.py -- \\
        [--scale percent] [--samples n] [--fps n] [--out dir] [--every n]

Same options and output as reveal.py; writes <out>/mark-0-reveal-snap.mp4.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reveal  # noqa: E402

SECONDS = 4.5

SPLIT = {
    "base": {"group": "f1_cradle", "z_below": 0.15},
    "drives": {"group": "f2_reactivity", "z_above": 2.5},
}
# The laid-out explode (as in lay-01): offsets along the reactor's axis,
# which the camera's roll turns into a horizontal line.
LAID = {"base": -0.8, "f2_reactivity": 3.4, "drives": 4.2, "f3_core": 6.2, "f4_heatpipes": 7.6}
# When each part snaps home (seconds). A slight stagger, inside out, so it
# reads as an assembly rather than one jump.
SNAP = {
    "f4_heatpipes": (1.2, 2.3),
    "f3_core": (1.25, 2.35),
    "drives": (1.35, 2.45),
    "f2_reactivity": (1.4, 2.5),
    "base": (1.45, 2.55),
}
# Before the snap the line drifts very slightly apart, as the reference's
# hold does.
DRIFT = 0.06


def snap(t):
    """The reference's move: a quick start that closes most of the gap in
    the first third, then a long, soft settle."""
    t = min(max(t, 0.0), 1.0)
    t = t * t * (3 - 2 * t) * 0.25 + t * 0.75
    return 1 - 2 ** (-10 * t) if t < 1 else 1.0


# Framing is driven directly rather than fitted to the moving parts, so the
# camera glides instead of jumping as the line closes. Model metres along
# the reactor's axis: the exploded line's centre is at z 4.75, the
# assembled reactor's at 1.55.
LINE_CENTRE, WHOLE_CENTRE = 4.75, 1.55
LINE_DISTANCE, WHOLE_DISTANCE = 31.0, 18.5

# One rotation drives everything else: the reactor itself turns from lying
# on its side to upright (in 3D, under fixed lights, so reflections slide
# across the metal), and the camera's framing follows the same curve.
TURN = (0.6, 3.9)
# The turn is about a horizontal axis 35 degrees off the line of sight, so
# the lying reactor recedes into depth instead of lying flat in the frame.
CAMERA_AZIMUTH = (18, 30)
AXIS_OFFSET = 25


def turn_at(time):
    t = (time - TURN[0]) / (TURN[1] - TURN[0])
    t = min(max(t, 0.0), 1.0)
    # Sine ease in-out: no sudden starts or stops.
    return 0.5 - 0.5 * math.cos(math.pi * t)


# Model-space extent along the axis of each part, assembled (metres).
EXTENT = {"base": (-0.07, 0.15), "f2_reactivity": (0.0, 3.34), "drives": (2.5, 3.35),
          "f3_core": (0.1, 2.52), "f4_heatpipes": (0.34, 2.78)}


def offsets_at(time):
    drift = 1 + DRIFT * min(time / SNAP["f4_heatpipes"][0], 1.0)
    return {g: d * drift * (1 - snap((time - SNAP[g][0]) / (SNAP[g][1] - SNAP[g][0]))) for g, d in LAID.items()}


def actual_centre(time):
    """Middle of the line as it stands at `time`, along the axis."""
    off = offsets_at(time)
    lo = min(-0.07, *(EXTENT[g][0] + off[g] for g in off))
    hi = max(3.35, *(EXTENT[g][1] + off[g] for g in off))
    return (lo + hi) / 2


def centre_at(time):
    """The camera's aim: the line's middle, averaged over half a second
    either side so the frame glides rather than snapping with the parts."""
    samples = [actual_centre(time + (k - 10) * 0.05) for k in range(21)]
    return sum(samples) / len(samples)


def spec_at(time):
    explode = {g: [0, 0, d] for g, d in offsets_at(time).items()}
    az = math.radians(CAMERA_AZIMUTH[0] + AXIS_OFFSET)
    return {
        "split": SPLIT,
        "explode": explode,
        # Negative: the top of the reactor leans away from the camera, so
        # the line recedes rather than coming at the lens.
        "tilt": {"angle": -90 * (1 - turn_at(time)), "axis": [math.cos(az), math.sin(az), 0],
                 "pivot": [0, 0, actual_centre(time)]},
    }


def camera_at(time):
    r = turn_at(time)
    drift = reveal.ease_in_out(time / SECONDS)
    return {
        "target": (0.0, 0.0, centre_at(time)),
        "distance": LINE_DISTANCE + (WHOLE_DISTANCE - LINE_DISTANCE) * r,
        "azimuth": CAMERA_AZIMUTH[0] + (CAMERA_AZIMUTH[1] - CAMERA_AZIMUTH[0]) * drift,
        "elevation": 4 + 6 * r,
        "zoom": 1.0,
        "lens": 85,
        "dof": 5.6,
        "focus_shift": 1.1 * r,
    }


if __name__ == "__main__":
    reveal.main(spec_at, camera_at, SECONDS, name="mark-0-reveal-snap", default_out="reveal-snap")
